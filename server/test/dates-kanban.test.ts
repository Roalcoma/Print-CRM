// "Hoy" y "este mes" en la zona de la organización (dashboard, tareas, citas) y kanban paginado
// por etapa (/opportunities/query con limit/offset/stageId, totales por etapa, filtros, CSV filtrado).
// Lo corre `npm test` (test/run.ts) contra el servidor de pruebas. NUNCA contra producción.
// La cuenta se crea directo en la BD (no por /auth/register) para no gastar el rate limit de auth.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import jwt from 'jsonwebtoken';

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3202';
if (BASE.includes('rocco.arbolaureo.org')) throw new Error('No correr los tests contra producción');
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const SECRET = process.env.JWT_SECRET!;
const TZ = 'America/New_York';

async function api(token: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}

const stamp = Date.now();
let orgId: string;
let userId: string;
let token: string;
let pipelineId: string;
const stages: string[] = [];   // [grande (120), pequeña (3), vacía]

before(async () => {
  orgId = (await db.query(`INSERT INTO organizations (name, timezone) VALUES ($1, $2) RETURNING id`, [`Fechas Kanban ${stamp}`, TZ])).rows[0].id;
  userId = (await db.query(
    `INSERT INTO users (organization_id, email, password_hash, name, role) VALUES ($1,$2,'x','Dueño','owner') RETURNING id`,
    [orgId, `dates-kanban-${stamp}@test.local`],
  )).rows[0].id;
  token = jwt.sign({ userId, organizationId: orgId, role: 'owner' }, SECRET, { expiresIn: '10m' });

  pipelineId = (await db.query(`INSERT INTO pipelines (organization_id, name) VALUES ($1, 'Ventas') RETURNING id`, [orgId])).rows[0].id;
  for (const [i, name] of ['Nuevo', 'Contactado', 'Vacía'].entries())
    stages.push((await db.query(`INSERT INTO pipeline_stages (pipeline_id, name, position) VALUES ($1,$2,$3) RETURNING id`, [pipelineId, name, i])).rows[0].id);

  // 120 en la primera etapa (cada 10ª ganada, valor = i), creadas con 1 min de diferencia; 3 en la segunda
  await db.query(
    `INSERT INTO opportunities (organization_id, pipeline_id, stage_id, title, value, status, created_at)
     SELECT $1, $2, $3, 'Lead ' || lpad(i::text, 3, '0'), i, CASE WHEN i % 10 = 0 THEN 'won' ELSE 'open' END,
            now() - (i || ' minutes')::interval
     FROM generate_series(1, 120) i`,
    [orgId, pipelineId, stages[0]],
  );
  await db.query(
    `INSERT INTO opportunities (organization_id, pipeline_id, stage_id, title, value)
     SELECT $1, $2, $3, 'Otro ' || i, 1000 FROM generate_series(1, 3) i`,
    [orgId, pipelineId, stages[1]],
  );
});

after(async () => {
  await db.query('DELETE FROM organizations WHERE id=$1', [orgId]).catch(() => {});
  await db.end();
});

