// Sesiones revocables, token de media de vida corta, ticket del WebSocket y permisos en los
// eventos del WebSocket. Lo corre `npm test` (test/run.ts) contra el servidor de pruebas.
// NUNCA contra producción. Las cuentas se crean directo en la BD (no por /auth/register)
// para no gastar el rate limit de auth; los JWT se firman con la clave del .env local.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { hashPassword } from '../src/auth/password.ts';

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3202';
if (BASE.includes('rocco.arbolaureo.org')) throw new Error('No correr los tests contra producción');
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const SECRET = process.env.JWT_SECRET!;

async function api(token: string | null, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}

const stamp = Date.now();
let orgId: string;
let otherOrgId: string;
let hash: string;
let owner: { id: string; token: string };
const agencyAdminIds: string[] = [];
const tokenFor = (userId: string, role: string, extra: Record<string, unknown> = {}) =>
  jwt.sign({ userId, organizationId: orgId, role, ...extra }, SECRET, { expiresIn: '10m' });

async function newUser(tag: string, role: string, perms: string[] = []) {
  const id = (await db.query(
    `INSERT INTO users (organization_id, email, password_hash, name, role, permissions)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb) RETURNING id`,
    [orgId, `ses-${tag}-${stamp}@test.local`, hash, tag, role, JSON.stringify(perms)],
  )).rows[0].id as string;
  return { id, token: tokenFor(id, role) };
}

before(async () => {
  hash = await hashPassword('sesiones-123');
  orgId = (await db.query(`INSERT INTO organizations (name) VALUES ($1) RETURNING id`, [`Sesiones ${stamp}`])).rows[0].id;
  otherOrgId = (await db.query(`INSERT INTO organizations (name) VALUES ($1) RETURNING id`, [`Sesiones otra ${stamp}`])).rows[0].id;
  owner = await newUser('owner', 'owner');
});

after(async () => {
  for (const id of agencyAdminIds) await db.query('DELETE FROM agency_admins WHERE id=$1', [id]).catch(() => {});
  await db.query('DELETE FROM organizations WHERE id = ANY($1)', [[orgId, otherOrgId]]).catch(() => {});
  await db.end();
});

// ── 1. Sesiones revocables ──────────────────────────────────────────────────
test('usuario borrado: su token deja de valer en la siguiente petición', async () => {
  const m = await newUser('borrado', 'member', ['contacts']);
  assert.equal((await api(m.token, 'GET', '/me')).status, 200);   // queda en caché como válido
  assert.equal((await api(owner.token, 'DELETE', `/users/${m.id}`)).status, 204);
  assert.equal((await api(m.token, 'GET', '/me')).status, 401);
});

test('usuario fuera de la organización del token → 401', async () => {
  const m = await newUser('movido', 'member', ['contacts']);
  await db.query('UPDATE users SET organization_id=$1 WHERE id=$2', [otherOrgId, m.id]);
  assert.equal((await api(m.token, 'GET', '/me')).status, 401);
});

test('usuario de otra org pero miembro por user_organizations (multi-org) → vale', async () => {
  const m = await newUser('multiorg', 'member', ['contacts']);
  await db.query('UPDATE users SET organization_id=$1 WHERE id=$2', [otherOrgId, m.id]);
  await db.query('INSERT INTO user_organizations (user_id, organization_id, role) VALUES ($1,$2,$3)', [m.id, orgId, 'member']);
  assert.equal((await api(m.token, 'GET', '/me')).status, 200);
});

test('token de un usuario que no existe → 401', async () => {
  const ghost = tokenFor('00000000-0000-0000-0000-00000000dead', 'owner');
  assert.equal((await api(ghost, 'GET', '/me')).status, 401);
});

test('token sin `tv` (emitido antes de la migración) sigue valiendo', async () => {
  const m = await newUser('legado', 'member', ['contacts']);
  assert.equal((await api(m.token, 'GET', '/contacts')).status, 200);
});

test('restablecer contraseña cierra las sesiones abiertas del usuario', async () => {
  const m = await newUser('reset', 'member', ['contacts']);
  assert.equal((await api(m.token, 'GET', '/me')).status, 200);
  const r = await api(owner.token, 'POST', `/users/${m.id}/reset-password`, {});
  assert.equal(r.status, 200);
  assert.equal((await api(m.token, 'GET', '/me')).status, 401);
  // Un token con la versión nueva sí entra
  const tv = (await db.query('SELECT token_version FROM users WHERE id=$1', [m.id])).rows[0].token_version;
  assert.equal((await api(tokenFor(m.id, 'member', { tv }), 'GET', '/me')).status, 200);
});

