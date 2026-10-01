// Tests de punta a punta de los flujos que dan dinero: lead por WhatsApp, anuncio de origen,
// reserva pública con Google Meet, comentario de Instagram → lead, bandeja y tiempo real.
// Los servicios externos (Evolution, Meta/Instagram, Google) son un servidor HTTP FALSO que
// monta este archivo en TEST_FAKE_URL (por defecto :4202): nada sale a Internet.
// Uso: `npm test` (levanta el servidor de pruebas con las variables de los falsos; ver test/run.ts).
// Con un servidor ya arrancado con esas mismas variables: `npm run test:flows`.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHmac } from 'node:crypto';
import pg from 'pg';
import { encryptSecret } from '../src/secrets.ts';
import { wantsInfo, captionKeywords, matchesKeyword } from '../src/services/ig-intent.ts';
import { checkWhatsappConnections } from '../src/services/wa-monitor.ts';
import { pool as appPool } from '../src/db.ts';

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3202';
const FAKE = new URL(process.env.TEST_FAKE_URL ?? 'http://localhost:4202');
const META_SECRET = process.env.META_APP_SECRET ?? '';
if (BASE.includes('rocco.arbolaureo.org')) throw new Error('No correr los tests de flujos contra producción');
if (!process.env.EVOLUTION_URL?.startsWith(FAKE.origin)) throw new Error('EVOLUTION_URL debe apuntar al Evolution falso (usa `npm test`)');

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const stamp = Date.now();
const rnd = () => Math.random().toString().slice(2, 9);

// ── Servicios externos falsos ────────────────────────────────────────────────
type Call = { method: string; path: string; body: any };
const calls: Call[] = [];
const igRejected = new Set<string>();   // destinatarios de DM que Meta rechaza (fuera de ventana 24 h)
const captions: Record<string, string> = {};
const waState = new Map<string, string>();   // estado de conexión simulado por instancia (por defecto 'open')
const MEET = 'https://meet.google.com/abc-defg-hij';

function fakeReply(c: Call): [number, unknown] {
  const p = c.path;
  // Evolution API v2
  if (p.startsWith('/evo/instance/connectionState/')) {
    const name = p.split('/').pop()!;
    return [200, { instance: { instanceName: name, state: waState.get(name) ?? 'open' } }];
  }
  if (p.startsWith('/evo/instance/connect/')) return [200, { pairingCode: null, code: 'qr', base64: 'data:image/png;base64,' }];
  if (p.startsWith('/evo/webhook/set/')) return [200, { ok: true }];
  if (p.startsWith('/evo/message/sendText/')) {
    return [201, { key: { remoteJid: `${c.body.number}@s.whatsapp.net`, fromMe: true, id: `EVO-${rnd()}` }, status: 'PENDING' }];
  }
  // Instagram Graph (graph.instagram.com)
  if (p.startsWith('/ig/v21.0/me/messages')) {
    const to = c.body.recipient?.id;
    if (to && igRejected.has(to)) {
      return [400, { error: { message: 'This message is sent outside of allowed window.', type: 'OAuthException', code: 10, error_subcode: 2534022 } }];
    }
    return [200, { recipient_id: to ?? 'x', message_id: `mid-${rnd()}` }];
  }
  if (/^\/ig\/v21\.0\/[^/]+\/replies$/.test(p)) return [200, { id: `reply-${rnd()}` }];
  const media = p.match(/^\/ig\/v21\.0\/([^/?]+)\?fields=caption/);
  if (media) return [200, { id: media[1], caption: captions[media[1]] ?? '' }];
  // Google OAuth + Calendar
  if (p === '/google-token') return [200, { access_token: 'ya29.fake', expires_in: 3600 }];
  if (/^\/google\/calendar\/v3\/calendars\/[^/]+\/events/.test(p) && c.method === 'POST') {
    return [200, {
      id: `evt-${rnd()}`, htmlLink: 'https://calendar.google.com/fake',
      conferenceData: { entryPoints: [{ entryPointType: 'video', uri: MEET }] },
    }];
  }
  return [404, { error: { message: `ruta no simulada: ${c.method} ${p}` } }];
}

const fake = http.createServer((req, res) => {
  let raw = '';
  req.on('data', d => { raw += d; });
  req.on('end', () => {
    let body: any = raw;
    try { body = raw ? JSON.parse(raw) : null; } catch {
      body = Object.fromEntries(new URLSearchParams(raw));   // x-www-form-urlencoded (token de Google)
    }
    const call = { method: req.method!, path: req.url!, body };
    calls.push(call);
    const [status, json] = fakeReply(call);
    res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(json));
  });
});
const callsTo = (prefix: string) => calls.filter(c => c.path.startsWith(prefix));

// ── Helpers ──────────────────────────────────────────────────────────────────
async function api(token: string | null, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}

// Los webhooks responden antes de procesar: se espera a que la condición se cumpla
async function until<T>(what: string, fn: () => Promise<T | null | undefined | false>, ms = 6000): Promise<T> {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error(`Tiempo agotado esperando: ${what}`);
    await new Promise(r => setTimeout(r, 100));
  }
}
const one = async (sql: string, params: unknown[]) => (await db.query(sql, params)).rows[0];

