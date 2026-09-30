// Test de aislamiento entre clientes (multi-tenant). Crea dos cuentas (A y B) y comprueba que
// B no puede leer, modificar, borrar ni enlazar datos de A por ninguna ruta de la API.
// Uso: con el servidor corriendo contra una BD de pruebas,
//   TEST_BASE_URL=http://localhost:3199 node --env-file=.env --test test/isolation.test.ts
// NUNCA contra producción: crea cuentas y datos.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3199';
if (BASE.includes('rocco.arbolaureo.org')) throw new Error('No correr el test de aislamiento contra producción');

type Json = Record<string, any>;
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
const ok = (s: number) => s >= 200 && s < 300;

const stamp = Date.now();
async function register(tag: string) {
  const r = await api(null, 'POST', '/auth/register', {
    organizationName: `Aislamiento ${tag} ${stamp}`, name: `Tester ${tag}`,
    email: `isolation-${tag.toLowerCase()}-${stamp}@test.local`, password: 'aislamiento-123',
  });
  assert.ok(ok(r.status), `registro ${tag}: ${r.status} ${JSON.stringify(r.data)}`);
  const token = r.data.token as string;
  const me = await api(token, 'GET', '/me');
  return { token, userId: (me.data.user ?? me.data).id as string };
}

// Las cuentas nuevas nacen sin pipelines: se crea uno y se devuelve con su primera etapa
async function pipeline(token: string) {
  let list = (await api(token, 'GET', '/pipelines')).data;
  if (!list.length) { await api(token, 'POST', '/pipelines', { name: 'Ventas' }); list = (await api(token, 'GET', '/pipelines')).data; }
  return { id: list[0].id as string, stage: list[0].stages[0].id as string };
}

let A: { token: string; userId: string };
let B: { token: string; userId: string };
const a: Json = {};   // ids creados por A

before(async () => {
  A = await register('A');
  B = await register('B');

  const pa = await pipeline(A.token);
  a.pipeline = pa.id; a.stage = pa.stage;

  a.contact = (await api(A.token, 'POST', '/contacts', { first_name: 'Secreto', last_name: 'DeA', email: `c-${stamp}@a.local`, phone: '+10000000001' })).data.id;
  a.opp = (await api(A.token, 'POST', '/opportunities', { title: 'Oportunidad de A', pipeline_id: a.pipeline, stage_id: a.stage, contact_id: a.contact })).data.id;
  a.task = (await api(A.token, 'POST', '/tasks', { title: 'Tarea de A', opportunity_id: a.opp })).data.id;
  const cal = await api(A.token, 'POST', '/calendars', { name: `Calendario A ${stamp}`, slug: `cal-a-${stamp}`, duration_minutes: 30 });
  a.calendar = cal.data.id;
  const start = new Date(Date.now() + 86_400_000).toISOString();
  const end = new Date(Date.now() + 86_400_000 + 1_800_000).toISOString();
  a.appt = (await api(A.token, 'POST', '/appointments', { title: 'Cita de A', start_at: start, end_at: end, contact_id: a.contact })).data.id;
  a.conv = (await api(A.token, 'POST', '/conversations', { phone: '10000000001', display_name: 'Chat de A', contact_id: a.contact })).data.id;
  a.start = start; a.end = end;

  for (const k of ['contact', 'opp', 'task', 'calendar', 'appt']) assert.ok(a[k], `A no pudo crear ${k}`);
});

test('B no puede leer por id los datos de A', async () => {
  const paths = [
    `/contacts/${a.contact}`, `/opportunities/${a.opp}`, `/opportunities/${a.opp}/notes`,
    `/calendars/${a.calendar}`, `/appointments/${a.appt}`,
    ...(a.conv ? [`/conversations/${a.conv}/timeline`, `/conversations/${a.conv}/contact`, `/conversations/${a.conv}/messages`] : []),
  ];
  for (const p of paths) {
    const r = await api(B.token, 'GET', p);
    const leaked = ok(r.status) && JSON.stringify(r.data).match(/Secreto|DeA|de A|Calendario A/);
    assert.ok(!leaked, `GET ${p} devolvió datos de A (${r.status})`);
  }
});

test('B no ve datos de A en sus listados', async () => {
  const bp = await pipeline(B.token);
  const lists = [
    await api(B.token, 'GET', '/contacts?limit=500'),
    await api(B.token, 'POST', '/opportunities/query', { pipelineId: bp.id }),
    await api(B.token, 'GET', '/tasks'),
    await api(B.token, 'GET', `/appointments?start=${encodeURIComponent(new Date(Date.now() - 86_400_000).toISOString())}&end=${encodeURIComponent(new Date(Date.now() + 3 * 86_400_000).toISOString())}`),
    await api(B.token, 'GET', '/calendars'),
    await api(B.token, 'GET', '/conversations?status=all&limit=100'),
    await api(B.token, 'GET', '/users'),
    await api(B.token, 'GET', '/pipelines'),
  ];
  const ids = [a.contact, a.opp, a.task, a.calendar, a.appt, a.conv, A.userId, a.pipeline].filter(Boolean);
  for (const r of lists) {
    const body = JSON.stringify(r.data);
    for (const id of ids) assert.ok(!body.includes(id), `un listado de B contiene el id ${id} de A`);
    assert.ok(!/Secreto|Oportunidad de A|Tarea de A|Cita de A/.test(body), 'un listado de B contiene datos de A');
  }
});

