// Notificaciones push (FCM): registro de tokens, preferencias y avisos de mensaje entrante, lead
// nuevo y cita cancelada. Corre contra el servidor de pruebas (run.ts) y un FCM FALSO propio
// (puerto TEST_FAKE_URL+103) al que run.ts apunta FCM_API_URL/FCM_TOKEN_URL. Las credenciales
// (service account con una clave RSA generada aquí) se escriben en FCM_SERVICE_ACCOUNT_FILE solo
// durante este test: el servidor relee el archivo y el resto de tests corre con el push apagado.
// Orgs y usuarios se crean directo en BD (límite de peticiones de /auth).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { generateKeyPairSync, createVerify, randomBytes } from 'node:crypto';
import { writeFileSync, rmSync } from 'node:fs';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { fireTagTrigger } from '../src/services/automation-engine.ts';

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3202';
const FCM_PORT = Number(new URL(process.env.TEST_FAKE_URL ?? 'http://localhost:4202').port) + 103;
const SA_FILE = process.env.FCM_SERVICE_ACCOUNT_FILE!;
const SECRET = process.env.JWT_SECRET!;
if ((process.env.DATABASE_URL ?? '').includes('rocco.arbolaureo.org')) throw new Error('No correr contra producción');
if (!SA_FILE || !process.env.FCM_API_URL?.includes(String(FCM_PORT))) throw new Error('Correr con `npm test` (run.ts configura el FCM falso)');

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const one = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows[0];
const stamp = Date.now();
const rnd = () => randomBytes(6).toString('hex');

// ── FCM falso ────────────────────────────────────────────────────────────────
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PROJECT = `rocco-test-${stamp}`;
const serviceAccount = {
  type: 'service_account', project_id: PROJECT, client_email: `push@${PROJECT}.iam.gserviceaccount.com`,
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
};
const ACCESS = `fake-access-${rnd()}`;
type Sent = { token: string; title: string; body: string; data: Record<string, string>; channel: string; priority: string };
const sent: Sent[] = [];
const tokenRequests: { iss: string; scope: string }[] = [];

const fake = http.createServer((req, res) => {
  let raw = '';
  req.on('data', d => { raw += d; });
  req.on('end', () => {
    const reply = (status: number, json: unknown) => res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(json));
    if (req.url === '/token') {
      // Comprueba de verdad el JWT RS256 del service account
      const form = new URLSearchParams(raw);
      const [h, p, s] = (form.get('assertion') ?? '').split('.');
      const ok = form.get('grant_type') === 'urn:ietf:params:oauth:grant-type:jwt-bearer'
        && createVerify('RSA-SHA256').update(`${h}.${p}`).verify(publicKey, Buffer.from(s ?? '', 'base64url'));
      if (!ok) return reply(400, { error: 'invalid_grant' });
      tokenRequests.push(JSON.parse(Buffer.from(p, 'base64url').toString()));
      return reply(200, { access_token: ACCESS, expires_in: 3600, token_type: 'Bearer' });
    }
    if (req.url !== `/v1/projects/${PROJECT}/messages:send`) return reply(404, { error: 'no simulado' });
    if (req.headers.authorization !== `Bearer ${ACCESS}`) return reply(401, { error: { status: 'UNAUTHENTICATED' } });
    const { message } = JSON.parse(raw);
    if (String(message.token).startsWith('dead-')) {
      return reply(404, { error: { code: 404, status: 'NOT_FOUND', message: 'Requested entity was not found.',
        details: [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode: 'UNREGISTERED' }] } });
    }
    sent.push({
      token: message.token, title: message.notification.title, body: message.notification.body, data: message.data,
      channel: message.android?.notification?.channel_id, priority: message.android?.priority,
    });
    reply(200, { name: `projects/${PROJECT}/messages/${rnd()}` });
  });
});

// ── Utilidades ───────────────────────────────────────────────────────────────
async function api(token: string | null, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}
async function until<T>(what: string, fn: () => Promise<T | null | undefined | false> | T | null | undefined | false, ms = 6000): Promise<T> {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error(`Tiempo agotado esperando: ${what}`);
    await new Promise(r => setTimeout(r, 50));
  }
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const to = (token: string) => sent.filter(s => s.token === token);
let seq = 0;
const phoneN = () => `5841277${String(stamp).slice(-3)}${String(++seq).padStart(2, '0')}`;

