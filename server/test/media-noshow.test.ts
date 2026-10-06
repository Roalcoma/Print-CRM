// Medios de automatizaciones (subida + descarga pública con Range) y disparador "Cita: no asistió"
// (appointment_no_show) con un WhatsApp que adjunta un video. Corre contra el servidor de pruebas
// (run.ts) y un Evolution FALSO propio (puerto TEST_FAKE_URL+102) al que apuntan los wa_settings de
// las orgs de prueba. Orgs y usuarios se crean directo en BD (límite de peticiones de /auth).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import pg from 'pg';
import jwt from 'jsonwebtoken';

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3202';
const FAKE_PORT = Number(new URL(process.env.TEST_FAKE_URL ?? 'http://localhost:4202').port) + 102;
const FAKE = `http://localhost:${FAKE_PORT}`;
const SECRET = process.env.JWT_SECRET!;
if ((process.env.DATABASE_URL ?? '').includes('rocco.arbolaureo.org')) throw new Error('No correr contra producción');

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const one = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows[0];
const stamp = Date.now();

// ── Evolution falso: registra todos los envíos ───────────────────────────────
const sent: { path: string; body: any }[] = [];
const fake = http.createServer((req, res) => {
  let raw = '';
  req.on('data', d => { raw += d; });
  req.on('end', () => {
    const body = raw ? JSON.parse(raw) : {};
    sent.push({ path: req.url!, body });
    res.writeHead(201, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({ key: { remoteJid: `${body.number}@s.whatsapp.net`, fromMe: true, id: `EVO-${Math.random()}` }, status: 'PENDING' }));
  });
});
const sentTo = (number: string) => sent.filter(s => s.body.number === number);

async function api(token: string | null, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}
async function until<T>(what: string, fn: () => Promise<T | null | undefined | false>, ms = 6000): Promise<T> {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error(`Tiempo agotado esperando: ${what}`);
    await new Promise(r => setTimeout(r, 100));
  }
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// MP4 "falso": cabecera ftyp válida + bytes de relleno
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), Buffer.alloc(12), Buffer.from('0123456789abcdefghij')]);

type Org = { id: string; ownerId: string; token: string; calId: string; slug: string };
const A = {} as Org;
const B = {} as Org;
let seq = 0;
const phoneN = () => `5841266${String(stamp).slice(-3)}${String(++seq).padStart(2, '0')}`;
let media: { id: string; url: string; media_type: string; size: number };

