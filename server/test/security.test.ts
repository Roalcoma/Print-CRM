// Seguridad y permisos: `state` de OAuth firmado, borrados reservados a admin/dueño,
// rate limit del login de agencia, emails sin distinguir mayúsculas y Lead Ads (sin falsos
// positivos al buscar contacto y sin procesar dos veces el mismo leadgen_id).
// Lo corre `npm test` (test/run.ts) contra el servidor de pruebas. NUNCA contra producción.
// La cuenta se crea directo en la BD (no por /auth/register) para no gastar el rate limit de auth.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHmac } from 'node:crypto';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { hashPassword } from '../src/auth/password.ts';
import { signOAuthState } from '../src/auth/oauth-state.ts';

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3202';
const FAKE = new URL(process.env.TEST_FAKE_URL ?? 'http://localhost:4202');
if (BASE.includes('rocco.arbolaureo.org')) throw new Error('No correr los tests contra producción');
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const SECRET = process.env.JWT_SECRET!;

// ── Meta / Google falsos (mismo puerto que flows.test.ts; los archivos corren uno tras otro) ──
const LEAD_DATA: Record<string, unknown> = {};
const fake = http.createServer((req, res) => {
  req.resume();
  req.on('end', () => {
    const p = req.url ?? '';
    let out: [number, unknown] = [404, { error: { message: `ruta no simulada: ${p}` } }];
    if (p === '/google-token') out = [200, { access_token: 'ya29.fake', refresh_token: '1//refresh-fake', expires_in: 3600 }];
    const lead = p.match(/^\/fb\/v19\.0\/([^/?]+)\?fields=id,created_time,field_data/);
    if (lead && LEAD_DATA[lead[1]]) out = [200, { id: lead[1], field_data: LEAD_DATA[lead[1]] }];
    res.writeHead(out[0], { 'Content-Type': 'application/json' }).end(JSON.stringify(out[1]));
  });
});