// Webhook de Meta firmado con el secreto de la app (X-Hub-Signature-256)
function metaWebhook(payload: unknown, sign = true) {
  const raw = JSON.stringify(payload);
  const sig = 'sha256=' + createHmac('sha256', META_SECRET).update(raw).digest('hex');
  return api(null, 'POST', '/meta/webhook', raw, sign ? { 'X-Hub-Signature-256': sig } : {});
}

// Mensaje entrante de WhatsApp en el formato de Evolution v2
function waInbound(phone: string, text: string, extra: Record<string, unknown> = {}) {
  return api(null, 'POST', `/wa/webhook/${org.waSecret}`, {
    event: 'messages.upsert', instance: org.instance,
    data: {
      key: { remoteJid: `${phone}@s.whatsapp.net`, fromMe: false, id: `WA-${rnd()}${rnd()}` },
      pushName: 'Ana Prueba', messageType: 'conversation', message: { conversation: text },
      messageTimestamp: Math.floor(Date.now() / 1000), ...extra,
    },
  });
}

// ── Organización de prueba (registro público local) ──────────────────────────
const org = {} as {
  token: string; userId: string; orgId: string; pipeline: string; stage: string;
  waSecret: string; instance: string; igConn: string; igBusinessId: string; igToken: string;
};
const wsEvents: { type: string; data: any }[] = [];
let ws: WebSocket;

before(async () => {
  await new Promise<void>(r => fake.listen(Number(FAKE.port), r));

  const reg = await api(null, 'POST', '/auth/register', {
    organizationName: `Flujos ${stamp}`, name: 'Tester Flujos',
    email: `flows-${stamp}@test.local`, password: 'flujos-12345',
  });
  assert.equal(reg.status, 201, `registro: ${JSON.stringify(reg.data)}`);
  org.token = reg.data.token;
  const me = await api(org.token, 'GET', '/me');
  org.userId = (me.data.user ?? me.data).id;
  org.orgId = (await one('SELECT organization_id FROM users WHERE id = $1', [org.userId])).organization_id;

  await api(org.token, 'POST', '/pipelines', { name: 'Ventas' });
  const pipes = (await api(org.token, 'GET', '/pipelines')).data;
  org.pipeline = pipes[0].id; org.stage = pipes[0].stages[0].id;

  // WhatsApp: la instancia se crea al listarla y se conecta contra el Evolution falso
  const inst = (await api(org.token, 'GET', '/wa/instances')).data.instances[0];
  org.instance = inst.instance_name;
  assert.equal((await api(org.token, 'POST', `/wa/instances/${inst.id}/connect`)).status, 200);
  org.waSecret = (await one('SELECT webhook_secret FROM wa_settings WHERE id = $1', [inst.id])).webhook_secret;
  await api(null, 'POST', `/wa/webhook/${org.waSecret}`, { event: 'connection.update', instance: org.instance, data: { state: 'open' } });
  await until('WhatsApp conectado', async () => (await api(org.token, 'GET', '/wa/instances')).data.instances[0].session_status === 'connected');

  // Instagram: la conexión OAuth real no se puede simular por API → se inserta la fila (token cifrado)
  org.igBusinessId = `1784${stamp}`;
  org.igToken = `IGAAtest${stamp}`;
  org.igConn = (await one(
    `INSERT INTO social_connections (organization_id, platform, page_id, page_name, access_token, instagram_business_id, status, username)
     VALUES ($1, 'instagram', $2, 'Cuenta IG de prueba', $3, $2, 'active', $4) RETURNING id`,
    [org.orgId, org.igBusinessId, encryptSecret(org.igToken), `equipo_${stamp}`],
  )).id;

  // Tiempo real: WebSocket del CRM con el token de la org
  ws = new WebSocket(`${BASE.replace(/^http/, 'ws')}/ws?token=${org.token}`);
  ws.onmessage = e => wsEvents.push(JSON.parse(String(e.data)));
  await until('WebSocket conectado', async () => wsEvents.some(e => e.type === 'connected'));
});

after(async () => {
  ws?.close();
  fake.close();
  await db.end();
  await appPool.end();
});