type U = { id: string; token: string; device: string };
const ctx = {} as {
  orgId: string; otherOrgId: string; waSecret: string; instance: string;
  owner: U; agent: U; noConv: U; multi: U; calId: string; pipelineId: string; stageId: string;
};

function waInbound(phone: string, message: Record<string, unknown>, messageType = 'conversation') {
  return api(null, 'POST', `/wa/webhook/${ctx.waSecret}`, {
    event: 'messages.upsert', instance: ctx.instance,
    data: {
      key: { remoteJid: `${phone}@s.whatsapp.net`, fromMe: false, id: `WA-${rnd()}${rnd()}` },
      pushName: 'Cliente Push', messageType, message, messageTimestamp: Math.floor(Date.now() / 1000),
    },
  });
}
const text = (phone: string, t: string) => waInbound(phone, { conversation: t });

async function user(orgId: string, name: string, role: string, perms: string[], tokenOrg = orgId): Promise<U> {
  const id = (await one(
    `INSERT INTO users (organization_id, email, password_hash, name, role, permissions) VALUES ($1,$2,'x',$3,$4,$5) RETURNING id`,
    [orgId, `push-${name.toLowerCase()}-${stamp}@test.local`, name, role, JSON.stringify(perms)],
  )).id as string;
  const token = jwt.sign({ userId: id, organizationId: tokenOrg, role }, SECRET, { expiresIn: '10m' });
  return { id, token, device: `fcm-${name.toLowerCase()}-${rnd()}-${stamp}` };
}

before(async () => {
  await new Promise<void>(r => fake.listen(FCM_PORT, r));
  writeFileSync(SA_FILE, JSON.stringify(serviceAccount));

  ctx.orgId = (await one(`INSERT INTO organizations (name) VALUES ($1) RETURNING id`, [`Push ${stamp}`])).id;
  ctx.otherOrgId = (await one(`INSERT INTO organizations (name) VALUES ($1) RETURNING id`, [`Push otra ${stamp}`])).id;
  ctx.owner = await user(ctx.orgId, 'Duena', 'owner', []);
  ctx.agent = await user(ctx.orgId, 'Agente', 'member', ['conversations', 'opportunities']);
  ctx.noConv = await user(ctx.orgId, 'SinConv', 'member', ['contacts']);
  // Usuario cuya org primaria es otra: pertenece a esta solo por user_organizations
  ctx.multi = await user(ctx.otherOrgId, 'Multi', 'member', ['conversations', 'opportunities'], ctx.orgId);
  await db.query(`INSERT INTO user_organizations (user_id, organization_id, role) VALUES ($1, $2, 'member')`, [ctx.multi.id, ctx.orgId]);

  ctx.instance = `push-${stamp}`;
  ctx.waSecret = (await one(
    `INSERT INTO wa_settings (organization_id, instance_name, session_status) VALUES ($1, $2, 'connected') RETURNING webhook_secret`,
    [ctx.orgId, ctx.instance],
  )).webhook_secret;
  ctx.pipelineId = (await one(`INSERT INTO pipelines (organization_id, name) VALUES ($1, 'Ventas') RETURNING id`, [ctx.orgId])).id;
  ctx.stageId = (await one(`INSERT INTO pipeline_stages (pipeline_id, name, position) VALUES ($1, 'Nuevo', 0) RETURNING id`, [ctx.pipelineId])).id;
  ctx.calId = (await one(
    `INSERT INTO calendars (organization_id, user_id, name, slug, timezone, booking_enabled) VALUES ($1, $2, 'Llamadas', $3, 'America/New_York', true) RETURNING id`,
    [ctx.orgId, ctx.agent.id, `push-${stamp}`],
  )).id;
});

