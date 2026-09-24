import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './env.ts';
import { requireAuth } from './auth/middleware.ts';
import { requireModule } from './auth/perms.ts';
import { authRouter } from './routes/auth.ts';
import { contactsRouter } from './routes/contacts.ts';
import { pipelinesRouter } from './routes/pipelines.ts';
import { stagesRouter } from './routes/stages.ts';
import { opportunitiesRouter } from './routes/opportunities.ts';
import { tasksRouter } from './routes/tasks.ts';
import { usersRouter } from './routes/users.ts';
import { meRouter } from './routes/me.ts';
import { organizationRouter } from './routes/organization.ts';
import { dashboardRouter } from './routes/dashboard.ts';
import { notificationsRouter } from './routes/notifications.ts';
import { activityRouter } from './routes/activity.ts';
import { appointmentsRouter } from './routes/appointments.ts';
import { calendarSettingsRouter, calendarPublicRouter } from './routes/calendar-settings.ts';
import { calendarsRouter } from './routes/calendars.ts';
import { bookingRouter } from './routes/booking.ts';
import { conversationsRouter } from './routes/conversations.ts';
import { waSettingsRouter } from './routes/wa-settings.ts';
import { waWebhookRouter } from './routes/wa-webhook.ts';
import { socialRouter, socialPublicRouter, metaWebhookRouter, refreshInstagramTokens } from './routes/social.ts';
import { agencyRouter } from './routes/agency.ts';
import { automationsRouter } from './routes/automations.ts';
import { resumeTimedRuns } from './services/automation-engine.ts';
import { initWS } from './services/ws-manager.ts';
import { verifyToken } from './auth/tokens.ts';
import { pool } from './db.ts';

const app = express();

// Seguridad: headers HTTP (XSS, clickjacking, MIME sniffing, etc.)
app.use(helmet({
  // El frontend sirve desde el mismo origen, así que CSP puede ser estricto
  contentSecurityPolicy: false, // deshabilitado: el frontend lo maneja con Vite
  crossOriginEmbedderPolicy: false,
}));

// CORS restringido al dominio del frontend
const allowedOrigin = process.env.FRONTEND_URL || process.env.PUBLIC_URL || 'http://localhost:5175';
app.use(cors({
  origin: (origin, cb) => {
    // Permitir sin Origin (Tailscale, curl, apps nativas, webhooks)
    if (!origin) return cb(null, true);
    if (origin === allowedOrigin) return cb(null, true);
    cb(new Error('Origen no permitido por CORS'));
  },
  credentials: true,
}));

app.use(express.json({ limit: '4mb' }));

// Rate limiting en autenticación: máximo 15 intentos por IP cada 15 minutos
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera 15 minutos e inténtalo de nuevo.' },
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Rutas públicas (sin JWT)
app.use('/api/calendar', calendarPublicRouter);
app.use('/api/public/book', bookingRouter);
app.use('/api/wa/webhook', waWebhookRouter);  // autenticado por webhook_secret en URL
app.use('/api/meta', metaWebhookRouter);      // webhook Meta (FB/IG); verificado por verify_token
app.use('/api/social', socialPublicRouter);  // callback OAuth Facebook (sin auth)

