// Oportunidad (lead) desde la cita del calendario: búsqueda priorizando el contacto de la cita,
// vincular/desvincular (appointments.opportunity_id), cambiar etapa con evento WS
// `opportunity:updated`, y aislamiento (no se vincula ni se encuentra la oportunidad de otra cuenta).
// Uso: `npm test` (levanta el servidor de pruebas; ver test/run.ts).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3202';
if (BASE.includes('rocco.arbolaureo.org')) throw new Error('No correr los tests contra producción');

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

const stamp = Date.now();
async function account(tag: string) {
  const r = await api(null, 'POST', '/auth/register', {
    organizationName: `Lead cita ${tag} ${stamp}`, name: `Tester ${tag}`,
    email: `appt-lead-${tag.toLowerCase()}-${stamp}@test.local`, password: 'lead-cita-123',
  });
  assert.equal(r.status, 201, `registro ${tag}: ${JSON.stringify(r.data)}`);
  const token = r.data.token as string;
  await api(token, 'POST', '/pipelines', { name: 'Ventas' });
  const p = (await api(token, 'GET', '/pipelines')).data[0];
  await api(token, 'POST', `/pipelines/${p.id}/stages`, { name: 'Calificado', color: '#10b981' });
  const pipe = (await api(token, 'GET', '/pipelines')).data[0];
  const start = new Date(Date.now() + 86_400_000).toISOString();
  const end = new Date(Date.now() + 86_400_000 + 1_800_000).toISOString();
  const contact = (await api(token, 'POST', '/contacts', { first_name: `Cliente${tag}`, last_name: 'Cita', email: `cli-${tag}-${stamp}@x.local` })).data.id;
  const appt = (await api(token, 'POST', '/appointments', { title: `Cita ${tag}`, start_at: start, end_at: end, contact_id: contact })).data.id;
  assert.ok(contact && appt, `${tag}: no se pudo crear contacto/cita`);
  return { token, pipeline: pipe.id as string, stages: pipe.stages as { id: string; color: string }[], contact, appt };
}

let A: Awaited<ReturnType<typeof account>>;
let B: Awaited<ReturnType<typeof account>>;
let oppA: string;       // del contacto de la cita
let otherA: string;     // otra oportunidad de la misma cuenta, sin ese contacto
const wsEvents: { type: string; data: any }[] = [];
let ws: WebSocket;

before(async () => {
  A = await account('A');
  B = await account('B');
  // La más reciente es "otra", para comprobar que la del contacto igual sale primero
  oppA = (await api(A.token, 'POST', '/opportunities', { title: `Lead del contacto ${stamp}`, pipeline_id: A.pipeline, stage_id: A.stages[0].id, contact_id: A.contact })).data.id;
  otherA = (await api(A.token, 'POST', '/opportunities', { title: `Otra oportunidad ${stamp}`, pipeline_id: A.pipeline, stage_id: A.stages[0].id })).data.id;
  assert.ok(oppA && otherA);
  ws = new WebSocket(`${BASE.replace(/^http/, 'ws')}/ws?token=${A.token}`);
  ws.onmessage = e => wsEvents.push(JSON.parse(String(e.data)));
  await new Promise<void>((r, j) => { ws.onopen = () => r(); ws.onerror = () => j(new Error('WS no conectó')); });
});
after(() => ws?.close());

test('búsqueda: las oportunidades del contacto de la cita salen primero, con pipeline y etapa', async () => {
  const r = await api(A.token, 'GET', `/opportunities/search?q=&contactId=${A.contact}`);
  assert.equal(r.status, 200);
  assert.equal(r.data[0].id, oppA);
  assert.equal(r.data[0].is_contact, true);
  assert.equal(r.data[0].pipeline_name, 'Ventas');
  assert.ok(r.data[0].stage_name && r.data[0].stage_color);
  assert.ok(r.data.some((o: any) => o.id === otherA && o.is_contact === false), 'también lista otras de la cuenta');

  const q = await api(A.token, 'GET', `/opportunities/search?q=${encodeURIComponent(`Otra oportunidad ${stamp}`)}`);
  assert.deepEqual(q.data.map((o: any) => o.id), [otherA]);
});

test('vincular, cambiar de etapa (evento WS) y desvincular la oportunidad de la cita', async () => {
  const link = await api(A.token, 'PATCH', `/appointments/${A.appt}`, { opportunity_id: oppA });
  assert.equal(link.status, 200);
  assert.equal(link.data.opportunity_id, oppA);
  assert.match((await api(A.token, 'GET', `/appointments/${A.appt}`)).data.opportunity_title, /Lead del contacto/);

  const target = A.stages[1].id;
  const st = await api(A.token, 'PATCH', `/opportunities/${oppA}`, { stage_id: target });
  assert.equal(st.status, 200);
  assert.equal(st.data.stage_id, target);
  const t0 = Date.now();
  while (!wsEvents.some(e => e.type === 'opportunity:updated' && e.data.id === oppA)) {
    if (Date.now() - t0 > 5000) assert.fail('no llegó el evento WS opportunity:updated');
    await new Promise(r => setTimeout(r, 100));
  }

  const unlink = await api(A.token, 'PATCH', `/appointments/${A.appt}`, { opportunity_id: null });
  assert.equal(unlink.status, 200);
  assert.equal(unlink.data.opportunity_id, null);
});

test('aislamiento: no se vincula ni se encuentra una oportunidad de otra cuenta', async () => {
  const r = await api(B.token, 'PATCH', `/appointments/${B.appt}`, { opportunity_id: oppA });
  assert.equal(r.status, 400);
  assert.equal((await api(B.token, 'GET', `/appointments/${B.appt}`)).data.opportunity_id, null);

  const s = await api(B.token, 'GET', `/opportunities/search?q=${encodeURIComponent(`Lead del contacto ${stamp}`)}&contactId=${A.contact}`);
  assert.equal(s.status, 200);
  assert.deepEqual(s.data, []);
  // Tampoco puede cambiarle la etapa ni vincularla a la cita de A
  assert.equal((await api(B.token, 'PATCH', `/opportunities/${oppA}`, { stage_id: B.stages[1].id })).status, 404);
  assert.equal((await api(B.token, 'PATCH', `/appointments/${A.appt}`, { opportunity_id: null })).status, 404);
});
