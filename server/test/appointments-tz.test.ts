// Citas y reserva pública: zona horaria de las citas manuales en los recordatorios, reagendar
// recalcula los recordatorios pendientes ("X min antes"), un recordatorio de una cita que ya empezó
// no se envía, y la reserva/reagendado públicos solo aceptan huecos válidos y tienen rate limit.
// Uso: `npm test` (levanta el servidor de pruebas; ver test/run.ts).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { executeRun } from '../src/services/automation-engine.ts';
import { pool as appPool } from '../src/db.ts';

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3202';
if (BASE.includes('rocco.arbolaureo.org')) throw new Error('No correr los tests contra producción');

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const stamp = Date.now();
const one = async (sql: string, params: unknown[]) => (await db.query(sql, params)).rows[0];

// `ip` va en X-Forwarded-For (el servidor confía en 1 proxy): cada test usa su propio cupo del rate limit
async function api(token: string | null, method: string, path: string, body?: unknown, ip?: string) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(ip ? { 'X-Forwarded-For': ip } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
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

const HOUR = 3_600_000;
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6].map(d => ({ day_of_week: d, start_time: '09:00', end_time: '17:00', is_active: true }));
const ctx = {} as { token: string; orgId: string; calId: string; slug: string };

before(async () => {
  const reg = await api(null, 'POST', '/auth/register', {
    organizationName: `Citas TZ ${stamp}`, name: 'Tester Citas',
    email: `appt-tz-${stamp}@test.local`, password: 'citas-tz-12345',
  });
  assert.equal(reg.status, 201, `registro: ${JSON.stringify(reg.data)}`);
  ctx.token = reg.data.token;
  const me = await api(ctx.token, 'GET', '/me');
  ctx.orgId = (await one('SELECT organization_id FROM users WHERE id = $1', [(me.data.user ?? me.data).id])).organization_id;

  ctx.slug = `citas-tz-${stamp}`;
  const cal = await api(ctx.token, 'POST', '/calendars', {
    name: 'Asesoría', slug: ctx.slug, booking_enabled: true, duration_minutes: 30, buffer_minutes: 0,
    timezone: 'America/New_York', min_notice_hours: 0, max_advance_days: 14, availability: ALL_DAYS,
  });
  assert.equal(cal.status, 201, JSON.stringify(cal.data));
  ctx.calId = cal.data.id;
});

after(async () => {
  await db.end();
  await appPool.end();
});

const contact = async (name: string) =>
  (await api(ctx.token, 'POST', '/contacts', { first_name: name, last_name: 'Cita', email: `${name.toLowerCase()}-${stamp}@test.local` })).data.id as string;