// ── 1 + 6. Lead por WhatsApp → contacto, conversación, oportunidad, notificación, auto-respuesta, WS ──
test('WhatsApp: mensaje entrante crea contacto, conversación y lead (regla whatsapp_new_message) y avisa por WS', async () => {
  const rule = await api(org.token, 'POST', '/automations', {
    name: 'Lead WhatsApp', trigger_type: 'whatsapp_new_message',
    config: { steps: [
      { id: 's1', type: 'create_opportunity', title: 'Lead WA {{contact.name}}', source: 'whatsapp' },
      { id: 's2', type: 'send_notification', notification_title: 'Nuevo lead de WhatsApp', notification_body: '{{contact.name}} escribió' },
      { id: 's3', type: 'send_whatsapp', message: 'Hola {{contact.first_name}}, gracias por escribirnos' },
    ] },
  });
  assert.equal(rule.status, 201);

  const phone = `58414${rnd()}`;
  assert.equal((await waInbound(phone, 'Hola, quiero información')).status, 200);

  const contact = await until('contacto creado', () => one(
    'SELECT * FROM contacts WHERE organization_id = $1 AND phone = $2', [org.orgId, phone]));
  assert.equal(contact.first_name, 'Ana');
  assert.equal(contact.last_name, 'Prueba');
  assert.ok(contact.tags.includes('whatsapp'));

  const conv = await one('SELECT * FROM conversations WHERE organization_id = $1 AND wa_chat_id = $2', [org.orgId, `${phone}@s.whatsapp.net`]);
  assert.equal(conv.contact_id, contact.id);
  const msg = await one('SELECT * FROM conv_messages WHERE conversation_id = $1 AND direction = $2', [conv.id, 'inbound']);
  assert.equal(msg.body, 'Hola, quiero información');

  const opp = await until('oportunidad creada', () => one(
    'SELECT * FROM opportunities WHERE organization_id = $1 AND contact_id = $2', [org.orgId, contact.id]));
  assert.equal(opp.title, 'Lead WA Ana Prueba');
  assert.equal(opp.pipeline_id, org.pipeline);
  assert.equal(opp.stage_id, org.stage);

  const notifs = await until('notificación interna', async () => {
    const n = (await api(org.token, 'GET', '/notifications')).data;
    return n.find((x: any) => x.title === 'Nuevo lead de WhatsApp' && x.body === 'Ana Prueba escribió');
  });
  assert.ok(notifs);

  // Auto-respuesta enviada por el Evolution falso a ese número
  const sent = await until('auto-respuesta por Evolution', async () =>
    callsTo('/evo/message/sendText/').find(c => c.body.number === phone));
  assert.equal(sent.body.text, 'Hola Ana, gracias por escribirnos');
  assert.ok(sent.path.endsWith(`/${org.instance}`), 'usa la instancia de la org');

  // 6. Tiempo real: el CRM abierto recibe opportunity:new con el id de la oportunidad
  await until('evento WS opportunity:new', async () => wsEvents.some(e => e.type === 'opportunity:new' && e.data.id === opp.id));

  // Un segundo mensaje del mismo número NO crea otro lead
  await waInbound(phone, '¿Siguen ahí?');
  await until('segundo mensaje guardado', async () => (await one(
    'SELECT count(*)::int AS n FROM conv_messages WHERE conversation_id = $1', [conv.id])).n >= 3);
  const opps = await one('SELECT count(*)::int AS n FROM opportunities WHERE contact_id = $1', [contact.id]);
  assert.equal(opps.n, 1);
  const contacts = await one('SELECT count(*)::int AS n FROM contacts WHERE organization_id = $1 AND phone = $2', [org.orgId, phone]);
  assert.equal(contacts.n, 1);
});

// ── 2. Anuncio de origen (click-to-WhatsApp) ────────────────────────────────
test('WhatsApp: mensaje desde un anuncio guarda ad_ref en el mensaje y ad_source en el contacto', async () => {
  const phone = `58424${rnd()}`;
  const ad = {
    title: 'Curso de ventas', body: 'Aprende a vender por WhatsApp', sourceType: 'ad', sourceId: '120210000000001',
    sourceUrl: 'https://fb.me/anuncio', sourceApp: 'facebook', ctwaClid: 'clid-123', greetingMessageBody: 'Hola, quiero info del curso',
    thumbnail: Buffer.from('miniatura').toString('base64'),
  };
  // Evolution v2 manda el contextInfo a nivel de data
  await waInbound(phone, 'Hola, vi el anuncio', { contextInfo: { externalAdReply: ad } });

  const contact = await until('contacto del anuncio', () => one(
    'SELECT * FROM contacts WHERE organization_id = $1 AND phone = $2 AND ad_source IS NOT NULL', [org.orgId, phone]));
  assert.equal(contact.ad_source.title, 'Curso de ventas');
  assert.equal(contact.ad_source.source_id, '120210000000001');
  assert.equal(contact.ad_source.ctwa_clid, 'clid-123');
  assert.ok(contact.ad_source.thumbnail.startsWith('data:image/jpeg;base64,'));

  // El webhook guarda el anuncio en el contacto un instante antes que el mensaje: esperar también al mensaje
  const msg = await until('mensaje con ad_ref', () => one(
    `SELECT m.ad_ref FROM conv_messages m JOIN conversations c ON c.id = m.conversation_id
     WHERE c.organization_id = $1 AND c.wa_chat_id = $2 AND m.ad_ref IS NOT NULL`, [org.orgId, `${phone}@s.whatsapp.net`]));
  assert.equal(msg.ad_ref.source_url, 'https://fb.me/anuncio');
  assert.equal(msg.ad_ref.greeting, 'Hola, quiero info del curso');

  // Un clic posterior en otro anuncio (contextInfo dentro del mensaje) no pisa el anuncio de origen
  await waInbound(phone, 'Otra vez yo', {
    messageType: 'extendedTextMessage',
    message: { extendedTextMessage: { text: 'Otra vez yo', contextInfo: { externalAdReply: { ...ad, title: 'Otro anuncio', sourceId: '999' } } } },
  });
  await until('segundo mensaje con ad_ref', () => one(
    `SELECT 1 FROM conv_messages m JOIN conversations c ON c.id = m.conversation_id
     WHERE c.organization_id = $1 AND c.wa_chat_id = $2 AND m.ad_ref->>'source_id' = '999'`, [org.orgId, `${phone}@s.whatsapp.net`]));
  const again = await one('SELECT ad_source FROM contacts WHERE id = $1', [contact.id]);
  assert.equal(again.ad_source.source_id, '120210000000001');
});

