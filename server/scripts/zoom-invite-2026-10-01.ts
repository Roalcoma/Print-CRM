// Campaña única de VFS: invitación por WhatsApp a la sesión de Zoom del jueves 1 de octubre de 2026,
// 8:00 p.m. hora de Miami. Sin envío masivo: un mensaje cada 7-9 minutos (al azar), solo de 7:00 a
// 20:00 hora de Miami, con "escribiendo…" antes de cada uno. Prioridad: Seguimiento → Reagendar →
// Sí Contestó → No respondió (los más recientes primero). Se puede reanudar: nunca repite a quien ya
// tiene la invitación en su conversación.
// Uso (contenedor aparte, sobrevive a los despliegues de la app):
//   docker compose -f docker-compose.prod.yml run -d --no-deps --name vfs_zoom_campaign app tsx scripts/zoom-invite-2026-10-01.ts
// Detener: docker stop vfs_zoom_campaign

import { pool } from '../src/db.ts';
import { resolveEvo } from '../src/services/evolution.ts';
import { sendTelegram } from '../src/services/alerts.ts';

const ORG = '6939defb-6d23-4ca6-a9da-a7bba81556ad';               // Virtual Family Solutions
const STAGES = ['Seguimiento', 'Reagendar', 'Sí Contestó', 'No respondió'];
const ZOOM = 'https://us06web.zoom.us/j/7583966227?pwd=Sl3F8auD2Ck7gfi2CoVLLKOseBb6zH.1';
const ZOOM_MARK = '7583966227';                                      // para detectar quién ya la recibió
const TZ = 'America/New_York';                                       // hora de Miami
const WINDOW_START = 7, WINDOW_END = 20;                             // horas locales de envío
const DEADLINE = new Date('2026-10-01T23:00:00Z');                   // jueves 7:00 p.m. Miami: ya no se invita
const GAP_MIN = 7 * 60_000, GAP_MAX = 9 * 60_000;
const DRY = process.env.DRY_RUN === 'true';

const WHEN = '*jueves 1 de octubre a las 8:00 p.m. (hora de Miami)*';
const variants = [
  (h: string) => `${h} 👋 Te escribe Lendry Labrador, de Virtual Family Solutions. Este ${WHEN} tenemos una sesión informativa por Zoom sobre la oportunidad de unirte a nuestro equipo de agentes de seguros. ¡Nos encantaría que estuvieras! 🙌\n\nTe dejo el enlace: ${ZOOM}\n\n¿Te esperamos? 😊`,
  (h: string) => `${h} 😊 Soy Lendry Labrador, de Virtual Family Solutions. Te invito a nuestra sesión informativa por Zoom este ${WHEN}, donde te contamos cómo unirte a nuestro equipo de agentes de seguros. ¡Nos encantaría verte ahí! 🙌\n\nEste es el enlace: ${ZOOM}\n\n¿Cuento contigo?`,
  (h: string) => `${h} 👋 Te habla Lendry Labrador, de Virtual Family Solutions. Queremos invitarte a la sesión informativa por Zoom del ${WHEN} para que conozcas la oportunidad de ser parte de nuestro equipo de agentes de seguros 🙌\n\nAquí tienes el enlace: ${ZOOM}\n\n¿Te esperamos? 😊`,
];

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);