test('B no puede modificar ni borrar datos de A', async () => {
  const attempts: [string, string, unknown?][] = [
    ['PATCH', `/contacts/${a.contact}`, { first_name: 'Hackeado' }],
    ['PATCH', `/opportunities/${a.opp}`, { title: 'Hackeado' }],
    ['PATCH', `/tasks/${a.task}`, { title: 'Hackeado' }],
    ['PATCH', `/calendars/${a.calendar}`, { name: 'Hackeado' }],
    ['PATCH', `/appointments/${a.appt}`, { title: 'Hackeado' }],
    ['POST', `/opportunities/${a.opp}/notes`, { body: 'Nota de B' }],
    ['DELETE', `/tasks/${a.task}`],
    ['DELETE', `/opportunities/${a.opp}`],
    ['DELETE', `/contacts/${a.contact}`],
    ['DELETE', `/appointments/${a.appt}`],
    ['DELETE', `/calendars/${a.calendar}`],
    ...(a.conv ? [['PATCH', `/conversations/${a.conv}`, { status: 'closed' }], ['DELETE', `/conversations/${a.conv}`]] as [string, string, unknown?][] : []),
  ];
  for (const [m, p, body] of attempts) {
    const r = await api(B.token, m, p, body);
    // Algunos DELETE responden 200/204 aunque no borren nada (WHERE con organization_id): se verifica después
    if (m !== 'DELETE' && !p.includes('/conversations/')) assert.ok(!ok(r.status), `${m} ${p} respondió ${r.status}`);
  }
  // Los datos de A siguen intactos
  assert.equal((await api(A.token, 'GET', `/contacts/${a.contact}`)).data.contact?.first_name ?? (await api(A.token, 'GET', `/contacts/${a.contact}`)).data.first_name, 'Secreto');
  assert.equal((await api(A.token, 'GET', `/opportunities/${a.opp}`)).data.title, 'Oportunidad de A');
  assert.ok(ok((await api(A.token, 'GET', `/calendars/${a.calendar}`)).status), 'el calendario de A desapareció');
  const notes = await api(A.token, 'GET', `/opportunities/${a.opp}/notes`);
  assert.ok(!JSON.stringify(notes.data).includes('Nota de B'), 'B añadió una nota a la oportunidad de A');
  const tasks = await api(A.token, 'GET', '/tasks');
  const task = (tasks.data.tasks ?? tasks.data).find((t: Json) => t.id === a.task);
  assert.equal(task?.title, 'Tarea de A');
});

test('B no puede enlazar datos de A desde sus propias entidades', async () => {
  const { id: bp, stage: bs } = await pipeline(B.token);
  // Oportunidad con contacto de A: se permite crearla, pero el contacto ajeno se descarta
  const opp = await api(B.token, 'POST', '/opportunities', { title: 'x', pipeline_id: bp, stage_id: bs, contact_id: a.contact });
  assert.ok(!ok(opp.status) || opp.data.contact_id !== a.contact, 'B enlazó una oportunidad al contacto de A');
  assert.ok(!JSON.stringify(opp.data).includes('Secreto'), 'la oportunidad de B muestra datos del contacto de A');
  const tries: [string, string, unknown][] = [
    ['POST', '/opportunities', { title: 'x', pipeline_id: a.pipeline, stage_id: a.stage }],
    ['POST', '/tasks', { title: 'x', opportunity_id: a.opp }],
    ['POST', '/appointments', { title: 'x', start_at: a.start, end_at: a.end, contact_id: a.contact }],
    ['POST', '/appointments', { title: 'x', start_at: a.start, end_at: a.end, opportunity_id: a.opp }],
    ['POST', '/appointments', { title: 'x', start_at: a.start, end_at: a.end, calendar_id: a.calendar }],
    ['POST', '/appointments', { title: 'x', start_at: a.start, end_at: a.end, attendees: [{ user_id: A.userId }] }],
    ['POST', '/conversations', { phone: '10000000009', contact_id: a.contact }],
  ];
  for (const [m, p, body] of tries) {
    const r = await api(B.token, m, p, body);
    assert.ok(!ok(r.status), `${m} ${p} ${JSON.stringify(body)} fue aceptado (${r.status})`);
  }
  // Miembros de calendario / responsables de tarea de otra cuenta se descartan
  const cal = await api(B.token, 'POST', '/calendars', { name: `Cal B ${stamp}`, slug: `cal-b-${stamp}`, duration_minutes: 30, member_ids: [A.userId] });
  if (ok(cal.status)) {
    const got = await api(B.token, 'GET', `/calendars/${cal.data.id}`);
    assert.ok(!JSON.stringify(got.data).includes(A.userId), 'B añadió a un usuario de A como miembro de su calendario');
  }
  const task = await api(B.token, 'POST', '/tasks', { title: 'Tarea B', assignee_ids: [A.userId] });
  if (ok(task.status)) assert.ok(!JSON.stringify(task.data).includes(A.userId), 'B asignó una tarea a un usuario de A');
});

test('un token de agencia no sirve como sesión del CRM', async (t) => {
  // Firmado de verdad con la clave del servidor de pruebas (correr con --env-file=.env)
  if (!process.env.JWT_SECRET) return t.skip('falta JWT_SECRET: correr con --env-file=.env');
  const { default: jwt } = await import('jsonwebtoken');
  const agencyToken = jwt.sign({ type: 'agency', adminId: A.userId, email: 'x@test.local', role: 'superadmin' }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const r = await api(agencyToken, 'GET', '/contacts');
  assert.equal(r.status, 401);
});