// ── 3. Reserva pública con Google Meet ──────────────────────────────────────
test('Reserva pública: crea contacto + cita y el evento de Google con Meet', async () => {
  const slug = `flujos-${stamp}`;
  const cal = await api(org.token, 'POST', '/calendars', {
    name: 'Llamada de ventas', slug, booking_enabled: true, duration_minutes: 30,
    location_type: 'google_meet', timezone: 'America/Caracas', min_notice_hours: 0,
    // Todos los días 09:00–18:00: la reserva solo acepta huecos del horario (15:00 UTC = 11:00 Caracas)
    availability: [0, 1, 2, 3, 4, 5, 6].map(d => ({ day_of_week: d, start_time: '09:00', end_time: '18:00', is_active: true })),
  });
  assert.equal(cal.status, 201, JSON.stringify(cal.data));

  // "Google conectado": refresh token cifrado como lo guarda el callback OAuth
  const refreshToken = `1//refresh-${stamp}`;
  await db.query(
    `INSERT INTO calendar_settings (user_id, organization_id, google_refresh_token, google_calendar_id)
     VALUES ($1, $2, $3, 'primary')`,
    [org.userId, org.orgId, encryptSecret(refreshToken)],
  );

  const start = new Date(Date.now() + 2 * 86_400_000);
  start.setUTCHours(15, 0, 0, 0);
  const email = `cliente-${stamp}@test.local`;
  const r = await api(null, 'POST', `/public/book/${slug}`, {
    name: 'Carlos Cliente', email, phone: '+58 412 5550000', notes: 'Quiero el plan anual', start_at: start.toISOString(),
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.location, MEET);

  const contact = await one('SELECT * FROM contacts WHERE organization_id = $1 AND email = $2', [org.orgId, email]);
  assert.equal(contact.first_name, 'Carlos');
  const appt = await one('SELECT * FROM appointments WHERE id = $1', [r.data.appointment.id]);
  assert.equal(appt.contact_id, contact.id);
  assert.equal(appt.organization_id, org.orgId);
  assert.equal(new Date(appt.start_at).toISOString(), start.toISOString());
  assert.equal(appt.provider, 'google');
  assert.equal(appt.meeting_url, MEET);
  assert.ok(appt.provider_event_id?.startsWith('evt-'));

  // Google recibió el refresh token descifrado y un evento con Meet e invitados
  const tokenCall = callsTo('/google-token').at(-1)!;
  assert.equal(tokenCall.body.refresh_token, refreshToken);
  assert.equal(tokenCall.body.grant_type, 'refresh_token');
  const ev = callsTo('/google/calendar/v3/calendars/primary/events').at(-1)!;
  assert.ok(ev.path.includes('conferenceDataVersion=1'));
  assert.equal(ev.body.conferenceData.createRequest.conferenceSolutionKey.type, 'hangoutsMeet');
  assert.equal(ev.body.start.dateTime, start.toISOString());
  assert.ok(ev.body.attendees.some((a: any) => a.email === email));

  // El mismo horario ya no se puede reservar
  const dup = await api(null, 'POST', `/public/book/${slug}`, { name: 'Otro', email: `otro-${stamp}@test.local`, start_at: start.toISOString() });
  assert.equal(dup.status, 409);
});

// ── 4. Instagram: comentario → respuesta pública + DM + lead ────────────────
test('Instagram: webhook sin firma válida se rechaza', async () => {
  const r = await metaWebhook({ object: 'instagram', entry: [] }, false);
  assert.equal(r.status, 401);
});

test('Instagram: comentario con la palabra clave del post genera respuesta, DM y lead; sin intención no', async () => {
  const rule = await api(org.token, 'POST', '/automations', {
    name: 'Comentario IG → DM', trigger_type: 'ig_comment_received',
    config: { steps: [
      { id: 'r1', type: 'ig_reply_comment', messages: ['¡Te escribimos por DM, {{contact.first_name}}!'] },
      { id: 'd1', type: 'ig_send_dm', message: 'Hola {{contact.first_name}}, aquí tienes la info' },
      { id: 'o1', type: 'create_opportunity', title: 'Lead IG {{contact.name}}', source: 'instagram' },
      { id: 'n1', type: 'send_notification', notification_title: 'Nuevo lead de Instagram', notification_body: '{{contact.name}}' },
    ] },
  });
  assert.equal(rule.status, 201);

  // "CAMBIO" no es una palabra de interés genérica: solo cuenta porque el post la pide
  const mediaId = `media-${stamp}`;
  captions[mediaId] = 'Tu vida puede cambiar. Comenta la palabra "CAMBIO" y te cuento cómo';
  const sender = `ig-user-${rnd()}`;
  const commentId = `cmt-${rnd()}`;
  const comment = (id: string, from: string, username: string, text: string) => ({
    object: 'instagram',
    entry: [{ id: org.igBusinessId, time: Date.now(), changes: [{ field: 'comments', value: { id, text, from: { id: from, username }, media: { id: mediaId } } }] }],
  });
  assert.equal((await metaWebhook(comment(commentId, sender, 'maria_lead', 'CAMBIO'))).status, 200);

  const contact = await until('contacto de IG', () => one(
    'SELECT * FROM contacts WHERE organization_id = $1 AND ig_sender_id = $2', [org.orgId, sender]));
  assert.equal(contact.first_name, 'maria_lead');
  assert.ok(contact.tags.includes('instagram'));

  const reply = await until('respuesta pública', async () => callsTo(`/ig/v21.0/${commentId}/replies`)[0]);
  assert.equal(reply.body.message, '¡Te escribimos por DM, maria_lead!');
  assert.equal(reply.body.access_token, org.igToken, 'token descifrado');

  // El primer DM va como private reply al comentario
  const dm = await until('DM (private reply)', async () =>
    callsTo('/ig/v21.0/me/messages').find(c => c.body.recipient?.comment_id === commentId));
  assert.equal(dm.body.message.text, 'Hola maria_lead, aquí tienes la info');

  const opp = await until('lead de IG', () => one(
    'SELECT * FROM opportunities WHERE organization_id = $1 AND contact_id = $2', [org.orgId, contact.id]));
  assert.equal(opp.title, 'Lead IG maria_lead');
  await until('evento WS del lead de IG', async () => wsEvents.some(e => e.type === 'opportunity:new' && e.data.id === opp.id));

  // La bandeja muestra el comentario, la respuesta pública y el DM en la conversación de IG
  const conv = await until('conversación de IG en la bandeja', () => one(
    `SELECT * FROM conversations WHERE organization_id = $1 AND wa_chat_id = $2`, [org.orgId, `ig_${sender}`]));
  assert.equal(conv.channel, 'instagram_dm');
  assert.equal(conv.contact_id, contact.id);
  await until('3 mensajes en la conversación de IG', async () => (await one(
    'SELECT count(*)::int AS n FROM conv_messages WHERE conversation_id = $1', [conv.id])).n === 3);

  // Mismo comentario reenviado por Meta: se deduplica
  await metaWebhook(comment(commentId, sender, 'maria_lead', 'CAMBIO'));

  // Comentario sin intención: ni respuesta, ni DM, ni contacto
  const quiet = `ig-user-${rnd()}`;
  const quietComment = `cmt-${rnd()}`;
  await metaWebhook(comment(quietComment, quiet, 'pedro_fan', 'Qué bonita foto 😍'));
  // Comentario del propio equipo (aunque pida info): tampoco
  const teamComment = `cmt-${rnd()}`;
  await metaWebhook(comment(teamComment, `ig-team-${rnd()}`, `equipo_${stamp}`, 'CAMBIO, quiero info'));
  await until('comentarios procesados', async () => (await one(
    'SELECT count(*)::int AS n FROM ig_processed_comments WHERE comment_id = ANY($1)', [[quietComment, teamComment]])).n === 2);
  await new Promise(r => setTimeout(r, 500));   // margen por si el motor fuera a responder
  assert.equal(callsTo(`/ig/v21.0/${quietComment}/replies`).length, 0);
  assert.equal(callsTo(`/ig/v21.0/${teamComment}/replies`).length, 0);
  assert.ok(!calls.some(c => [quietComment, teamComment].includes(c.body?.recipient?.comment_id)));
  assert.equal(await one('SELECT id FROM contacts WHERE organization_id = $1 AND ig_sender_id = $2', [org.orgId, quiet]), undefined);

  const leads = await one('SELECT count(*)::int AS n FROM opportunities WHERE organization_id = $1 AND source = $2', [org.orgId, 'instagram']);
  assert.equal(leads.n, 1, 'un solo lead de Instagram (duplicado y sin intención no cuentan)');
  assert.equal(callsTo(`/ig/v21.0/${commentId}/replies`).length, 1, 'el comentario duplicado no se respondió dos veces');
});

// ── 5. Bandeja: enviar desde el CRM ─────────────────────────────────────────
test('Bandeja: enviar por WhatsApp llama a Evolution y el eco del webhook no duplica el mensaje', async () => {
  const phone = `58416${rnd()}`;
  const conv = await api(org.token, 'POST', '/conversations', { phone, display_name: 'Chat saliente' });
  assert.equal(conv.status, 201);

  const r = await api(org.token, 'POST', `/conversations/${conv.data.id}/messages`, { body: 'Te envío la cotización' });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const sent = callsTo('/evo/message/sendText/').find(c => c.body.number === phone);
  assert.ok(sent, 'Evolution recibió el envío');
  assert.equal(sent.body.text, 'Te envío la cotización');
  assert.ok(r.data.wa_message_id?.startsWith('EVO-'));

  // Evolution devuelve el mensaje propio por webhook (fromMe): no debe aparecer dos veces
  await api(null, 'POST', `/wa/webhook/${org.waSecret}`, {
    event: 'messages.upsert', instance: org.instance,
    data: { key: { remoteJid: `${phone}@s.whatsapp.net`, fromMe: true, id: r.data.wa_message_id }, messageType: 'conversation', message: { conversation: 'Te envío la cotización' } },
  });
  await api(null, 'POST', `/wa/webhook/${org.waSecret}`, {
    event: 'messages.update', instance: org.instance, data: { key: { id: r.data.wa_message_id }, update: { status: 'READ' } },
  });
  await until('ACK de leído', () => one(`SELECT 1 FROM conv_messages WHERE wa_message_id = $1 AND status = 'read'`, [r.data.wa_message_id]));
  const n = await one('SELECT count(*)::int AS n FROM conv_messages WHERE conversation_id = $1', [conv.data.id]);
  assert.equal(n.n, 1);
});

test('Bandeja: DM de Instagram rechazado por Meta (fuera de 24 h) devuelve 422 y no se guarda', async () => {
  // DM entrante por webhook → crea la conversación de IG
  const peer = `ig-dm-${rnd()}`;
  await metaWebhook({
    object: 'instagram',
    entry: [{ id: org.igBusinessId, time: Date.now(), messaging: [{ sender: { id: peer }, recipient: { id: org.igBusinessId }, timestamp: Date.now(), message: { mid: `m-${rnd()}`, text: 'Hola, ¿precio?' } }] }],
  });
  const conv = await until('conversación de DM', () => one(
    'SELECT * FROM conversations WHERE organization_id = $1 AND wa_chat_id = $2', [org.orgId, `ig_${peer}`]));

  // Dentro de la ventana: se envía y se guarda
  const ok = await api(org.token, 'POST', `/conversations/${conv.id}/messages`, { body: 'Cuesta 50 USD' });
  assert.equal(ok.status, 201, JSON.stringify(ok.data));
  const okCall = callsTo('/ig/v21.0/me/messages').find(c => c.body.recipient?.id === peer)!;
  assert.equal(okCall.body.message.text, 'Cuesta 50 USD');
  assert.equal(okCall.body.access_token, org.igToken);

  // Meta lo rechaza (error_subcode 2534022)
  igRejected.add(peer);
  const bad = await api(org.token, 'POST', `/conversations/${conv.id}/messages`, { body: 'Mensaje que Meta rechaza' });
  assert.equal(bad.status, 422);
  assert.match(bad.data.error, /24 h/);
  const saved = await one('SELECT count(*)::int AS n FROM conv_messages WHERE conversation_id = $1 AND body = $2', [conv.id, 'Mensaje que Meta rechaza']);
  assert.equal(saved.n, 0);
});

// ── 7. Disparador "Contacto creado" ─────────────────────────────────────────
test('Contacto creado: dispara la regla en alta manual, WhatsApp y oportunidad (una sola vez por contacto)', async () => {
  const rule = await api(org.token, 'POST', '/automations', {
    name: 'Bienvenida contacto', trigger_type: 'contact_created',
    config: { steps: [{ id: 'c1', type: 'send_notification', notification_title: 'Contacto nuevo', notification_body: '{{contact.name}}' }] },
  });
  assert.equal(rule.status, 201);
  const runsFor = async (contactId: string) => (await one(
    'SELECT count(*)::int AS n FROM automation_runs WHERE automation_id = $1 AND contact_id = $2', [rule.data.id, contactId])).n;

  // Alta manual
  const c = await api(org.token, 'POST', '/contacts', { first_name: 'Lucía', last_name: 'Manual', email: `lucia-${stamp}@test.local` });
  assert.equal(c.status, 201, JSON.stringify(c.data));
  await until('run de contacto manual', async () => (await runsFor(c.data.id)) === 1);

  // WhatsApp entrante: corren "contacto creado" y "nuevo mensaje de WhatsApp", cada uno una vez
  const phone = `58416${rnd()}`;
  await waInbound(phone, 'Hola');
  const wa = await until('contacto de WhatsApp', () => one(
    'SELECT id FROM contacts WHERE organization_id = $1 AND phone = $2', [org.orgId, phone]));
  await until('run de contacto WA', async () => (await runsFor(wa.id)) === 1);
  await waInbound(phone, 'Sigo por aquí');
  await until('segundo mensaje', async () => (await one(
    `SELECT count(*)::int AS n FROM conv_messages m JOIN conversations c ON c.id = m.conversation_id
      WHERE c.organization_id = $1 AND c.wa_chat_id = $2 AND m.direction = 'inbound'`, [org.orgId, `${phone}@s.whatsapp.net`])).n >= 2);
  await new Promise(r => setTimeout(r, 300));
  assert.equal(await runsFor(wa.id), 1, 'el segundo mensaje no vuelve a disparar "contacto creado"');
  const waRuns = await one(
    `SELECT count(*)::int AS n FROM automation_runs r JOIN automation_rules a ON a.id = r.automation_id
      WHERE r.contact_id = $1 AND a.trigger_type = 'whatsapp_new_message'`, [wa.id]);
  assert.equal(waRuns.n, 1, 'whatsapp_new_message corre una vez');

  // Oportunidad con contacto nuevo
  const opp = await api(org.token, 'POST', '/opportunities', {
    title: 'Venta nueva', pipeline_id: org.pipeline, stage_id: org.stage, contact_name: 'Pedro Oportunidad',
    contact_email: `pedro-${stamp}@test.local`,
  });
  assert.equal(opp.status, 201, JSON.stringify(opp.data));
  const oppContact = await one('SELECT contact_id FROM opportunities WHERE id = $1', [opp.data.id]);
  await until('run de contacto de oportunidad', async () => (await runsFor(oppContact.contact_id)) === 1);

  // Editar un contacto existente no dispara
  await api(org.token, 'PATCH', `/contacts/${c.data.id}`, { last_name: 'Editada' });
  await new Promise(r => setTimeout(r, 300));
  assert.equal(await runsFor(c.data.id), 1);

  await api(org.token, 'PATCH', `/automations/${rule.data.id}`, { enabled: false });
});

// ── 8. "Cita agendada" también con citas creadas a mano en el CRM ──────────
test('Cita manual con contacto dispara "cita agendada" una vez (también si es recurrente) con appointment_id', async () => {
  // Una regla sin include_manual NO se dispara con citas manuales (no cambia reglas existentes)
  const solo = await api(org.token, 'POST', '/automations', {
    name: 'Solo reservas', trigger_type: 'appointment_booked',
    config: { steps: [{ id: 'b1', type: 'send_notification', notification_title: 'Reserva', notification_body: '{{contact.name}}' }] },
  });
  assert.equal(solo.status, 201);
  const rule = await api(org.token, 'POST', '/automations', {
    name: 'Recordatorio cita', trigger_type: 'appointment_booked',
    config: { include_manual: true, steps: [{ id: 'a1', type: 'send_notification', notification_title: 'Cita', notification_body: '{{contact.name}}' }] },
  });
  assert.equal(rule.status, 201);
  const contact = (await api(org.token, 'POST', '/contacts', { first_name: 'Rosa', last_name: 'Cita' })).data;
  const runs = async () => (await one('SELECT count(*)::int AS n FROM automation_runs WHERE automation_id = $1', [rule.data.id])).n;

  const start = new Date(Date.now() + 3 * 86_400_000);
  start.setUTCHours(14, 0, 0, 0);
  const appt = await api(org.token, 'POST', '/appointments', {
    title: 'Consulta', contact_id: contact.id, start_at: start.toISOString(),
    end_at: new Date(start.getTime() + 3_600_000).toISOString(), recurrence_type: 'weekly', recurrence_count: 3,
  });
  assert.equal(appt.status, 201, JSON.stringify(appt.data));
  const run = await until('run de cita agendada', () => one(
    'SELECT * FROM automation_runs WHERE automation_id = $1 AND contact_id = $2', [rule.data.id, contact.id]));
  assert.equal(run.step_data.__appointment__.appointment_id, appt.data.id);
  assert.equal(run.step_data.__appointment__.start_at, start.toISOString());
  await new Promise(r => setTimeout(r, 300));
  assert.equal(await runs(), 1, 'solo la primera cita de la serie recurrente');

  // Sin contacto (cita interna): no dispara
  const internal = await api(org.token, 'POST', '/appointments', {
    title: 'Interna', start_at: start.toISOString(), end_at: new Date(start.getTime() + 1_800_000).toISOString(),
  });
  assert.equal(internal.status, 201);
  await new Promise(r => setTimeout(r, 300));
  assert.equal(await runs(), 1);

  const soloRuns = (await one('SELECT count(*)::int AS n FROM automation_runs WHERE automation_id = $1', [solo.data.id])).n;
  assert.equal(soloRuns, 0, 'la regla sin include_manual no se dispara con citas manuales');

  await api(org.token, 'PATCH', `/automations/${rule.data.id}`, { enabled: false });
  await api(org.token, 'PATCH', `/automations/${solo.data.id}`, { enabled: false });
});

// ── 9. Filtro de intención de Instagram para varios sectores ────────────────
test('Filtro de intención: acepta consultas de compra/servicio y de reclutamiento; rechaza elogios', () => {
  const yes = [
    '¿Precio?', 'Cuánto cuesta la limpieza dental', '¿Hacen envíos a Valencia?', 'Tienen disponible en talla M',
    'Dónde están ubicados', 'Horario de atención', 'Quedan cupos para el curso?', 'Quiero agendar una cita',
    'Cuánto sale el apartamento', 'Está en venta o alquiler?', 'Catálogo por favor', 'How much?', 'Do you ship to Miami',
    'Is it available', 'price please', 'Me interesa, ¿sin licencia se puede?', 'info', 'Sin papeles se puede?', 'yo',
  ];
  const no = [
    'Qué bonito 😍', 'Felicidades!!', 'Felicitaciones por el nuevo local', 'Excelente servicio, recomendados',
    'Buen curso, gracias', 'Excelente ubicación!', 'great job', '😍😍🔥', '@maria', 'Gracias por la atención',
    'Buena información, gracias', 'Qué lindo', 'Te quiero mucho amiga',
  ];
  for (const t of yes) assert.ok(wantsInfo(t), `debería pedir info: "${t}"`);
  for (const t of no) assert.ok(!wantsInfo(t), `no debería pedir info: "${t}"`);
  // La palabra clave del post sigue funcionando
  assert.deepEqual(captionKeywords('Comenta la palabra "CAMBIO" y te cuento'), ['cambio']);
  assert.ok(matchesKeyword('CAMBIO', ['cambio']));
});

// ── WhatsApp: renombrar la instancia (solo display_name, solo admins de la propia org) ──
test('WhatsApp: renombrar la instancia solo cambia display_name, validado y de la propia organización', async () => {
  const inst = (await api(org.token, 'GET', '/wa/instances')).data.instances[0];
  const before = await one('SELECT instance_name, evo_url, evo_api_key FROM wa_settings WHERE id = $1', [inst.id]);

  const ok = await api(org.token, 'PATCH', `/wa/instances/${inst.id}`, { display_name: '  Ventas Caracas  ' });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.instance.display_name, 'Ventas Caracas');

  // Intentar colar instance_name / evo_url / evo_api_key → 400 y nada cambia
  for (const extra of [{ instance_name: 'rocco-ajena' }, { evo_url: 'http://evil' }, { evo_api_key: 'x' }]) {
    const bad = await api(org.token, 'PATCH', `/wa/instances/${inst.id}`, { display_name: 'Hack', ...extra });
    assert.equal(bad.status, 400, JSON.stringify(extra));
  }
  for (const name of ['', '   ', 'x'.repeat(41)]) {
    assert.equal((await api(org.token, 'PATCH', `/wa/instances/${inst.id}`, { display_name: name })).status, 400);
  }
  const after = await one('SELECT display_name, instance_name, evo_url, evo_api_key FROM wa_settings WHERE id = $1', [inst.id]);
  assert.equal(after.display_name, 'Ventas Caracas');
  assert.equal(after.instance_name, before.instance_name);
  assert.equal(after.evo_url, before.evo_url);
  assert.equal(after.evo_api_key, before.evo_api_key);
  // Las rutas de config siguen bloqueadas
  assert.equal((await api(org.token, 'PATCH', '/wa/settings', { instance_name: 'x' })).status, 403);

  // Instancia de otra organización → 404 y no se toca
  const other = await one(`INSERT INTO organizations (name) VALUES ($1) RETURNING id`, [`Ajena ${stamp}`]);
  try {
    const foreign = await one(
      `INSERT INTO wa_settings (organization_id, evo_url, evo_api_key, instance_name, display_name, is_default)
       VALUES ($1, '', '', $2, 'Ajeno', true) RETURNING id`, [other.id, `rocco-test-${rnd()}`]);
    assert.equal((await api(org.token, 'PATCH', `/wa/instances/${foreign.id}`, { display_name: 'Mío' })).status, 404);
    assert.equal((await one('SELECT display_name FROM wa_settings WHERE id = $1', [foreign.id])).display_name, 'Ajeno');
  } finally {
    await db.query('DELETE FROM organizations WHERE id = $1', [other.id]);
  }
  assert.equal((await api(org.token, 'PATCH', '/wa/instances/no-es-uuid', { display_name: 'X' })).status, 404);
  assert.equal((await api(null, 'PATCH', `/wa/instances/${inst.id}`, { display_name: 'X' })).status, 401);
});