async function api(token: string | null, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    method, redirect: 'manual',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
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

const stamp = Date.now();
const ownerEmail = `sec-owner-${stamp}@test.local`;
let orgId: string;
let owner: { id: string; token: string };
let member: { id: string; token: string };
const tokenFor = (userId: string, role: string) => jwt.sign({ userId, organizationId: orgId, role }, SECRET, { expiresIn: '10m' });

before(async () => {
  await new Promise<void>(r => fake.listen(Number(FAKE.port), r));
  orgId = (await db.query(`INSERT INTO organizations (name) VALUES ($1) RETURNING id`, [`Seguridad ${stamp}`])).rows[0].id;
  const hash = await hashPassword('seguridad-123');
  const o = (await db.query(
    `INSERT INTO users (organization_id, email, password_hash, name, role) VALUES ($1,$2,$3,'Dueño','owner') RETURNING id`,
    [orgId, ownerEmail, hash],
  )).rows[0].id;
  const m = (await db.query(
    `INSERT INTO users (organization_id, email, password_hash, name, role, permissions)
     VALUES ($1,$2,$3,'Miembro','member','["opportunities","calendar"]'::jsonb) RETURNING id`,
    [orgId, `sec-member-${stamp}@test.local`, hash],
  )).rows[0].id;
  owner = { id: o, token: tokenFor(o, 'owner') };
  member = { id: m, token: tokenFor(m, 'member') };
});

after(async () => {
  await new Promise(r => fake.close(r));
  await db.query('DELETE FROM organizations WHERE id=$1', [orgId]).catch(() => {});
  await db.end();
});

// ── 1. state de OAuth ────────────────────────────────────────────────────────
const googleToken = async () => (await db.query(
  'SELECT google_refresh_token FROM calendar_settings WHERE user_id=$1 AND organization_id=$2', [owner.id, orgId],
)).rows[0]?.google_refresh_token ?? null;

test('OAuth Google: un state "userId:orgId" plano se rechaza y no guarda nada', async () => {
  const r = await api(null, 'GET', `/calendar/google/callback?code=x&state=${owner.id}:${orgId}`);
  assert.equal(r.status, 302);
  assert.match(r.headers.get('location') ?? '', /error=oauth_state/);
  assert.equal(await googleToken(), null);
});

test('OAuth Google: state manipulado, firmado con otro secreto o de otro proveedor → rechazado', async () => {
  const good = signOAuthState({ userId: owner.id, orgId, provider: 'google' });
  const [h, p, s] = good.split('.');
  const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
  const tampered = `${h}.${Buffer.from(JSON.stringify({ ...payload, org: '00000000-0000-0000-0000-000000000001' })).toString('base64url')}.${s}`;
  const otherSecret = jwt.sign({ ...payload }, 'otro-secreto');
  const zoom = signOAuthState({ userId: owner.id, orgId, provider: 'zoom' });
  const expired = jwt.sign({ typ: 'oauth_state', uid: owner.id, org: orgId, prv: 'google', n: 'x', exp: Math.floor(Date.now() / 1000) - 5 }, SECRET);
  for (const st of [tampered, otherSecret, zoom, expired]) {
    const r = await api(null, 'GET', `/calendar/google/callback?code=x&state=${encodeURIComponent(st)}`);
    assert.equal(r.status, 302);
    assert.match(r.headers.get('location') ?? '', /error=oauth_state/);
  }
  assert.equal(await googleToken(), null);
});

test('OAuth Google: el flujo normal (connect → callback con su state) sigue funcionando', async () => {
  const c = await api(owner.token, 'GET', '/calendar/google/connect');
  assert.equal(c.status, 200, JSON.stringify(c.data));
  const state = new URL(c.data.url).searchParams.get('state')!;
  assert.ok(state.split('.').length === 3, 'el state es un JWT');
  const r = await api(null, 'GET', `/calendar/google/callback?code=ok&state=${encodeURIComponent(state)}`);
  assert.equal(r.status, 302);
  assert.match(r.headers.get('location') ?? '', /connected=google/);
  assert.ok(await googleToken(), 'guarda el refresh token');
});

test('OAuth Instagram/Facebook: state = orgId plano → rechazado', async () => {
  for (const prov of ['instagram', 'facebook']) {
    const r = await api(null, 'GET', `/social/${prov}/callback?code=x&state=${orgId}`);
    assert.equal(r.status, 302, prov);
    assert.match(r.headers.get('location') ?? '', /error=oauth_state/, prov);
  }
  // Un state de Google no vale para Instagram
  const g = signOAuthState({ userId: owner.id, orgId, provider: 'google' });
  const r = await api(null, 'GET', `/social/instagram/callback?code=x&state=${encodeURIComponent(g)}`);
  assert.match(r.headers.get('location') ?? '', /error=oauth_state/);
});

test('un state de OAuth no sirve como token de sesión', async () => {
  const st = signOAuthState({ userId: owner.id, orgId, provider: 'google' });
  assert.equal((await api(st, 'GET', '/contacts')).status, 401);
});

// ── 2. Borrados peligrosos ───────────────────────────────────────────────────
test('pipelines: el miembro no puede borrar (403); con oportunidades → 409; vacío → 204 + auditoría', async () => {
  const p = await api(owner.token, 'POST', '/pipelines', { name: 'A borrar' });
  assert.equal(p.status, 201);
  const stage = (await db.query('SELECT id FROM pipeline_stages WHERE pipeline_id=$1', [p.data.id])).rows[0].id;
  const opp = (await db.query(
    `INSERT INTO opportunities (organization_id, pipeline_id, stage_id, title) VALUES ($1,$2,$3,'Opp') RETURNING id`,
    [orgId, p.data.id, stage],
  )).rows[0].id;

  assert.equal((await api(member.token, 'DELETE', `/pipelines/${p.data.id}`)).status, 403);
  const busy = await api(owner.token, 'DELETE', `/pipelines/${p.data.id}`);
  assert.equal(busy.status, 409);
  assert.match(busy.data.error, /oportunidades/);
  assert.ok((await db.query('SELECT 1 FROM opportunities WHERE id=$1', [opp])).rowCount, 'la oportunidad sigue ahí');

  await db.query('DELETE FROM opportunities WHERE id=$1', [opp]);
  assert.equal((await api(owner.token, 'DELETE', `/pipelines/${p.data.id}`)).status, 204);
  await until('auditoría del borrado', async () => (await db.query(
    `SELECT 1 FROM crm_audit_log WHERE organization_id=$1 AND action='pipeline.deleted' AND entity_id=$2`, [orgId, p.data.id],
  )).rowCount);
});

test('calendarios: solo el dueño o un admin pueden borrar', async () => {
  const mk = async (uid: string, tag: string) => (await db.query(
    `INSERT INTO calendars (organization_id, user_id, name, slug) VALUES ($1,$2,$3,$4) RETURNING id`,
    [orgId, uid, tag, `sec-${tag}-${stamp}`],
  )).rows[0].id as string;
  const o1 = await mk(owner.id, 'o1');
  await mk(owner.id, 'o2');
  const forbidden = await api(member.token, 'DELETE', `/calendars/${o1}`);
  assert.equal(forbidden.status, 403);
  assert.equal((await api(owner.token, 'DELETE', `/calendars/${o1}`)).status, 204);

  const m1 = await mk(member.id, 'm1');
  await mk(member.id, 'm2');
  assert.equal((await api(member.token, 'DELETE', `/calendars/${m1}`)).status, 204, 'el dueño borra el suyo');
});

// ── 3. Rate limit del login de agencia ───────────────────────────────────────
test('el login de agencia pasa por el rate limit de auth', async () => {
  const r = await api(null, 'POST', '/agency/auth/login', { email: `nadie-${stamp}@test.local`, password: 'x' });
  assert.equal(r.status, 401);
  assert.ok(r.headers.get('ratelimit-limit') || r.headers.get('ratelimit'), 'cabeceras de rate limit presentes');
});

// ── 4. Emails sin distinguir mayúsculas ──────────────────────────────────────
test('login con el email en mayúsculas y con espacios funciona', async () => {
  const r = await api(null, 'POST', '/auth/login', { email: `  ${ownerEmail.toUpperCase()} `, password: 'seguridad-123' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.user.id, owner.id);
});

test('alta de usuario: guarda el email en minúsculas y detecta duplicados sin importar mayúsculas', async () => {
  const email = `Sec-Nuevo-${stamp}@Test.Local`;
  const r = await api(owner.token, 'POST', '/users', { name: 'Nuevo', email, password: 'temporal-123', role: 'member' });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.email, email.toLowerCase());
  const dup = await api(owner.token, 'POST', '/users', { name: 'Otra', email: email.toUpperCase(), password: 'temporal-123', role: 'member' });
  assert.equal(dup.status, 409);
});

// ── 5. Lead Ads ──────────────────────────────────────────────────────────────
test('Lead Ads: sin teléfono ni email crea contacto nuevo y un leadgen_id repetido se ignora', async () => {
  const pageId = `page-sec-${stamp}`;
  const formId = `form-sec-${stamp}`;
  const leadgenId = `lead-sec-${stamp}`;
  const conn = (await db.query(
    `INSERT INTO social_connections (organization_id, platform, page_id, page_name, access_token, status)
     VALUES ($1,'facebook',$2,'Página test','tok','active') RETURNING id`,
    [orgId, pageId],
  )).rows[0].id;
  await db.query(
    `INSERT INTO lead_form_configs (organization_id, social_connection_id, form_id, field_map, auto_create_contact, auto_create_opportunity)
     VALUES ($1,$2,$3,'{"full_name":"name"}'::jsonb,true,false)`,
    [orgId, conn, formId],
  );
  // Contacto previo: antes, un lead sin teléfono ni email "coincidía" con él
  const prev = (await db.query(
    `INSERT INTO contacts (organization_id, first_name, phone, email) VALUES ($1,'Previo','+580000000',$2) RETURNING id`,
    [orgId, `previo-${stamp}@test.local`],
  )).rows[0].id;
  LEAD_DATA[leadgenId] = [{ name: 'full_name', values: ['Lead Sin Datos'] }];

  const payload = { object: 'page', entry: [{ id: pageId, changes: [{ field: 'leadgen', value: { leadgen_id: leadgenId, form_id: formId } }] }] };
  const raw = JSON.stringify(payload);
  const sig = 'sha256=' + createHmac('sha256', process.env.META_APP_SECRET ?? '').update(raw).digest('hex');
  const send = () => api(null, 'POST', '/meta/webhook', raw, { 'X-Hub-Signature-256': sig });

  assert.equal((await send()).status, 200);
  const created = await until('contacto del lead', async () => (await db.query(
    `SELECT id FROM contacts WHERE organization_id=$1 AND source='facebook_lead_ad'`, [orgId],
  )).rows[0]);
  assert.notEqual(created.id, prev);

  // Reenvío del mismo leadgen_id: no se duplica
  assert.equal((await send()).status, 200);
  await new Promise(r => setTimeout(r, 800));
  const n = (await db.query(`SELECT count(*)::int AS n FROM contacts WHERE organization_id=$1 AND source='facebook_lead_ad'`, [orgId])).rows[0].n;
  assert.equal(n, 1);
});