test('cambiar la contraseña propia devuelve un token nuevo y cierra los demás', async () => {
  const m = await newUser('propia', 'member', ['contacts']);
  const r = await api(m.token, 'POST', '/me/password', { current_password: 'sesiones-123', new_password: 'sesiones-456' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.ok(r.data.token);
  assert.equal((await api(m.token, 'GET', '/me')).status, 401);
  assert.equal((await api(r.data.token, 'GET', '/me')).status, 200);
});

test('cambio de permisos aplica al momento (caché invalidada)', async () => {
  const m = await newUser('perm', 'member', ['contacts']);
  assert.equal((await api(m.token, 'GET', '/contacts')).status, 200);
  assert.equal((await api(owner.token, 'PATCH', `/users/${m.id}`, { permissions: [] })).status, 200);
  assert.equal((await api(m.token, 'GET', '/contacts')).status, 403);
});

// ── Agencia ─────────────────────────────────────────────────────────────────
test('admin de agencia desactivado → 401 (también su impersonación)', async () => {
  const adminId = (await db.query(
    `INSERT INTO agency_admins (email, password_hash, name, role) VALUES ($1,$2,'Agencia','superadmin') RETURNING id`,
    [`ses-agency-${stamp}@test.local`, hash],
  )).rows[0].id as string;
  agencyAdminIds.push(adminId);
  const agencyToken = jwt.sign({ type: 'agency', adminId, role: 'superadmin' }, SECRET, { expiresIn: '10m' });
  assert.equal((await api(agencyToken, 'GET', '/agency/clients?limit=1')).status, 200);

  const imp = tokenFor(owner.id, 'owner', { impersonatedByAgency: true, agencyAdminId: adminId, n: 'imp' });
  assert.equal((await api(imp, 'GET', '/me')).status, 200);

  await db.query('UPDATE agency_admins SET is_active=false WHERE id=$1', [adminId]);
  assert.equal((await api(agencyToken, 'GET', '/agency/clients?limit=1')).status, 401);
  // Impersonación emitida por ese admin (sin caché previa) → 401
  const u2 = await newUser('imp2', 'admin');
  const imp2 = tokenFor(u2.id, 'admin', { impersonatedByAgency: true, agencyAdminId: adminId });
  assert.equal((await api(imp2, 'GET', '/me')).status, 401);

  // Admin borrado: igual
  await db.query('DELETE FROM agency_admins WHERE id=$1', [adminId]);
  assert.equal((await api(agencyToken, 'GET', '/agency/clients?limit=1')).status, 401);
});

// ── 2. Token de media ───────────────────────────────────────────────────────
test('media: solo acepta el token de media por query, nunca la sesión; Cache-Control private', async () => {
  // La sesión en la URL ya no vale
  assert.equal((await api(null, 'GET', `/media/00000000-0000-0000-0000-000000000000?t=${owner.token}`)).status, 401);
  // Sin permiso de mensajes no se emite token de media
  const sin = await newUser('sinmedia', 'member', ['contacts']);
  assert.equal((await api(sin.token, 'POST', '/media-token')).status, 403);

  const t = await api(owner.token, 'POST', '/media-token');
  assert.equal(t.status, 200);
  const payload = jwt.decode(t.data.token) as { typ: string; exp: number; iat: number };
  assert.equal(payload.typ, 'media');
  assert.ok(payload.exp - payload.iat <= 600);
  // El token de media no sirve como sesión
  assert.equal((await api(t.data.token, 'GET', '/me')).status, 401);

  // Sirve un adjunto cacheado (data URI) con Cache-Control private
  const contact = (await db.query(
    `INSERT INTO contacts (organization_id, first_name, phone) VALUES ($1,'Media','5800000${String(stamp).slice(-5)}') RETURNING id`, [orgId],
  )).rows[0].id;
  await db.query(
    `INSERT INTO wa_settings (organization_id, instance_name) VALUES ($1,$2)`, [orgId, `ses-media-${stamp}`],
  );
  const conv = (await db.query(
    `INSERT INTO conversations (organization_id, contact_id, wa_chat_id, display_name) VALUES ($1,$2,$3,'Media') RETURNING id`,
    [orgId, contact, `58000${stamp}@s.whatsapp.net`],
  )).rows[0].id;
  const msg = (await db.query(
    `INSERT INTO conv_messages (organization_id, conversation_id, direction, msg_type, media_url, media_mime, wa_message_id)
     VALUES ($1,$2,'inbound','image','data:image/png;base64,iVBORw0KGgo=','image/png',$3) RETURNING id`,
    [orgId, conv, `WA-MEDIA-${stamp}`],
  )).rows[0].id;
  const ok = await fetch(`${BASE}/api/media/${msg}?t=${encodeURIComponent(t.data.token)}`);
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('cache-control') ?? '', /^private/);
  assert.equal(ok.headers.get('content-type'), 'image/png');

  // Token de media de otra org no ve el adjunto
  const foreign = jwt.sign({ typ: 'media', userId: owner.id, organizationId: otherOrgId }, SECRET, { expiresIn: '5m' });
  assert.equal((await fetch(`${BASE}/api/media/${msg}?t=${foreign}`)).status, 401);
});

// ── 3. WebSocket: ticket y permisos por evento ──────────────────────────────
function wsOpen(url: string) {
  const ws = new WebSocket(url);
  const events: { type: string; data: any }[] = [];
  ws.onmessage = e => events.push(JSON.parse(String(e.data)));
  const closed = new Promise<number>(r => { ws.onclose = e => r(e.code); });
  return { ws, events, closed };
}
const wsBase = BASE.replace(/^http/, 'ws') + '/ws';
async function until<T>(what: string, fn: () => T | null | undefined | false, ms = 5000): Promise<T> {
  const t0 = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error(`Tiempo agotado esperando: ${what}`);
    await new Promise(r => setTimeout(r, 50));
  }
}
const ticket = async (token: string) => {
  const r = await api(token, 'POST', '/ws-ticket');
  assert.equal(r.status, 200);
  return r.data.ticket as string;
};