// ── WhatsApp caído: el monitor avisa en la campanita a los admins (una vez) y al volver ──
test('WhatsApp: caída y reconexión generan una notificación cada una para el admin y actualizan el estado', async () => {
  const inst = (await api(org.token, 'GET', '/wa/instances')).data.instances[0];
  const notifs = async () => (await db.query(
    `SELECT title, body FROM notifications WHERE user_id = $1 AND entity_type = 'wa_instance' AND entity_id = $2 ORDER BY created_at`,
    [org.userId, inst.id])).rows;

  await checkWhatsappConnections(org.orgId);            // línea base (conectado)
  waState.set(org.instance, 'close');
  await checkWhatsappConnections(org.orgId);            // 1.ª lectura caída: aún sin aviso (puede ser un parpadeo)
  assert.equal((await notifs()).length, 0);
  await checkWhatsappConnections(org.orgId);            // 2.ª seguida: aviso
  await checkWhatsappConnections(org.orgId);            // sigue caído: sin spam
  let n = await notifs();
  assert.equal(n.length, 1);
  assert.equal(n[0].title, 'WhatsApp desconectado');
  assert.match(n[0].body, /Ventas Caracas/);
  assert.match(n[0].body, /no están entrando/);
  assert.match(n[0].body, /Configuración → WhatsApp/);
  assert.equal((await one('SELECT session_status FROM wa_settings WHERE id = $1', [inst.id])).session_status, 'disconnected');
  assert.equal((await api(org.token, 'GET', '/wa/instances?nocreate=1')).data.in_use, true);   // el banner se mostraría

  waState.delete(org.instance);                         // vuelve a 'open'
  await checkWhatsappConnections(org.orgId);
  await checkWhatsappConnections(org.orgId);
  n = await notifs();
  assert.equal(n.length, 2);
  assert.equal(n[1].title, 'WhatsApp reconectado');
  assert.equal((await one('SELECT session_status FROM wa_settings WHERE id = $1', [inst.id])).session_status, 'connected');
  const list = (await api(org.token, 'GET', '/notifications')).data;
  assert.ok(JSON.stringify(list).includes('WhatsApp reconectado'));
});