function miamiHour(d = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }).format(d));
}
function miamiTime(d = new Date()): string {
  return new Intl.DateTimeFormat('es', { timeZone: TZ, weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(d);
}

// Saludo con el primer nombre solo si parece un nombre real (no emojis, números ni "Desconocido")
function greeting(firstName: string | null): string {
  const w = (firstName ?? '').trim().split(/\s+/)[0] ?? '';
  const bad = ['desconocido', 'usuario', 'cliente', 'lead', 'whatsapp', 'prospecto'];
  if (!/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ'.-]+$/.test(w) || bad.includes(w.toLowerCase())) return 'Hola';
  return `Hola ${w[0].toUpperCase()}${w.slice(1).toLowerCase()}`;
}

type Recipient = { contact_id: string; first_name: string | null; phone: string; stage: string };

async function recipients(): Promise<Recipient[]> {
  const { rows } = await pool.query<Recipient & { rank: number; recent: Date }>(
    `SELECT DISTINCT ON (right(regexp_replace(c.phone, '\\D', '', 'g'), 10))
            c.id AS contact_id, c.first_name, regexp_replace(c.phone, '\\D', '', 'g') AS phone, s.name AS stage,
            array_position($2::text[], s.name) AS rank,
            greatest(o.updated_at, (SELECT max(cv.last_message_at) FROM conversations cv WHERE cv.contact_id = c.id)) AS recent
     FROM opportunities o
     JOIN pipeline_stages s ON s.id = o.stage_id
     JOIN contacts c ON c.id = o.contact_id
     WHERE o.organization_id = $1 AND s.name = ANY($2::text[])
       AND regexp_replace(coalesce(c.phone, ''), '\\D', '', 'g') ~ '^[0-9]{10,15}$'
     ORDER BY right(regexp_replace(c.phone, '\\D', '', 'g'), 10), array_position($2::text[], s.name), o.updated_at DESC`,
    [ORG, STAGES],
  );
  return rows
    .sort((a, b) => a.rank - b.rank || new Date(b.recent ?? 0).getTime() - new Date(a.recent ?? 0).getTime())
    .map(({ contact_id, first_name, phone, stage }) => ({ contact_id, first_name, phone, stage }));
}

async function alreadyInvited(jid: string, contactId: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM conv_messages m JOIN conversations c ON c.id = m.conversation_id
     WHERE c.organization_id = $1 AND (c.wa_chat_id = $2 OR c.contact_id = $3)
       AND m.direction = 'outbound' AND m.body LIKE '%' || $4 || '%' LIMIT 1`,
    [ORG, jid, contactId, ZOOM_MARK],
  );
  return rows.length > 0;
}

// Guarda la invitación en la conversación del contacto: los envíos por la API de Evolution no llegan
// al webhook del CRM (solo messages.upsert), así que sin esto no se verían en la bandeja.
async function recordInvite(r: Recipient, jid: string, text: string, waId: string | null, at: Date) {
  const conv = (await pool.query<{ id: string }>(
    `INSERT INTO conversations (organization_id, wa_chat_id, display_name, phone, contact_id, last_message_at, last_message_preview)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (organization_id, wa_chat_id) DO UPDATE SET
       contact_id = COALESCE(conversations.contact_id, EXCLUDED.contact_id),
       last_message_preview = CASE WHEN conversations.last_message_at IS NULL OR EXCLUDED.last_message_at >= conversations.last_message_at
                                   THEN EXCLUDED.last_message_preview ELSE conversations.last_message_preview END,
       last_message_at = GREATEST(conversations.last_message_at, EXCLUDED.last_message_at),
       updated_at = NOW()
     RETURNING id`,
    [ORG, jid, r.first_name?.trim() || r.phone, r.phone, r.contact_id, at, text.slice(0, 100)],
  )).rows[0];
  await pool.query(
    `INSERT INTO conv_messages (conversation_id, organization_id, wa_message_id, direction, msg_type, body, status, created_at)
     VALUES ($1, $2, $3, 'outbound', 'text', $4, 'sent', $5) ON CONFLICT (wa_message_id) DO NOTHING`,
    [conv.id, ORG, waId, text, at],
  );
}

async function main() {
  const wa = (await pool.query(
    `SELECT evo_url, evo_api_key, instance_name FROM wa_settings WHERE organization_id = $1 AND session_status = 'connected' ORDER BY is_default DESC LIMIT 1`,
    [ORG],
  )).rows[0];
  if (!wa) throw new Error('VFS no tiene WhatsApp conectado');
  const { url, apiKey } = resolveEvo(wa);
  const evo = async (path: string, body?: unknown) => {
    const r = await fetch(`${url}${path}/${wa.instance_name}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', apikey: apiKey },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) throw new Error(`Evolution ${path} ${r.status}: ${await r.text()}`);
    return r.json();
  };

  const list = await recipients();

  // Modo único: registrar en el CRM invitaciones ya enviadas (BACKFILL='[{"n":1,"last4":"1234","at":"ISO"}]')
  if (process.env.BACKFILL) {
    const sentLog = JSON.parse(process.env.BACKFILL) as { n: number; last4: string; at: string; stage: string }[];
    for (const s of sentLog) {
      const r = list.find(x => x.stage === s.stage && x.phone.endsWith(s.last4));
      if (!r) { log(`backfill: no encontré …${s.last4}`); continue; }
      const jid = `${r.phone}@s.whatsapp.net`;
      if (await alreadyInvited(jid, r.contact_id)) { log(`backfill: …${s.last4} ya registrado`); continue; }
      await recordInvite(r, jid, variants[(s.n - 1) % variants.length](greeting(r.first_name)), null, new Date(s.at));
      log(`backfill: registrado #${s.n} …${s.last4}`);
    }
    await pool.end();
    return;
  }

  const byStage = STAGES.map(s => `${s}: ${list.filter(r => r.stage === s).length}`).join(', ');
  log(`destinatarios: ${list.length} (${byStage})${DRY ? ' · MODO PRUEBA, no se envía nada' : ''}`);
  if (!DRY) await sendTelegram(`📣 Campaña Zoom VFS lista: ${list.length} destinatarios en cola (${byStage}). Envía 1 mensaje cada 7-9 min entre 7:00 y 20:00 hora de Miami, hasta el jueves 7:00 p.m.`);

  let sent = 0, skipped = 0, invalid = 0, v = 0;
  for (const r of list) {
    if (new Date() >= DEADLINE) break;
    // Esperar a la ventana de envío (7:00-20:00 Miami)
    while (!DRY && (miamiHour() < WINDOW_START || miamiHour() >= WINDOW_END)) {
      if (new Date() >= DEADLINE) break;
      await sleep(60_000);
    }
    if (new Date() >= DEADLINE) break;

    // En modo prueba no se consulta WhatsApp (verificar cientos de números seguidos es riesgo de bloqueo)
    if (DRY) {
      const text = variants[v++ % variants.length](greeting(r.first_name));
      log(`[prueba] ${r.stage} · …${r.phone.slice(-4)} · ${text.split('\n')[0].slice(0, 80)}`);
      sent++;
      continue;
    }

    // WhatsApp de VFS conectado; si no, esperar (y avisar) sin perder la cola
    let waited = 0;
    for (;;) {
      const st = await evo('/instance/connectionState').catch(() => null) as { instance?: { state?: string } } | null;
      if (st?.instance?.state === 'open') break;
      if (waited === 0) await sendTelegram('⚠️ Campaña Zoom VFS en pausa: el WhatsApp de VFS no está conectado. Retoma sola al reconectar.');
      waited++;
      await sleep(2 * 60_000);
    }

    const check = await evo('/chat/whatsappNumbers', { numbers: [r.phone] }).catch(() => null) as { exists: boolean; jid: string }[] | null;
    const hit = check?.[0];
    if (!hit?.exists) { invalid++; log(`sin WhatsApp: …${r.phone.slice(-4)} (${r.stage})`); continue; }
    if (await alreadyInvited(hit.jid, r.contact_id)) { skipped++; continue; }

    const text = variants[v++ % variants.length](greeting(r.first_name));
    const res = await evo('/message/sendText', { number: hit.jid.split('@')[0], text, delay: Math.round(rand(3000, 6000)) }) as { key?: { id?: string } };
    sent++;
    await recordInvite(r, hit.jid, text, res?.key?.id ?? null, new Date()).catch(e => log('no se pudo registrar en el CRM:', (e as Error).message));
    log(`enviado #${sent}: ${r.stage} · …${r.phone.slice(-4)} · ${miamiTime()} Miami`);
    if (sent % 20 === 0) await sendTelegram(`📣 Campaña Zoom VFS: ${sent} invitaciones enviadas (última: ${miamiTime()} Miami).`);
    await sleep(rand(GAP_MIN, GAP_MAX));
  }

  const summary = `✅ Campaña Zoom VFS terminada: ${sent} enviadas, ${skipped} ya la tenían, ${invalid} sin WhatsApp, ${Math.max(0, list.length - sent - skipped - invalid)} sin alcanzar antes del plazo.`;
  log(summary);
  if (!DRY) await sendTelegram(summary);
  await pool.end();
}

main().catch(async e => {
  console.error('campaña detenida por error:', e);
  await sendTelegram(`❌ Campaña Zoom VFS detenida por un error: ${(e as Error).message}`).catch(() => {});
  process.exit(1);
});