const rule = async (name: string, steps: unknown[]) => {
  const r = await api(ctx.token, 'POST', '/automations', { name, trigger_type: 'appointment_booked', config: { include_manual: true, steps } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data.id as string;
};
const disable = (id: string) => api(ctx.token, 'PATCH', `/automations/${id}`, { enabled: false });
const runOf = (ruleId: string, contactId: string) => until('run de cita agendada', () => one(
  'SELECT * FROM automation_runs WHERE automation_id = $1 AND contact_id = $2', [ruleId, contactId]));

// Huecos que ofrece la página pública (instantes UTC)
async function publicSlots(): Promise<string[]> {
  const r = await api(null, 'GET', `/public/book/${ctx.slug}`);
  assert.equal(r.status, 200);
  return r.data.slots.flatMap((d: { times: string[] }) => d.times);
}

// ── 1. Zona horaria de citas manuales ───────────────────────────────────────
test('Cita manual a las 10:00 America/New_York (noviembre, EST): el recordatorio dice 10:00', async () => {
  const ruleId = await rule('Aviso hora', [
    { id: 'n1', type: 'send_notification', notification_title: `Cita TZ ${stamp}`, notification_body: 'A las {{appointment.start_time}}' },
  ]);
  // 16 nov 2026 10:00 EST = 15:00 UTC (en Caracas serían las 11:00)
  const start = '2026-11-16T15:00:00.000Z';
  const end = '2026-11-16T15:30:00.000Z';

  // Sin calendario: manda la zona enviada (la del navegador)
  const c1 = await contact('Nora');
  const a1 = await api(ctx.token, 'POST', '/appointments', { title: 'Consulta NY', contact_id: c1, start_at: start, end_at: end, timezone: 'America/New_York' });
  assert.equal(a1.status, 201, JSON.stringify(a1.data));
  assert.equal(a1.data.timezone, 'America/New_York');
  const run1 = await runOf(ruleId, c1);
  assert.equal(run1.step_data.__appointment__.start_time, '10:00');
  const n1 = await until('notificación', () => one(
    `SELECT body FROM notifications WHERE organization_id = $1 AND title = $2 ORDER BY created_at DESC LIMIT 1`, [ctx.orgId, `Cita TZ ${stamp}`]));
  assert.equal(n1.body, 'A las 10:00');

  // Con calendario: la zona del calendario gana a la enviada
  const c2 = await contact('Olga');
  const a2 = await api(ctx.token, 'POST', '/appointments', {
    title: 'Consulta cal', contact_id: c2, start_at: start, end_at: end, timezone: 'America/Caracas', calendar_id: ctx.calId,
  });
  assert.equal(a2.status, 201, JSON.stringify(a2.data));
  assert.equal(a2.data.timezone, 'America/New_York');
  assert.equal(a2.data.calendar_id, ctx.calId);
  assert.equal((await runOf(ruleId, c2)).step_data.__appointment__.start_time, '10:00');

  // Sin calendario ni zona válida: la de la organización
  await api(ctx.token, 'PATCH', '/organization', { timezone: 'America/New_York' });
  const a3 = await api(ctx.token, 'POST', '/appointments', { title: 'Interna', start_at: start, end_at: end, timezone: 'No/Existe' });
  assert.equal(a3.status, 201, JSON.stringify(a3.data));
  assert.equal(a3.data.timezone, 'America/New_York');

  await disable(ruleId);
});

// ── 2. Reagendar recalcula los recordatorios ────────────────────────────────
test('Reagendar una cita (CRM y página pública) mueve resume_at del recordatorio; cancelarla cancela el run', async () => {
  const ruleId = await rule('Recordatorio 1 h', [
    { id: 'w1', type: 'wait_before_appointment', minutes_before: 60 },
    { id: 'n1', type: 'send_notification', notification_title: 'Recordatorio', notification_body: 'Tu cita es a las {{appointment.start_time}}' },
  ]);

  // Cita manual a 3 días → se adelanta a 2 días
  const c = await contact('Pia');
  const start = new Date(Date.now() + 3 * 24 * HOUR); start.setUTCMinutes(0, 0, 0);
  const a = await api(ctx.token, 'POST', '/appointments', {
    title: 'Revisión', contact_id: c, start_at: start.toISOString(), end_at: new Date(start.getTime() + HOUR).toISOString(),
    calendar_id: ctx.calId,
  });
  assert.equal(a.status, 201, JSON.stringify(a.data));
  const run = await until('run esperando la cita', async () => {
    const r = await runOf(ruleId, c);
    return r.status === 'waiting_timed' ? r : null;
  });
  assert.equal(new Date(run.resume_at).getTime(), start.getTime() - HOUR);

  const earlier = new Date(start.getTime() - 24 * HOUR);
  const p = await api(ctx.token, 'PATCH', `/appointments/${a.data.id}`, {
    start_at: earlier.toISOString(), end_at: new Date(earlier.getTime() + HOUR).toISOString(),
  });
  assert.equal(p.status, 200, JSON.stringify(p.data));
  const moved = await one('SELECT * FROM automation_runs WHERE id = $1', [run.id]);
  assert.equal(moved.status, 'waiting_timed');
  assert.equal(new Date(moved.resume_at).getTime(), earlier.getTime() - HOUR);
  assert.equal(moved.step_data.__appointment__.start_at, earlier.toISOString());

  // Cancelar desde el CRM cancela el run en el momento (no al llegar la hora)
  await api(ctx.token, 'PATCH', `/appointments/${a.data.id}`, { status: 'cancelled' });
  assert.equal((await one('SELECT status FROM automation_runs WHERE id = $1', [run.id])).status, 'cancelled');

  // Reserva pública → reagendado público
  const ip = '198.51.100.20';
  const slots = await publicSlots();
  const first = slots.find(t => new Date(t).getTime() > Date.now() + 4 * 24 * HOUR)!;
  const second = slots.find(t => new Date(t).getTime() > Date.now() + 2 * 24 * HOUR && new Date(t).getTime() < Date.now() + 3 * 24 * HOUR)!;
  assert.ok(first && second, 'hay huecos para la prueba');
  const email = `pub-${stamp}@test.local`;
  const b = await api(null, 'POST', `/public/book/${ctx.slug}`, { name: 'Pablo Público', email, start_at: first }, ip);
  assert.equal(b.status, 201, JSON.stringify(b.data));
  const pubContact = (await one('SELECT id FROM contacts WHERE organization_id = $1 AND email = $2', [ctx.orgId, email])).id;
  const pubRun = await until('run de la reserva pública', async () => {
    const r = await runOf(ruleId, pubContact);
    return r.status === 'waiting_timed' ? r : null;
  });
  assert.equal(new Date(pubRun.resume_at).getTime(), new Date(first).getTime() - HOUR);

  const rs = await api(null, 'POST', `/public/book/${ctx.slug}/reschedule/${b.data.cancel_token}`, { start_at: second }, ip);
  assert.equal(rs.status, 200, JSON.stringify(rs.data));
  const pubMoved = await one('SELECT * FROM automation_runs WHERE id = $1', [pubRun.id]);
  assert.equal(new Date(pubMoved.resume_at).getTime(), new Date(second).getTime() - HOUR);

  const cancel = await api(null, 'POST', `/public/book/${ctx.slug}/cancel/${b.data.cancel_token}`);
  assert.equal(cancel.status, 200);
  assert.equal((await one('SELECT status FROM automation_runs WHERE id = $1', [pubRun.id])).status, 'cancelled');

  await disable(ruleId);
});

// ── 3. Recordatorio de una cita que ya empezó ───────────────────────────────
test('Un run cuya cita ya empezó no envía el recordatorio', async () => {
  const title = `Recordatorio tardío ${stamp}`;
  const ruleId = await rule('Recordatorio tardío', [
    { id: 'w1', type: 'wait_before_appointment', minutes_before: 60 },
    { id: 'n1', type: 'send_notification', notification_title: title, notification_body: 'Tu cita es a las {{appointment.start_time}}' },
  ]);
  const c = await contact('Quina');
  const start = new Date(Date.now() + 2 * 24 * HOUR); start.setUTCMinutes(0, 0, 0);
  const a = await api(ctx.token, 'POST', '/appointments', {
    title: 'Pasada', contact_id: c, start_at: start.toISOString(), end_at: new Date(start.getTime() + HOUR).toISOString(),
  });
  assert.equal(a.status, 201);
  const run = await until('run esperando', async () => {
    const r = await runOf(ruleId, c);
    return r.status === 'waiting_timed' ? r : null;
  });

  // Simula que el servidor estuvo caído: la cita empezó hace 10 min y el run se reanuda tarde
  await db.query(`UPDATE appointments SET start_at = now() - interval '10 minutes', end_at = now() + interval '50 minutes' WHERE id = $1`, [a.data.id]);
  await db.query(`UPDATE automation_runs SET status = 'running', resume_at = now() - interval '1 minute' WHERE id = $1`, [run.id]);
  await executeRun(run.id);

  const after = await one('SELECT status, current_step FROM automation_runs WHERE id = $1', [run.id]);
  assert.equal(after.status, 'completed');
  const sent = await one('SELECT count(*)::int AS n FROM notifications WHERE organization_id = $1 AND title = $2', [ctx.orgId, title]);
  assert.equal(sent.n, 0, 'no sale el recordatorio de una cita que ya empezó');

  await disable(ruleId);
});

// ── 4. Reserva pública: solo huecos válidos ─────────────────────────────────
test('Reserva pública: rechaza fuera de horario, desalineado, pasado o más allá de max_advance_days; acepta un hueco válido', async () => {
  const ip = '198.51.100.30';
  const slots = await publicSlots();
  const at0 = (t: string, ms: number) => new Date(new Date(t).getTime() + ms).toISOString();
  // Un hueco a más de 5 días cuyo siguiente (+30 min) también esté libre, para reagendarlo después
  const slot = slots.find(t => new Date(t).getTime() > Date.now() + 5 * 24 * HOUR && slots.includes(at0(t, 30 * 60_000)))!;
  assert.ok(slot);
  const at = (ms: number) => at0(slot, ms);
  const book = (start_at: string, n: string) =>
    api(null, 'POST', `/public/book/${ctx.slug}`, { name: `Visitante ${n}`, email: `v${n}-${stamp}@test.local`, start_at }, ip);

  // Los huecos son 09:00–17:00 NY: 8 h antes de cualquier hueco de la mañana cae de madrugada
  const morning = slots.find(t => new Date(t).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: false }).startsWith('09:00'))!;
  const night = await book(new Date(new Date(morning).getTime() - 8 * HOUR).toISOString(), 'noche');
  assert.equal(night.status, 400, JSON.stringify(night.data));
  assert.match(night.data.error, /horarios disponibles/);

  const odd = await book(at(10 * 60_000), 'desalineado');   // 10 min después de un hueco de 30 min
  assert.equal(odd.status, 400);

  const past = await book(new Date(Date.now() - 24 * HOUR).toISOString(), 'pasado');
  assert.equal(past.status, 400);

  const far = await book(new Date(Date.now() + 20 * 24 * HOUR).toISOString(), 'lejos');   // max_advance_days = 14
  assert.equal(far.status, 400);
  assert.match(far.data.error, /14 días/);

  const ok = await book(slot, 'valido');
  assert.equal(ok.status, 201, JSON.stringify(ok.data));

  // Reagendado público: una hora bloqueada también ocupa el hueco (409); fuera de horario 400; válido 200
  const blockedSlot = slots.find(t => new Date(t).getTime() > new Date(slot).getTime() + 2 * HOUR)!;
  const block = await api(ctx.token, 'POST', '/appointments', {
    title: 'Bloqueado', status: 'blocked', calendar_id: ctx.calId,
    start_at: blockedSlot, end_at: new Date(new Date(blockedSlot).getTime() + HOUR).toISOString(),
  });
  assert.equal(block.status, 201);
  const token = ok.data.cancel_token;
  const toBlocked = await api(null, 'POST', `/public/book/${ctx.slug}/reschedule/${token}`, { start_at: blockedSlot }, ip);
  assert.equal(toBlocked.status, 409, JSON.stringify(toBlocked.data));
  const toNight = await api(null, 'POST', `/public/book/${ctx.slug}/reschedule/${token}`,
    { start_at: new Date(new Date(morning).getTime() - 8 * HOUR).toISOString() }, ip);
  assert.equal(toNight.status, 400);
  // Moverla 30 min (solapa con su propio horario actual: no choca consigo misma)
  const shifted = at(30 * 60_000);
  assert.ok(slots.includes(shifted));
  const good = await api(null, 'POST', `/public/book/${ctx.slug}/reschedule/${token}`, { start_at: shifted }, ip);
  assert.equal(good.status, 200, JSON.stringify(good.data));
  assert.equal(good.data.start_at, shifted);
});

test('Reserva pública: rate limit por IP (10 por hora)', async () => {
  const ip = '198.51.100.99';
  for (let i = 0; i < 10; i++) {
    const r = await api(null, 'POST', `/public/book/${ctx.slug}`, {}, ip);
    assert.equal(r.status, 400, `petición ${i + 1}`);
  }
  const blocked = await api(null, 'POST', `/public/book/${ctx.slug}`, {}, ip);
  assert.equal(blocked.status, 429);
  assert.match(blocked.data.error, /Demasiadas solicitudes/);
  // El reagendado comparte el cupo; otra IP no se ve afectada
  assert.equal((await api(null, 'POST', `/public/book/${ctx.slug}/reschedule/x`, {}, ip)).status, 429);
  assert.equal((await api(null, 'POST', `/public/book/${ctx.slug}`, {}, '198.51.100.98')).status, 400);
});