test('WS: el ticket es de un solo uso y un token inválido no conecta', async () => {
  const tk = await ticket(owner.token);
  const a = wsOpen(`${wsBase}?ticket=${tk}`);
  await until('conectado', () => a.events.find(e => e.type === 'connected'));
  const b = wsOpen(`${wsBase}?ticket=${tk}`);
  assert.equal(await b.closed, 4001);
  a.ws.close();
  const c = wsOpen(`${wsBase}?ticket=inventado`);
  assert.equal(await c.closed, 4001);
});

test('WS: miembro sin permiso de mensajes no recibe message:new; con permiso sí', async () => {
  const sin = await newUser('ws-sin', 'member', ['contacts']);
  const con = await newUser('ws-con', 'member', ['conversations']);
  const conns = [
    wsOpen(`${wsBase}?ticket=${await ticket(sin.token)}`),
    wsOpen(`${wsBase}?ticket=${await ticket(con.token)}`),
    wsOpen(`${wsBase}?ticket=${await ticket(owner.token)}`),
  ];
  for (const c of conns) await until('conectado', () => c.events.find(e => e.type === 'connected'));
  const [cSin, cCon, cOwner] = conns;

  // Mensaje entrante real por el webhook de Evolution
  const secret = (await db.query(
    `INSERT INTO wa_settings (organization_id, instance_name, is_default) VALUES ($1,$2,false) RETURNING webhook_secret`,
    [orgId, `ses-ws-${stamp}`],
  )).rows[0].webhook_secret;
  const inbound = (id: string) => api(null, 'POST', `/wa/webhook/${secret}`, {
    event: 'messages.upsert', instance: `ses-ws-${stamp}`,
    data: {
      key: { remoteJid: `58414${String(stamp).slice(-7)}@s.whatsapp.net`, fromMe: false, id },
      pushName: 'Cliente WS', messageType: 'conversation', message: { conversation: 'hola secreto' },
      messageTimestamp: Math.floor(Date.now() / 1000),
    },
  });
  assert.equal((await inbound(`WA-WS-${stamp}`)).status, 200);
  await until('message:new al miembro con permiso', () => cCon.events.find(e => e.type === 'message:new'));
  await until('message:new al owner', () => cOwner.events.find(e => e.type === 'message:new'));
  await new Promise(r => setTimeout(r, 300));
  assert.ok(!cSin.events.some(e => e.type.startsWith('message:') || e.type.startsWith('conversation:')),
    'el miembro sin permiso de mensajes recibió el evento');

  // Al quitarle el permiso al que lo tenía, deja de recibir (la conexión se revalida)
  assert.equal((await api(owner.token, 'PATCH', `/users/${con.id}`, { permissions: ['contacts'] })).status, 200);
  await new Promise(r => setTimeout(r, 200));
  const before = cCon.events.length;
  assert.equal((await inbound(`WA-WS2-${stamp}`)).status, 200);
  await until('segundo message:new al owner', () => cOwner.events.filter(e => e.type === 'message:new').length >= 2);
  await new Promise(r => setTimeout(r, 300));
  assert.ok(!cCon.events.slice(before).some(e => e.type.startsWith('message:')), 'tras quitarle el permiso siguió recibiendo mensajes');
  // Al borrar al usuario, su WebSocket se cierra
  assert.equal((await api(owner.token, 'DELETE', `/users/${sin.id}`)).status, 204);
  assert.equal(await cSin.closed, 4001);
  for (const c of [cCon, cOwner]) c.ws.close();
});