after(async () => {
  rmSync(SA_FILE, { force: true });
  fake.closeAllConnections();
  fake.close();
  for (const id of [ctx.orgId, ctx.otherOrgId]) {
    await db.query(`DELETE FROM crm_audit_log WHERE organization_id = $1`, [id]).catch(() => {});
    await db.query(`DELETE FROM organizations WHERE id = $1`, [id]).catch(() => {});
  }
  await db.end();
});

// ── Tests ────────────────────────────────────────────────────────────────────

test('registrar token: 201, validación, upsert y reasignación por token', async () => {
  assert.equal((await api(ctx.owner.token, 'POST', '/me/push-tokens', { token: 'x' })).status, 400);
  assert.equal((await api(ctx.owner.token, 'POST', '/me/push-tokens', { token: ctx.owner.device, platform: 'windows' })).status, 400);
  assert.equal((await api(null, 'POST', '/me/push-tokens', { token: ctx.owner.device, platform: 'android' })).status, 401);

  // Un token del mismo teléfono registrado antes por otro usuario pasa al que inicia sesión
  const r1 = await api(ctx.noConv.token, 'POST', '/me/push-tokens', { token: ctx.owner.device, platform: 'android' });
  assert.equal(r1.status, 201);
  const r2 = await api(ctx.owner.token, 'POST', '/me/push-tokens', { token: ctx.owner.device, platform: 'android', device_name: 'Pixel de la dueña' });
  assert.equal(r2.status, 201);
  assert.deepEqual(r2.data, { ok: true });
  const row = await one(`SELECT user_id, organization_id, platform, device_name FROM push_tokens WHERE token = $1`, [ctx.owner.device]);
  assert.equal(row.user_id, ctx.owner.id);
  assert.equal(row.organization_id, ctx.orgId);
  assert.equal(row.device_name, 'Pixel de la dueña');

  for (const u of [ctx.agent, ctx.noConv, ctx.multi]) {
    assert.equal((await api(u.token, 'POST', '/me/push-tokens', { token: u.device, platform: 'ios' })).status, 201);
  }
  assert.equal(Number((await one(`SELECT count(*) FROM push_tokens WHERE user_id = ANY($1::uuid[])`,
    [[ctx.owner.id, ctx.agent.id, ctx.noConv.id, ctx.multi.id]])).count), 4);
});

test('mensaje entrante de WhatsApp: push a quien tiene permiso de conversaciones (también multi-org), no al resto', async () => {
  const phone = phoneN();
  assert.equal((await text(phone, 'Hola, quiero información del plan')).status, 200);
  const p = await until('push a la dueña', () => to(ctx.owner.device)[0]);
  await until('push al agente', () => to(ctx.agent.device)[0]);
  await until('push al usuario multi-org (solo user_organizations)', () => to(ctx.multi.device)[0]);
  await sleep(300);
  assert.equal(to(ctx.noConv.device).length, 0, 'sin permiso de conversaciones no recibe');

  assert.equal(p.title, 'Cliente Push');
  assert.equal(p.body, 'Hola, quiero información del plan');
  assert.equal(p.channel, 'messages');
  assert.equal(p.priority, 'high');
  assert.equal(p.data.type, 'new_message');
  assert.equal(p.data.orgId, ctx.orgId);
  const conv = await one(`SELECT id, contact_id FROM conversations WHERE organization_id = $1 AND phone = $2`, [ctx.orgId, phone]);
  assert.equal(p.data.conversationId, conv.id);
  assert.equal(p.data.contactId, conv.contact_id);
  assert.ok(tokenRequests.length >= 1);
  assert.equal(tokenRequests[0].scope, 'https://www.googleapis.com/auth/firebase.messaging');
  // Los mensajes no llenan la campanita
  assert.equal(Number((await one(`SELECT count(*) FROM notifications WHERE organization_id = $1`, [ctx.orgId])).count), 0);
});

