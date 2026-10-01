import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './env.ts';
import { installErrorAlerts } from './services/alerts.ts';
import { checkWhatsappConnections } from './services/wa-monitor.ts';
import { resolveEvo } from './services/evolution.ts';
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
import { pollIgComments } from './services/ig-comments.ts';
import { leadAdsRouter } from './routes/lead-ads.ts';
import { agencyRouter } from './routes/agency.ts';
import { automationsRouter } from './routes/automations.ts';
import { resumeTimedRuns } from './services/automation-engine.ts';
import { initWS } from './services/ws-manager.ts';
import { verifyToken } from './auth/tokens.ts';
import { pool } from './db.ts';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';

const { version: APP_VERSION } = JSON.parse(
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf-8'),
) as { version: string };

installErrorAlerts();

const app = express();
// Detrás de Cloudflare: la IP real del cliente viene en X-Forwarded-For (lo necesita el rate limit)
app.set('trust proxy', 1);

// Seguridad: headers HTTP (XSS, clickjacking, MIME sniffing, etc.)
app.use(helmet({
  // El frontend sirve desde el mismo origen, así que CSP puede ser estricto
  contentSecurityPolicy: false, // deshabilitado: el frontend lo maneja con Vite
  crossOriginEmbedderPolicy: false,
}));

// CORS: permite localhost siempre (dev) + dominios configurados en producción
const allowedOrigins = new Set([
  process.env.FRONTEND_URL,
  process.env.PUBLIC_URL,
  'http://localhost:5173',
  'http://localhost:5175',
  'http://localhost:5176',
].filter(Boolean) as string[]);
app.use(cors({
  origin: (origin, cb) => {
    // Sin Origin: Tailscale, curl, apps nativas, webhooks → siempre OK
    if (!origin) return cb(null, true);
    // localhost siempre permitido en dev
    if (origin.startsWith('http://localhost')) return cb(null, true);
    if (allowedOrigins.has(origin)) return cb(null, true);
    cb(new Error('Origen no permitido por CORS'));
  },
  credentials: true,
}));

// El webhook de Meta necesita el cuerpo exacto para verificar su firma (X-Hub-Signature-256)
app.use(express.json({
  limit: '4mb',
  verify: (req, _res, buf) => {
    if ((req as express.Request).originalUrl?.startsWith('/api/meta/')) (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
  },
}));

// Rate limiting en autenticación: máximo 15 intentos por IP cada 15 minutos
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera 15 minutos e inténtalo de nuevo.' },
});

// Versión en todas las respuestas
app.use((_req, res, next) => { res.setHeader('X-App-Version', APP_VERSION); next(); });

app.get('/api/health', (_req, res) => res.json({ ok: true, version: APP_VERSION }));
app.get('/api/version', (_req, res) => res.json({ version: APP_VERSION }));

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
       WHERE cm.id = $1 AND cm.organization_id = $2
       ORDER BY ws.is_default DESC
       LIMIT 1`,
      [req.params.msgId, auth.organizationId],
    );
    const r = rowRes.rows[0];
    if (!r) return res.status(404).end();
    const evo = resolveEvo(r);

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
        headers: evo.apiKey ? { 'apikey': evo.apiKey } : {},
      }).catch(() => null);
      if (upstream?.ok) {
        const mime = r.media_mime || upstream.headers.get('content-type') || 'application/octet-stream';
        res.setHeader('Content-Type', mime);
        res.setHeader('Cache-Control', 'public, max-age=3600');
        return res.send(Buffer.from(await upstream.arrayBuffer()));
      }
    }

    // Camino 3: descargar via Evolution API getBase64FromMediaMessage
    if (!r.wa_message_id || !evo.url || !evo.apiKey) return res.status(404).end();

    const evoRes = await fetch(
      `${evo.url}/message/getBase64FromMediaMessage/${r.instance_name}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': evo.apiKey },
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
app.use('/api/appointments', requireAuth, requireModule('calendar'), appointmentsRouter);
app.use('/api/calendar', requireAuth, calendarSettingsRouter);
app.use('/api/calendars', requireAuth, requireModule('calendar'), calendarsRouter);
app.use('/api/conversations', requireAuth, requireModule('conversations'), conversationsRouter);
app.use('/api/wa', requireAuth, waSettingsRouter);
app.use('/api/automations', requireAuth, requireModule('automations'), automationsRouter);
app.use('/api/social', requireAuth, socialRouter);
app.use('/api/lead-ads', requireAuth, leadAdsRouter);

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

// Tarea periódica robusta: un fallo se registra (console.error → alerta a Telegram) sin tumbar el
// proceso, y si la ejecución anterior sigue en curso se salta el ciclo en vez de solaparse.
function every(name: string, task: () => Promise<unknown>, ms: number, runNow = false) {
  let running = false;
  const tick = () => {
    if (running) return;
    running = true;
    Promise.resolve()
      .then(() => task())
      .catch(e => console.error(`[jobs] ${name} falló:`, e))
      .finally(() => { running = false; });
  };
  if (runNow) tick();
  setInterval(tick, ms);
}

// Crear servidor HTTP compartido (Express + WebSocket en el mismo puerto).
const server = http.createServer(app);
initWS(server);

server.listen(env.port, () => {
  console.log(`API en http://localhost:${env.port} | WS en ws://localhost:${env.port}/ws`);
  // Los tests arrancan sin tareas periódicas: recorren TODAS las orgs de la BD (compartida en local)
  if (process.env.DISABLE_BACKGROUND_JOBS === 'true') return;
  // Revisar cada 60s si hay esperas temporizadas listas para reanudar
  every('resumeTimedRuns', resumeTimedRuns, 60_000);
  // Refrescar tokens de Instagram cada 30 días; también al arrancar para renovar de inmediato si toca
  every('refreshInstagramTokens', refreshInstagramTokens, 24 * 60 * 60_000, true); // la query filtra los que toca renovar
  // Polling de comentarios IG: con Standard Access Meta no envía webhooks de `comments`.
  every('pollIgComments', pollIgComments, 2 * 60_000, true);
  // Conexión de los WhatsApp: aviso por Telegram si alguno se cae
  every('wa-monitor', checkWhatsappConnections, 5 * 60_000, true);
});
