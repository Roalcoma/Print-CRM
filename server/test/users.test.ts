// Usuarios, permisos y contraseñas: límite de usuarios del plan, módulos restringidos
// (calendario, mensajes, automatizaciones) y contraseña temporal obligatoria.
// Lo corre `npm test` (test/run.ts) contra el servidor de pruebas. NUNCA contra producción.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3202';
if (BASE.includes('rocco.arbolaureo.org')) throw new Error('No correr los tests contra producción');
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });

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
const login = (email: string, password: string) => api(null, 'POST', '/auth/login', { email, password });

const stamp = Date.now();
const mail = (tag: string) => `users-${tag}-${stamp}@test.local`;
let owner: { token: string; orgId: string; userId: string };
let planId: string;
let clientId: string;
let member: { id: string; email: string };

before(async () => {
  const r = await api(null, 'POST', '/auth/register', {
    organizationName: `Usuarios ${stamp}`, name: 'Dueño', email: mail('owner'), password: 'owner-12345',
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  owner = { token: r.data.token, orgId: r.data.user.organizationId, userId: r.data.user.id };
});

after(async () => {
  if (clientId) await db.query('DELETE FROM agency_clients WHERE id=$1', [clientId]);
  if (planId) await db.query('DELETE FROM plans WHERE id=$1', [planId]);
  await db.end();
});

test('sin plan asignado no hay límite de usuarios', async () => {
  const r = await api(owner.token, 'GET', '/users/limit');
  assert.equal(r.status, 200);
  assert.deepEqual(r.data, { used: 1, max: null });
});

test('límite del plan: owner + max_users (+ cortesía); el siguiente da 409', async () => {
  planId = (await db.query(
    `INSERT INTO plans (name, slug, price_usd, max_users) VALUES ($1,$2,0,2) RETURNING id`,
    [`Test ${stamp}`, `test-users-${stamp}`],
  )).rows[0].id;
  clientId = (await db.query(
    `INSERT INTO agency_clients (organization_id, name, email, plan_id) VALUES ($1,'Test',$2,$3) RETURNING id`,
    [owner.orgId, mail('owner'), planId],
  )).rows[0].id;

  assert.deepEqual((await api(owner.token, 'GET', '/users/limit')).data, { used: 1, max: 3 });

  const m = await api(owner.token, 'POST', '/users', {
    name: 'Miembro', email: mail('member'), password: 'temporal-123', role: 'member', permissions: ['contacts'],
  });
  assert.equal(m.status, 201, JSON.stringify(m.data));
  member = { id: m.data.id, email: mail('member') };
  const a = await api(owner.token, 'POST', '/users', {
    name: 'Admin', email: mail('admin'), password: 'temporal-123', role: 'admin',
  });
  assert.equal(a.status, 201, JSON.stringify(a.data));

  const over = await api(owner.token, 'POST', '/users', {
    name: 'Extra', email: mail('extra'), password: 'temporal-123', role: 'member',
  });
  assert.equal(over.status, 409);
  assert.match(over.data.error, /plan permite 3 usuarios/);

  // Un usuario de cortesía amplía el límite en uno
  await db.query('UPDATE agency_clients SET courtesy_extra_users=1 WHERE id=$1', [clientId]);
  const extra = await api(owner.token, 'POST', '/users', {
    name: 'Extra', email: mail('extra'), password: 'temporal-123', role: 'member',
  });
  assert.equal(extra.status, 201, JSON.stringify(extra.data));
  const over2 = await api(owner.token, 'POST', '/users', {
    name: 'Extra 2', email: mail('extra2'), password: 'temporal-123', role: 'member',
  });
  assert.equal(over2.status, 409);
});

test('miembro sin permiso recibe 403 en calendario, mensajes y automatizaciones', async () => {
  const l = await login(member.email, 'temporal-123');
  assert.equal(l.status, 200);
  const t = l.data.token as string;

  assert.equal((await api(t, 'GET', '/contacts')).status, 200);
  for (const p of ['/appointments', '/calendars', '/calendars/mine', '/conversations', '/automations']) {
    assert.equal((await api(t, 'GET', p)).status, 403, `GET ${p} debería ser 403`);
  }

  // Al darle los módulos, accede
  const p = await api(owner.token, 'PATCH', `/users/${member.id}`, { permissions: ['contacts', 'calendar', 'conversations', 'automations'] });
  assert.equal(p.status, 200, JSON.stringify(p.data));
  for (const path of ['/appointments', '/calendars/mine', '/conversations', '/automations']) {
    assert.equal((await api(t, 'GET', path)).status, 200, `GET ${path} debería ser 200`);
  }
});

test('la página pública de reservas no exige permisos', async () => {
  const slug = `users-test-${stamp}`;
  const c = await api(owner.token, 'POST', '/calendars', { name: 'Reservas', slug, duration_minutes: 30, booking_enabled: true });
  assert.equal(c.status, 201, JSON.stringify(c.data));
  assert.equal((await api(null, 'GET', `/public/book/${slug}`)).status, 200);
});

test('contraseña temporal: hay que cambiarla y luego se desmarca', async () => {
  const l = await login(member.email, 'temporal-123');
  assert.equal(l.data.user.mustChangePassword, true);
  const t = l.data.token as string;
  assert.equal((await api(t, 'GET', '/me')).data.mustChangePassword, true);

  const same = await api(t, 'POST', '/me/password', { current_password: 'temporal-123', new_password: 'temporal-123' });
  assert.equal(same.status, 400);
  const ch = await api(t, 'POST', '/me/password', { current_password: 'temporal-123', new_password: 'definitiva-123' });
  assert.equal(ch.status, 200);
  // Cambiarla cierra las demás sesiones (token_version): sigue con el token nuevo
  assert.equal((await api(t, 'GET', '/me')).status, 401);
  assert.equal((await api(ch.data.token, 'GET', '/me')).data.mustChangePassword, false);

  // El owner registrado por sí mismo no tiene que cambiarla
  assert.equal((await api(owner.token, 'GET', '/me')).data.mustChangePassword, false);
});

test('admin restablece la contraseña de un miembro (temporal) pero no la del owner', async () => {
  const r = await api(owner.token, 'POST', `/users/${member.id}/reset-password`, {});
  assert.equal(r.status, 200);
  assert.ok(typeof r.data.password === 'string' && r.data.password.length >= 8);

  assert.equal((await login(member.email, 'definitiva-123')).status, 401);
  const l = await login(member.email, r.data.password);
  assert.equal(l.status, 200);
  assert.equal(l.data.user.mustChangePassword, true);

  // Un admin (no owner) no puede restablecer la del owner
  const adminLogin = await login(mail('admin'), 'temporal-123');
  assert.equal(adminLogin.status, 200);
  const deny = await api(adminLogin.data.token, 'POST', `/users/${owner.userId}/reset-password`, {});
  assert.equal(deny.status, 403);

  // Un miembro no puede restablecer contraseñas
  const denyMember = await api(l.data.token, 'POST', `/users/${owner.userId}/reset-password`, {});
  assert.equal(denyMember.status, 403);
});