test('antispam: un push por conversación y usuario cada 2 minutos; otra conversación sí avisa', async () => {
  const phone = phoneN();
  await text(phone, 'Primer mensaje');
  await until('primer push', () => to(ctx.agent.device).find(s => s.body === 'Primer mensaje'));
  const before = to(ctx.agent.device).length;
  await text(phone, 'Segundo mensaje');
  await sleep(600);
  assert.equal(to(ctx.agent.device).length, before, 'el segundo mensaje no genera otro push');

  // Otra conversación + medio + texto largo
  await waInbound(phoneN(), { imageMessage: { mimetype: 'image/jpeg' } }, 'imageMessage');
  await until('push con foto', () => to(ctx.agent.device).find(s => s.body === '📷 Foto'));
  await text(phoneN(), 'x'.repeat(300));
  const long = await until('push de texto largo', () => to(ctx.agent.device).find(s => s.body.startsWith('xxx')));
  assert.ok(long.body.length <= 120);
});

test('mensaje de un lead con responsable: al responsable + admins, no a los demás', async () => {
  const phone = phoneN();
  const contactId = (await one(`INSERT INTO contacts (organization_id, first_name, phone) VALUES ($1, 'Con dueño', $2) RETURNING id`,
    [ctx.orgId, `+${phone}`])).id;
  await db.query(
    `INSERT INTO opportunities (organization_id, pipeline_id, stage_id, contact_id, title, owner_id) VALUES ($1,$2,$3,$4,'Lead asignado',$5)`,
    [ctx.orgId, ctx.pipelineId, ctx.stageId, contactId, ctx.agent.id],
  );
  await text(phone, 'Mensaje para mi asesor');
  await until('push al responsable', () => to(ctx.agent.device).find(s => s.body === 'Mensaje para mi asesor'));
  await until('push a la dueña', () => to(ctx.owner.device).find(s => s.body === 'Mensaje para mi asesor'));
  await sleep(300);
  assert.ok(!to(ctx.multi.device).find(s => s.body === 'Mensaje para mi asesor'), 'otro agente no lo recibe');
});

test('preferencias: GET por defecto todo true; new_message=false deja de recibir mensajes', async () => {
  const g = await api(ctx.agent.token, 'GET', '/me/notification-prefs');
  assert.equal(g.status, 200);
  assert.deepEqual(g.data, { prefs: { new_lead: true, new_message: true, appointment: true, task: true, system: true } });
  assert.equal((await api(ctx.agent.token, 'PUT', '/me/notification-prefs', { prefs: { new_message: 'no' } })).status, 400);
  const p = await api(ctx.agent.token, 'PUT', '/me/notification-prefs', { prefs: { new_message: false } });
  assert.equal(p.status, 200);
  assert.deepEqual(p.data.prefs, { new_lead: true, new_message: false, appointment: true, task: true, system: true });
  assert.equal((await api(ctx.agent.token, 'GET', '/me/notification-prefs')).data.prefs.new_message, false);

  await text(phoneN(), 'Mensaje con prefs');
  await until('push a la dueña', () => to(ctx.owner.device).find(s => s.body === 'Mensaje con prefs'));
  await sleep(300);
  assert.ok(!to(ctx.agent.device).find(s => s.body === 'Mensaje con prefs'), 'con new_message=false no recibe');
  await api(ctx.agent.token, 'PUT', '/me/notification-prefs', { prefs: { new_message: true } });
});

test('lead nuevo por automatización create_opportunity: campanita + push en el canal leads', async () => {
  const tag = `push-${stamp}`;
  await db.query(
    `INSERT INTO automation_rules (organization_id, trigger_type, name, enabled, config) VALUES ($1, 'tag_added', $2, true, $3)`,
    [ctx.orgId, `Lead ${stamp}`, JSON.stringify({ trigger: { tag }, steps: [{ id: 's1', type: 'create_opportunity', title: 'Lead de Ana', source: 'Instagram' }] })],
  );
  const contactId = (await one(`INSERT INTO contacts (organization_id, first_name, phone) VALUES ($1, 'Ana', $2) RETURNING id`,
    [ctx.orgId, `+${phoneN()}`])).id;
  // El motor corre en este proceso (mismas variables de entorno y el mismo FCM falso)
  await fireTagTrigger(ctx.orgId, contactId, [tag]);
  const p = await until('push de lead', () => to(ctx.agent.device).find(s => s.data.type === 'new_lead'));
  assert.equal(p.title, 'Nuevo lead');
  assert.equal(p.body, 'Lead de Ana · Instagram');
  assert.equal(p.channel, 'leads');
  assert.equal(p.priority, 'high');
  assert.equal(p.data.contactId, contactId);
  const opp = await one(`SELECT id FROM opportunities WHERE contact_id = $1`, [contactId]);
  assert.equal(p.data.opportunityId, opp.id);
  await until('campanita', async () => (await one(
    `SELECT 1 AS ok FROM notifications WHERE user_id = $1 AND type = 'new_lead' AND entity_id = $2`, [ctx.multi.id, opp.id])));
  await sleep(300);
  assert.ok(!to(ctx.noConv.device).find(s => s.data.type === 'new_lead'), 'sin permiso de oportunidades no recibe');
});