app.use('/api/auth/login',    authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth', authRouter);

// Rutas de agencia (JWT separado con claim type='agency'; deben ir antes del requireAuth del CRM)
app.use('/api/agency', agencyRouter);

// Proxy de media — acepta token por query param ?t= para usarlo en <img src>.
// Cuando media_url es un data URI cacheado lo sirve directo; si no, pide
// el base64 a Evolution API y lo cachea para futuros accesos.
app.get('/api/media/:msgId', async (req, res) => {
  try {
    const token = req.query.t as string | undefined;
    if (!token) return res.status(401).end();
    const auth = verifyToken(token);

    type MsgRow = {
      media_url: string | null;
      media_mime: string | null;
      wa_message_id: string;
      evo_url: string;
      evo_api_key: string;
      instance_name: string;
      msg_raw: Record<string, unknown> | null;
    };
    const rowRes = await pool.query<MsgRow>(
      `SELECT cm.media_url, cm.media_mime, cm.wa_message_id,
              ws.evo_url, ws.evo_api_key, ws.instance_name
       FROM conv_messages cm
       JOIN wa_settings ws ON ws.organization_id = cm.organization_id
       WHERE cm.id = $1 AND cm.organization_id = $2`,
      [req.params.msgId, auth.organizationId],
    );
    const r = rowRes.rows[0];
    if (!r) return res.status(404).end();

    // Camino 1: data URI cacheado
    if (r.media_url?.startsWith('data:')) {
      const [header, b64] = r.media_url.split(',');
      const mime = header.split(':')[1]?.split(';')[0] ?? 'application/octet-stream';
      res.setHeader('Content-Type', mime);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(Buffer.from(b64, 'base64'));
    }

    // Camino 2: URL HTTP directa (por si Evolution entrega URL pública)
    if (r.media_url?.startsWith('http')) {
      const upstream = await fetch(r.media_url, {
        headers: r.evo_api_key ? { 'apikey': r.evo_api_key } : {},
      }).catch(() => null);
      if (upstream?.ok) {
        const mime = r.media_mime || upstream.headers.get('content-type') || 'application/octet-stream';
        res.setHeader('Content-Type', mime);
        res.setHeader('Cache-Control', 'public, max-age=3600');
        return res.send(Buffer.from(await upstream.arrayBuffer()));
      }
    }

    // Camino 3: descargar via Evolution API getBase64FromMediaMessage
    if (!r.wa_message_id || !r.evo_url || !r.evo_api_key) return res.status(404).end();

    const evoRes = await fetch(
      `${r.evo_url}/message/getBase64FromMediaMessage/${r.instance_name}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': r.evo_api_key },
        body: JSON.stringify({ message: { key: { id: r.wa_message_id } }, convertToMp4: false }),
      },
    ).catch(() => null);

    if (!evoRes?.ok) return res.status(404).end();
    const mediaJson = await evoRes.json() as { base64?: string; mimetype?: string };
    if (!mediaJson.base64) return res.status(404).end();

    const mime = mediaJson.mimetype ?? r.media_mime ?? 'application/octet-stream';
    const dataUri = mediaJson.base64.startsWith('data:') ? mediaJson.base64 : `data:${mime};base64,${mediaJson.base64}`;
    const rawB64 = dataUri.split(',')[1];
    const binary = Buffer.from(rawB64, 'base64');

    pool.query(
      'UPDATE conv_messages SET media_url = $1, media_mime = $2 WHERE id = $3',
      [dataUri, mime, req.params.msgId],
    ).catch(() => {});

    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(binary);
  } catch (e) {
    console.error('media proxy:', e);
    res.status(500).end();
  }
});

// Todo lo de abajo exige token válido.
app.use('/api/contacts', requireAuth, requireModule('contacts'), contactsRouter);
app.use('/api/pipelines', requireAuth, requireModule('opportunities'), pipelinesRouter);
app.use('/api/stages', requireAuth, requireModule('opportunities'), stagesRouter);
app.use('/api/opportunities', requireAuth, requireModule('opportunities'), opportunitiesRouter);
app.use('/api/tasks', requireAuth, requireModule('tasks'), tasksRouter);
app.use('/api/users', requireAuth, usersRouter);
app.use('/api/me', requireAuth, meRouter);
app.use('/api/organization', requireAuth, organizationRouter);
app.use('/api/dashboard', requireAuth, dashboardRouter);
app.use('/api/notifications', requireAuth, notificationsRouter);
app.use('/api/activity', requireAuth, activityRouter);
app.use('/api/appointments', requireAuth, appointmentsRouter);
app.use('/api/calendar', requireAuth, calendarSettingsRouter);
app.use('/api/calendars', requireAuth, calendarsRouter);
app.use('/api/conversations', requireAuth, conversationsRouter);
app.use('/api/wa', requireAuth, waSettingsRouter);
app.use('/api/automations', requireAuth, automationsRouter);
app.use('/api/social', requireAuth, socialRouter);

// Frontend estático (build de Vite). Solo activo si web/dist existe.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(__dirname, '../../web/dist');
app.use(express.static(webDist));
app.get(/^(?!\/api).*/, (_req, res) => {
  res.sendFile(path.join(webDist, 'index.html'));
});

// Manejador de errores central: cualquier throw async cae aquí sin tumbar el server.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// Crear servidor HTTP compartido (Express + WebSocket en el mismo puerto).
const server = http.createServer(app);
initWS(server);

server.listen(env.port, () => {
  console.log(`API en http://localhost:${env.port} | WS en ws://localhost:${env.port}/ws`);
  // Revisar cada 60s si hay esperas temporizadas listas para reanudar
  setInterval(() => resumeTimedRuns(), 60_000);
  // Refrescar tokens de Instagram cada 30 días; también al arrancar para renovar de inmediato si toca
  refreshInstagramTokens();
  setInterval(() => refreshInstagramTokens(), 30 * 24 * 60 * 60_000);
});