// ── Fechas en la zona de la organización ─────────────────────────────────────
const ymdIn = (d: Date, tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
// Instante de una hora local (YYYY-MM-DD HH:MM) en TZ, calculado por PostgreSQL
const at = async (local: string) => (await db.query(`SELECT ($1::timestamp AT TIME ZONE $2) AS t`, [local, TZ])).rows[0].t as Date;

test('dashboard y estadísticas de tareas: "hoy" es el día de la organización (21:00 NY ya es mañana en UTC)', async () => {
  const today = ymdIn(new Date(), TZ);
  const due = await at(`${today} 21:00`);
  assert.notEqual(due.toISOString().slice(0, 10), today, 'precondición: en UTC ya es el día siguiente');
  const tomorrow = ymdIn(new Date(due.getTime() + 6 * 3600_000), TZ);   // 03:00 del día siguiente en NY
  const ids = (await db.query(
    `INSERT INTO tasks (organization_id, title, due_at) VALUES ($1, 'Hoy 21h NY', $2), ($1, 'Mañana 00:30 NY', $3) RETURNING id`,
    [orgId, due, await at(`${tomorrow} 00:30`)],
  )).rows.map(r => r.id);
  try {
    const sum = await api(token, 'GET', '/dashboard/summary');
    assert.equal(sum.status, 200, JSON.stringify(sum.data));
    assert.equal(sum.data.tasks_today, 1);
    assert.deepEqual(sum.data.tasks_due_today.map((t: any) => t.title), ['Hoy 21h NY']);
    const stats = await api(token, 'GET', '/tasks/stats');
    assert.equal(stats.status, 200, JSON.stringify(stats.data));
    assert.equal(stats.data.today, 1);
  } finally {
    await db.query('DELETE FROM tasks WHERE id = ANY($1::uuid[])', [ids]);
  }
});

test('calendario: una cita el último día del mes a las 22:00 NY sale en ese mes y no en el siguiente', async () => {
  const [y, m] = ymdIn(new Date(), TZ).split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const local = `${y}-${String(m).padStart(2, '0')}-${lastDay} 22:00`;
  const start = await at(local);
  const appt = (await db.query(
    `INSERT INTO appointments (organization_id, user_id, title, start_at, end_at, timezone)
     VALUES ($1,$2,'Cierre de mes',$3,$4,$5) RETURNING id`,
    [orgId, userId, start, new Date(start.getTime() + 30 * 60_000), TZ],
  )).rows[0].id;
  // Y una tarea a la misma hora: el calendario también pide las tareas del mes
  const task = (await db.query(`INSERT INTO tasks (organization_id, title, due_at) VALUES ($1,'Tarea cierre',$2) RETURNING id`, [orgId, start])).rows[0].id;
  try {
    const [nm, ny] = m === 12 ? [1, y + 1] : [m + 1, y];
    const cur = await api(token, 'GET', `/appointments?month=${m}&year=${y}`);
    assert.equal(cur.status, 200, JSON.stringify(cur.data));
    assert.ok(cur.data.some((a: any) => a.id === appt), 'la cita aparece en su mes');
    const next = await api(token, 'GET', `/appointments?month=${nm}&year=${ny}`);
    assert.ok(!next.data.some((a: any) => a.id === appt), 'no aparece en el mes siguiente');

    const tCur = await api(token, 'GET', `/tasks?month=${m}&year=${y}`);
    assert.equal(tCur.status, 200, JSON.stringify(tCur.data));
    assert.ok(tCur.data.some((t: any) => t.id === task), 'la tarea aparece en su mes');
    const tNext = await api(token, 'GET', `/tasks?month=${nm}&year=${ny}`);
    assert.ok(!tNext.data.some((t: any) => t.id === task), 'la tarea no aparece en el mes siguiente');

    // Mes inválido: no rompe (se ignora y cae al rango por defecto)
    assert.equal((await api(token, 'GET', '/appointments?month=13&year=2026')).status, 200);
  } finally {
    await db.query('DELETE FROM appointments WHERE id=$1', [appt]);
    await db.query('DELETE FROM tasks WHERE id=$1', [task]);
  }
});

// ── Kanban paginado ──────────────────────────────────────────────────────────
const kanban = (body: Record<string, unknown> = {}) => api(token, 'POST', '/opportunities/query', {
  pipelineId, sort_by: 'created_at', sort_dir: 'desc', ...body,
});
const stageTotal = (totals: any[], stageId: string) => totals.filter(t => t.stage_id === stageId).reduce((s, t) => s + t.count, 0);

test('kanban: la primera carga trae 50 por etapa y el total real de cada una', async () => {
  const r = await kanban({ limit: 50 });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const big = r.data.opportunities.filter((o: any) => o.stage_id === stages[0]);
  const small = r.data.opportunities.filter((o: any) => o.stage_id === stages[1]);
  assert.equal(big.length, 50);
  assert.equal(small.length, 3);
  assert.equal(stageTotal(r.data.totals, stages[0]), 120);
  assert.equal(stageTotal(r.data.totals, stages[1]), 3);
  assert.equal(stageTotal(r.data.totals, stages[2]), 0);
  // Orden pedido (más reciente primero) y campos del listado
  assert.deepEqual(big.slice(0, 3).map((o: any) => o.title), ['Lead 001', 'Lead 002', 'Lead 003']);
  assert.equal(big[0].notes_count, 0);
  assert.deepEqual(big[0].followers, []);
  // Totales por estado (valor incluido): 12 ganadas en la etapa grande
  const won = r.data.totals.find((t: any) => t.stage_id === stages[0] && t.status === 'won');
  assert.equal(won.count, 12);
  assert.equal(won.value, [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120].reduce((a, b) => a + b));
});

test('kanban: "cargar más" de una etapa trae las siguientes sin repetir hasta completar el total', async () => {
  const seen = new Set<string>();
  const first = await kanban({ limit: 50 });
  first.data.opportunities.filter((o: any) => o.stage_id === stages[0]).forEach((o: any) => seen.add(o.id));
  for (const [offset, expected] of [[50, 50], [100, 20], [120, 0]] as const) {
    const r = await kanban({ limit: 50, offset, stageId: stages[0] });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.ok(r.data.opportunities.every((o: any) => o.stage_id === stages[0]), 'solo la etapa pedida');
    assert.equal(r.data.opportunities.length, expected, `offset ${offset}`);
    for (const o of r.data.opportunities) {
      assert.ok(!seen.has(o.id), `repetida: ${o.title}`);
      seen.add(o.id);
    }
  }
  assert.equal(seen.size, 120);
  // El orden continúa donde lo dejó la página anterior
  const p2 = await kanban({ limit: 50, offset: 50, stageId: stages[0] });
  assert.equal(p2.data.opportunities[0].title, 'Lead 051');
});

test('kanban: los filtros y la búsqueda se respetan en páginas y totales', async () => {
  const won = await kanban({ limit: 5, filters: [{ field: 'status', op: 'is', value: 'won' }] });
  assert.equal(won.status, 200, JSON.stringify(won.data));
  assert.equal(stageTotal(won.data.totals, stages[0]), 12);
  assert.equal(stageTotal(won.data.totals, stages[1]), 0);
  assert.equal(won.data.opportunities.length, 5);
  assert.ok(won.data.opportunities.every((o: any) => o.status === 'won'));
  const more = await kanban({ limit: 5, offset: 10, stageId: stages[0], filters: [{ field: 'status', op: 'is', value: 'won' }] });
  assert.deepEqual(more.data.opportunities.map((o: any) => o.title), ['Lead 110', 'Lead 120']);

  const s = await kanban({ limit: 50, search: 'Otro' });
  assert.equal(stageTotal(s.data.totals, stages[0]), 0);
  assert.equal(stageTotal(s.data.totals, stages[1]), 3);
  assert.equal(s.data.opportunities.length, 3);

  // Valor ≥ 100 → Lead 100…120 (21) + 3 "Otro" de 1000
  const v = await kanban({ limit: 50, filters: [{ field: 'value', op: 'gte', value: 100 }] });
  assert.equal(stageTotal(v.data.totals, stages[0]), 21);
  assert.equal(stageTotal(v.data.totals, stages[1]), 3);
});

test('lista: paginación global (group=none) y compatibilidad sin limit', async () => {
  const p1 = await kanban({ limit: 100, group: 'none' });
  const p2 = await kanban({ limit: 100, offset: 100, group: 'none' });
  assert.equal(p1.data.opportunities.length, 100);
  assert.equal(p2.data.opportunities.length, 23);
  const ids = new Set([...p1.data.opportunities, ...p2.data.opportunities].map((o: any) => o.id));
  assert.equal(ids.size, 123);
  // Sin limit: array completo como antes (lo usan clientes antiguos y el dashboard)
  const all = await kanban();
  assert.ok(Array.isArray(all.data));
  assert.equal(all.data.length, 123);
  // limit 0: solo totales
  const z = await kanban({ limit: 0 });
  assert.equal(z.data.opportunities.length, 0);
  assert.equal(z.data.totals.reduce((s: number, t: any) => s + t.count, 0), 123);
});

test('CSV: exporta TODO lo filtrado (no solo la página cargada)', async () => {
  const res = await fetch(`${BASE}/api/opportunities/export/csv`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ pipelineId, filters: [{ field: 'status', op: 'is', value: 'open' }], sort_by: 'created_at', sort_dir: 'desc' }),
  });
  assert.equal(res.status, 200);
  const lines = (await res.text()).trim().split('\n');
  assert.equal(lines.length, 1 + 108 + 3, 'cabecera + 108 abiertas de la etapa grande + 3');
  // El GET de siempre sigue exportando el pipeline completo
  const all = await fetch(`${BASE}/api/opportunities/export/csv?pipelineId=${pipelineId}`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal((await all.text()).trim().split('\n').length, 1 + 123);
});

test('kanban: no expone oportunidades de otra organización', async () => {
  const otherOrg = (await db.query(`INSERT INTO organizations (name) VALUES ($1) RETURNING id`, [`Otra ${stamp}`])).rows[0].id;
  try {
    const u = (await db.query(
      `INSERT INTO users (organization_id, email, password_hash, name, role) VALUES ($1,$2,'x','Otro','owner') RETURNING id`,
      [otherOrg, `dates-kanban-other-${stamp}@test.local`],
    )).rows[0].id;
    const t = jwt.sign({ userId: u, organizationId: otherOrg, role: 'owner' }, SECRET, { expiresIn: '10m' });
    const r = await api(t, 'POST', '/opportunities/query', { pipelineId, limit: 50 });
    assert.equal(r.status, 200);
    assert.equal(r.data.opportunities.length, 0);
    assert.equal(r.data.totals.length, 0);
  } finally {
    await db.query('DELETE FROM organizations WHERE id=$1', [otherOrg]);
  }
});