test('cancelación pública de una cita: aviso al dueño del calendario + admins', async () => {
  const start = new Date(Date.now() + 3 * 86400_000);
  const appt = await one(
    `INSERT INTO appointments (organization_id, user_id, calendar_id, title, start_at, end_at, timezone, status, provider)
     VALUES ($1, $2, $3, 'Reunión con Leo', $4, $5, 'America/New_York', 'scheduled', 'manual') RETURNING id, cancel_token`,
    [ctx.orgId, ctx.agent.id, ctx.calId, start.toISOString(), new Date(start.getTime() + 1800_000).toISOString()],
  );
  assert.equal((await api(null, 'POST', `/public/book/push-${stamp}/cancel/${appt.cancel_token}`)).status, 200);
  const p = await until('push de cancelación', () => to(ctx.agent.device).find(s => s.data.type === 'appointment_cancelled'));
  assert.equal(p.channel, 'agenda');
  assert.equal(p.data.appointmentId, appt.id);
  assert.match(p.body, /Reunión con Leo/);
  await until('push a la dueña', () => to(ctx.owner.device).find(s => s.data.type === 'appointment_cancelled'));
  await sleep(300);
  assert.ok(!to(ctx.multi.device).find(s => s.data.type === 'appointment_cancelled'));
});

test('token UNREGISTERED: FCM lo rechaza y se borra', async () => {
  const dead = `dead-${rnd()}-${stamp}`;
  assert.equal((await api(ctx.owner.token, 'POST', '/me/push-tokens', { token: dead, platform: 'android' })).status, 201);
  await text(phoneN(), 'Mensaje al token muerto');
  await until('token borrado', async () => !(await one(`SELECT 1 FROM push_tokens WHERE token = $1`, [dead])));
  // El otro dispositivo de la dueña sí lo recibió
  await until('push al token bueno', () => to(ctx.owner.device).find(s => s.body === 'Mensaje al token muerto'));
});

test('DELETE /me/push-tokens: 204 y solo borra tokens propios', async () => {
  const mine = `fcm-temp-${rnd()}-${stamp}`;
  await api(ctx.agent.token, 'POST', '/me/push-tokens', { token: mine, platform: 'android' });
  assert.equal((await api(ctx.noConv.token, 'DELETE', '/me/push-tokens', { token: mine })).status, 204);
  assert.ok(await one(`SELECT 1 AS ok FROM push_tokens WHERE token = $1`, [mine]), 'el de otro usuario no se borra');
  assert.equal((await api(ctx.agent.token, 'DELETE', '/me/push-tokens', { token: mine })).status, 204);
  assert.equal(await one(`SELECT 1 AS ok FROM push_tokens WHERE token = $1`, [mine]), undefined);
});

test('sin credenciales de FCM: no se envía nada y no se rompe nada', async () => {
  rmSync(SA_FILE, { force: true });
  const n = sent.length;
  const phone = phoneN();
  assert.equal((await text(phone, 'Mensaje sin push')).status, 200);
  await until('conversación creada', async () => (await one(
    `SELECT 1 AS ok FROM conversations WHERE organization_id = $1 AND phone = $2 AND last_message_preview = 'Mensaje sin push'`, [ctx.orgId, phone])));
  await sleep(500);
  assert.equal(sent.length, n);
  // Los tokens siguen ahí para cuando se activen las credenciales
  assert.ok(await one(`SELECT 1 AS ok FROM push_tokens WHERE token = $1`, [ctx.agent.device]));
});