async function makeOrg(o: Org, name: string) {
  o.id = (await one(`INSERT INTO organizations (name) VALUES ($1) RETURNING id`, [`${name} ${stamp}`])).id;
  o.ownerId = (await one(
    `INSERT INTO users (organization_id, email, password_hash, name, role) VALUES ($1, $2, 'x', 'Dueña', 'owner') RETURNING id`,
    [o.id, `media-${name.toLowerCase()}-${stamp}@test.local`],
  )).id;
  o.token = jwt.sign({ userId: o.ownerId, organizationId: o.id, role: 'owner' }, SECRET, { expiresIn: '10m' });
  await db.query(
    `INSERT INTO wa_settings (organization_id, evo_url, evo_api_key, instance_name, session_status, display_name, is_default)
     VALUES ($1, $2, 'evo-test-key', $3, 'connected', 'WA de prueba', true)`,
    [o.id, FAKE, `media-${name}-${stamp}`],
  );
  o.slug = `media-${name.toLowerCase()}-${stamp}`;
  o.calId = (await one(
    `INSERT INTO calendars (organization_id, user_id, name, slug, timezone, booking_enabled) VALUES ($1, $2, 'Llamadas', $3, 'America/New_York', true) RETURNING id`,
    [o.id, o.ownerId, o.slug],
  )).id;
}
async function contact(orgId: string, phone: string) {
  return (await one(`INSERT INTO contacts (organization_id, first_name, last_name, phone) VALUES ($1, 'Lina', 'Prueba', $2) RETURNING id`,
    [orgId, `+${phone}`])).id as string;
}
async function noShowRule(o: Org, steps: unknown[]) {
  return (await one(
    `INSERT INTO automation_rules (organization_id, trigger_type, name, enabled, config) VALUES ($1, 'appointment_no_show', $2, true, $3) RETURNING id`,
    [o.id, `No asistió ${stamp}`, JSON.stringify({ steps })],
  )).id as string;
}
async function createAppt(o: Org, contactId: string | null, calendar = true) {
  const start = new Date(Date.now() + 24 * 3600_000);
  const r = await api(o.token, 'POST', '/appointments', {
    title: 'Llamada', start_at: start.toISOString(), end_at: new Date(start.getTime() + 30 * 60_000).toISOString(),
    contact_id: contactId, ...(calendar ? { calendar_id: o.calId } : {}),
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data as { id: string };
}
const setStatus = (o: Org, id: string, status: string) => api(o.token, 'PATCH', `/appointments/${id}`, { status });

before(async () => {
  await new Promise<void>(r => fake.listen(FAKE_PORT, r));
  await makeOrg(A, 'A');
  await makeOrg(B, 'B');
});

after(async () => {
  fake.closeAllConnections();
  fake.close();
  for (const o of [A, B]) {
    // Borra los archivos del disco (la BD se va con la org)
    const list = await api(o.token, 'GET', '/automation-media').catch(() => null);
    for (const m of list?.data ?? []) await api(o.token, 'DELETE', `/automation-media/${m.id}`).catch(() => {});
    await db.query(`DELETE FROM crm_audit_log WHERE organization_id = $1`, [o.id]).catch(() => {});
    await db.query(`DELETE FROM organizations WHERE id = $1`, [o.id]).catch(() => {});
  }
  await db.end();
});

// ── 1. Subida y descarga pública ─────────────────────────────────────────────
test('subir un mp4: se sirve público en /m/:token con su Content-Type y soporte de Range', async () => {
  const up = await api(A.token, 'POST', '/automation-media?name=bienvenida.mp4', MP4, { 'Content-Type': 'video/mp4' });
  assert.equal(up.status, 201, JSON.stringify(up.data));
  media = up.data;
  assert.equal(media.media_type, 'video');
  assert.equal(media.size, MP4.length);
  assert.match(media.url, new RegExp(`^${BASE}/m/[A-Za-z0-9_-]{40,}$`));

  const full = await fetch(media.url);
  assert.equal(full.status, 200);
  assert.equal(full.headers.get('content-type'), 'video/mp4');
  assert.match(full.headers.get('cache-control') ?? '', /max-age/);
  assert.ok(Buffer.from(await full.arrayBuffer()).equals(MP4));

  const part = await fetch(media.url, { headers: { Range: 'bytes=0-9' } });
  assert.equal(part.status, 206);
  assert.equal(part.headers.get('content-range'), `bytes 0-9/${MP4.length}`);
  assert.ok(Buffer.from(await part.arrayBuffer()).equals(MP4.subarray(0, 10)));

  // Token inventado → 404; sin sesión no se sube nada
  assert.equal((await fetch(`${BASE}/m/${'x'.repeat(43)}`)).status, 404);
  assert.equal((await api(null, 'POST', '/automation-media?name=a.mp4', MP4, { 'Content-Type': 'video/mp4' })).status, 401);
  // Tipo no permitido y contenido que no corresponde al tipo
  assert.equal((await api(A.token, 'POST', '/automation-media?name=a.txt', Buffer.from('hola'), { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await api(A.token, 'POST', '/automation-media?name=a.mp4', Buffer.from('<html>no soy un video</html>'), { 'Content-Type': 'video/mp4' })).status, 400);

  const list = await api(A.token, 'GET', '/automation-media');
  assert.ok(list.data.some((m: { id: string }) => m.id === media.id));
});

// ── 2. Aislamiento entre organizaciones ──────────────────────────────────────
test('otra organización no puede ver, borrar ni usar el media_id', async () => {
  const list = await api(B.token, 'GET', '/automation-media');
  assert.ok(!list.data.some((m: { id: string }) => m.id === media.id));
  assert.equal((await api(B.token, 'DELETE', `/automation-media/${media.id}`)).status, 404);
  const save = await api(B.token, 'POST', '/automations', {
    name: 'Robo', trigger_type: 'appointment_no_show',
    config: { steps: [{ id: 's1', type: 'send_whatsapp', message: 'x', media_id: media.id }] },
  });
  assert.equal(save.status, 400);
  // En A sí se acepta (y valida media_type)
  const ok = await api(A.token, 'POST', '/automations', {
    name: `Válida ${stamp}`, trigger_type: 'tag_added', enabled: false,
    config: { trigger: { tag: `nada-${stamp}` }, steps: [{ id: 's1', type: 'send_whatsapp', message: 'x', media_id: media.id, media_type: 'video' }] },
  });
  assert.equal(ok.status, 201, JSON.stringify(ok.data));
  assert.equal(ok.data.config.steps[0].media_id, media.id);
  assert.equal((await api(A.token, 'PUT', `/automations/${ok.data.id}`, {
    name: 'x', trigger_type: 'tag_added', config: { steps: [{ id: 's1', type: 'send_whatsapp', media_type: 'audio' }] },
  })).status, 400);

  // Una regla de B guardada a mano con el media de A: se envía solo el texto
  await noShowRule(B, [{ id: 's1', type: 'send_whatsapp', message: 'Solo texto {{contact.first_name}}', media_id: media.id }]);
  const phone = phoneN();
  const appt = await createAppt(B, await contact(B.id, phone));
  assert.equal((await setStatus(B, appt.id, 'no_show')).status, 200);
  const msg = await until('envío de B', async () => sentTo(phone)[0]);
  assert.match(msg.path, /^\/message\/sendText\//);
  assert.equal(msg.body.text, 'Solo texto Lina');
});

// ── 3. Cita: no asistió → WhatsApp con video + enlace para reagendar ─────────
test('no_show: envía el video con caption interpolado, una sola vez, y cancela el recordatorio pendiente', async () => {
  // Recordatorio 2 h antes (cita agendada, incluye las manuales) → queda en espera
  const booked = (await one(
    `INSERT INTO automation_rules (organization_id, trigger_type, name, enabled, config) VALUES ($1, 'appointment_booked', $2, true, $3) RETURNING id`,
    [A.id, `Recordatorio ${stamp}`, JSON.stringify({ include_manual: true, steps: [
      { id: 'w1', type: 'wait_before_appointment', minutes_before: 120 },
      { id: 'r1', type: 'send_whatsapp', message: 'Recordatorio' },
    ] })],
  )).id;
  const noShow = await noShowRule(A, [{
    id: 's1', type: 'send_whatsapp', media_id: media.id,
    message: 'Hola {{contact.name}}, te extrañamos. Reagenda: {{appointment.reschedule_link}} | {{appointment.reschedule_url}}',
  }]);

  const phone = phoneN();
  const contactId = await contact(A.id, phone);
  // Conversación existente: el envío queda registrado en la bandeja
  const conv = (await one(
    `INSERT INTO conversations (organization_id, contact_id, wa_chat_id, display_name, phone) VALUES ($1, $2, $3, 'Lina', $4) RETURNING id`,
    [A.id, contactId, `${phone}@s.whatsapp.net`, phone],
  )).id;
  const appt = await createAppt(A, contactId);
  const reminder = await until('recordatorio en espera', async () => {
    const r = await one(`SELECT id, status FROM automation_runs WHERE automation_id = $1`, [booked]);
    return r?.status === 'waiting_timed' ? r : null;
  });

  assert.equal((await setStatus(A, appt.id, 'no_show')).status, 200);
  const msg = await until('video enviado', async () => sentTo(phone).find(s => s.path.startsWith('/message/sendMedia/')));
  const token = (await one(`SELECT cancel_token FROM appointments WHERE id = $1`, [appt.id])).cancel_token;
  const link = `${BASE}/book/${A.slug}/manage/${token}`;
  assert.equal(msg.body.mediatype, 'video');
  assert.equal(msg.body.media, media.url);
  assert.equal(msg.body.mimetype, 'video/mp4');
  assert.equal(msg.body.fileName, 'bienvenida.mp4');
  assert.equal(msg.body.caption, `Hola Lina Prueba, te extrañamos. Reagenda: ${link} | ${link}`);

  // El recordatorio de esa cita quedó cancelado
  assert.equal((await one(`SELECT status FROM automation_runs WHERE id = $1`, [reminder.id])).status, 'cancelled');

  // Bandeja: mensaje saliente de tipo video con el caption
  const logged = await until('mensaje en la bandeja', () => one(`SELECT msg_type, body, media_url, media_mime FROM conv_messages WHERE conversation_id = $1`, [conv]));
  assert.equal(logged.msg_type, 'video');
  assert.equal(logged.body, msg.body.caption);
  assert.equal(logged.media_url, media.url);
  assert.equal(logged.media_mime, 'video/mp4');
  const run = await until('run completado', async () => {
    const r = await one(`SELECT status, step_data FROM automation_runs WHERE automation_id = $1`, [noShow]);
    return r?.status === 'completed' ? r : null;
  });
  assert.deepEqual(run.step_data.s1, { sent: true, media_id: media.id });

  // Marcar otra vez no_show (igual, o tras corregirla) no repite
  assert.equal((await setStatus(A, appt.id, 'no_show')).status, 200);
  assert.equal((await setStatus(A, appt.id, 'scheduled')).status, 200);
  assert.equal((await setStatus(A, appt.id, 'no_show')).status, 200);
  await sleep(500);
  assert.equal(sentTo(phone).filter(s => s.path.startsWith('/message/sendMedia/')).length, 1);
  assert.equal((await one(`SELECT count(*)::int AS n FROM automation_runs WHERE automation_id = $1`, [noShow])).n, 1);
});

test('no_show de una cita manual sin calendario: el enlace es la página de reservas del calendario por defecto', async () => {
  const phone = phoneN();
  const appt = await createAppt(A, await contact(A.id, phone), false);
  assert.equal((await setStatus(A, appt.id, 'no_show')).status, 200);
  const msg = await until('video enviado', async () => sentTo(phone).find(s => s.path.startsWith('/message/sendMedia/')));
  assert.ok(msg.body.caption.endsWith(`Reagenda: ${BASE}/book/${A.slug} | ${BASE}/book/${A.slug}`), msg.body.caption);
});

test('no_show de una cita sin contacto: no dispara nada', async () => {
  const before = sent.length;
  const runsBefore = (await one(`SELECT count(*)::int AS n FROM automation_runs WHERE organization_id = $1`, [A.id])).n;
  const appt = await createAppt(A, null);
  assert.equal((await setStatus(A, appt.id, 'no_show')).status, 200);
  await sleep(500);
  assert.equal(sent.length, before);
  assert.equal((await one(`SELECT count(*)::int AS n FROM automation_runs WHERE organization_id = $1`, [A.id])).n, runsBefore);
  assert.equal((await one(`SELECT no_show_notified_at FROM appointments WHERE id = $1`, [appt.id])).no_show_notified_at, null);
});

test('borrar el archivo: deja de servirse', async () => {
  assert.equal((await api(A.token, 'DELETE', `/automation-media/${media.id}`)).status, 204);
  assert.equal((await fetch(media.url)).status, 404);
});
