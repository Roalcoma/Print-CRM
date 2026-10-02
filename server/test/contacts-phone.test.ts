// Teléfonos normalizados y sin contactos duplicados (phone.ts + migración 044), y reserva pública sin
// doble reserva por carrera (candado por calendario en booking.ts).
// Uso: `npm test` (levanta el servidor de pruebas; ver test/run.ts). La org y el usuario se crean
// directo en BD (sin pasar por /auth: su rate limit lo comparten todos los tests).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { normalizePhone, phoneMatchKey, samePhone } from '../src/phone.ts';

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3202';
if (BASE.includes('rocco.arbolaureo.org')) throw new Error('No correr los tests contra producción');

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const stamp = Date.now();
const rnd = () => Math.random().toString().slice(2, 9);
const one = async (sql: string, params: unknown[]) => (await db.query(sql, params)).rows[0];

// `ip` va en X-Forwarded-For: cada reserva usa su propio cupo del rate limit público
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

const ctx = {} as { orgId: string; token: string; waSecret: string; instance: string; slug: string };
const ip = () => `10.44.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

function waInbound(phone: string, text: string, suffix = '@s.whatsapp.net') {
  return api(null, 'POST', `/wa/webhook/${ctx.waSecret}`, {
    event: 'messages.upsert', instance: ctx.instance,
    data: {
      key: { remoteJid: `${phone}${suffix}`, fromMe: false, id: `WA-${rnd()}${rnd()}` },
      pushName: 'Lead Teléfono', messageType: 'conversation', message: { conversation: text },
      messageTimestamp: Math.floor(Date.now() / 1000),
    },
  });
}
const contactsByKey = async (phone: string) => (await db.query(
  `SELECT id FROM contacts WHERE organization_id = $1 AND right(phone_digits, 10) = $2`, [ctx.orgId, phoneMatchKey(phone)],
)).rows as { id: string }[];

before(async () => {
  ctx.orgId = (await one(`INSERT INTO organizations (name) VALUES ($1) RETURNING id`, [`Teléfonos ${stamp}`])).id;
  const user = await one(
    `INSERT INTO users (organization_id, email, password_hash, name, role) VALUES ($1,$2,'x','Dueño Tel','owner') RETURNING id`,
    [ctx.orgId, `phone-owner-${stamp}@test.local`],
  );
  ctx.token = jwt.sign({ userId: user.id, organizationId: ctx.orgId, role: 'owner' }, process.env.JWT_SECRET!, { expiresIn: '10m' });
  ctx.instance = `tel-${stamp}`;
  ctx.waSecret = (await one(
    `INSERT INTO wa_settings (organization_id, instance_name, session_status) VALUES ($1, $2, 'connected') RETURNING webhook_secret`,
    [ctx.orgId, ctx.instance],
  )).webhook_secret;
  assert.equal((await api(ctx.token, 'POST', '/pipelines', { name: 'Ventas' })).status, 201);

  ctx.slug = `tel-${stamp}`;
  const cal = await api(ctx.token, 'POST', '/calendars', {
    name: 'Asesoría', slug: ctx.slug, booking_enabled: true, duration_minutes: 30, buffer_minutes: 0,
    timezone: 'America/New_York', min_notice_hours: 0, max_advance_days: 14,
    availability: [0, 1, 2, 3, 4, 5, 6].map(d => ({ day_of_week: d, start_time: '00:00', end_time: '23:30', is_active: true })),
  });
  assert.equal(cal.status, 201, JSON.stringify(cal.data));
});

after(async () => {
  await db.end();
});

test('normalizePhone: solo dígitos, 00, EE. UU. de 10 dígitos y móvil venezolano; sin inventar dígitos', () => {
  assert.equal(normalizePhone('(407) 555-1234'), '14075551234');
  assert.equal(normalizePhone('+1 407.555.1234'), '14075551234');
  assert.equal(normalizePhone('0058 414-123 4567'), '584141234567');
  assert.equal(normalizePhone('0414-1234567'), '584141234567');
  assert.equal(normalizePhone('+58 (414) 123-4567'), '584141234567');
  // Ambiguos o que no encajan: se quedan como dígitos tal cual
  assert.equal(normalizePhone('4141234567'), '4141234567', 'NANP no admite central 1xx: no se le pone 1');
  assert.equal(normalizePhone('02121234567'), '02121234567', 'fijo venezolano: no se toca');
  assert.equal(normalizePhone('555-1234'), '5551234');
  assert.equal(normalizePhone('  '), null);
  assert.equal(phoneMatchKey('123456'), null, 'menos de 7 dígitos no se compara');
  assert.ok(samePhone('(407) 555-1234', '14075551234'));
  assert.ok(samePhone('0414 1234567', '+58 414 1234567'));
  assert.ok(!samePhone('4075551234', '4075551235'));
});

test('migración 044: la columna phone_digits usa la misma regla que normalizePhone', async () => {
  const samples = ['(407) 555-1234', '0058 414-123 4567', '0414-1234567', '4141234567', '02121234567', '555-1234', '', 'abc'];
  for (const s of samples) {
    const r = await one('SELECT crm_phone_digits($1) AS d', [s]);
    assert.equal(r.d, normalizePhone(s), `regla distinta para "${s}"`);
  }
});

test('WhatsApp: mensajes simultáneos de un número nuevo crean un contacto y una oportunidad', async () => {
  // Ráfaga de mensajes; la mitad con JID @c.us (otra fila de conversación: su candado no los serializa)
  const burst = (phone: string) => Promise.all(Array.from({ length: 10 }, (_, i) =>
    waInbound(phone, `Mensaje ${i + 1}`, i % 2 ? '@c.us' : '@s.whatsapp.net')));
  const processed = (phone: string) => until('ráfaga procesada', async () => (await one(
    `SELECT count(*)::int AS n FROM conv_messages m JOIN conversations c ON c.id = m.conversation_id
     WHERE c.organization_id = $1 AND c.wa_chat_id LIKE $2`, [ctx.orgId, `${phone}@%`])).n === 10);

  // Calentar el pool de conexiones del servidor (abrir conexiones nuevas espacia las peticiones y la
  // carrera no se daría): ráfaga previa desde otro número, antes de crear la regla
  const warm = `1786${Math.floor(2_000_000 + Math.random() * 7_000_000)}`;
  await burst(warm);
  await processed(warm);

  const rule = await api(ctx.token, 'POST', '/automations', {
    name: 'Lead al crear contacto', trigger_type: 'contact_created',
    config: { steps: [{ id: 's1', type: 'create_opportunity', title: 'Lead {{contact.name}}', source: 'whatsapp' }] },
  });
  assert.equal(rule.status, 201, JSON.stringify(rule.data));

  const phone = `1689${Math.floor(2_000_000 + Math.random() * 7_000_000)}`;
  for (const r of await burst(phone)) assert.equal(r.status, 200);
  await processed(phone);
  const contacts = await until('contacto creado', async () => { const r = await contactsByKey(phone); return r.length ? r : null; });
  await until('oportunidad creada', async () => (await one(
    'SELECT count(*)::int AS n FROM opportunities WHERE contact_id = $1', [contacts[0].id])).n >= 1);
  await new Promise(r => setTimeout(r, 700)); // margen por si llegara una segunda alta/oportunidad

  assert.equal((await contactsByKey(phone)).length, 1, 'un solo contacto');
  const opps = await one(
    `SELECT count(*)::int AS n FROM opportunities o JOIN contacts c ON c.id = o.contact_id
     WHERE o.organization_id = $1 AND right(c.phone_digits, 10) = $2`, [ctx.orgId, phoneMatchKey(phone)]);
  assert.equal(opps.n, 1, 'una sola oportunidad (contact_created se dispara una vez)');
  const runs = await one('SELECT count(*)::int AS n FROM automation_runs WHERE automation_id = $1', [rule.data.id]);
  assert.equal(runs.n, 1, 'una sola ejecución de la regla');

  await api(ctx.token, 'PATCH', `/automations/${rule.data.id}`, { enabled: false });
});

test('WhatsApp: un contacto guardado como "(407) 555-1234" se enlaza con el mensaje de 14075551234', async () => {
  const local = `(407) ${Math.floor(200 + Math.random() * 700)}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
  const created = await api(ctx.token, 'POST', '/contacts', { first_name: 'Guardado', last_name: 'A mano', phone: local });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const jidPhone = normalizePhone(local)!;
  assert.equal(jidPhone.length, 11);

  await waInbound(jidPhone, 'Hola, soy yo');
  const conv = await until('conversación enlazada', async () => {
    const c = await one('SELECT contact_id FROM conversations WHERE organization_id = $1 AND wa_chat_id = $2', [ctx.orgId, `${jidPhone}@s.whatsapp.net`]);
    return c?.contact_id ? c : null;
  });
  assert.equal(conv.contact_id, created.data.id, 'se enlaza al contacto existente');
  assert.equal((await contactsByKey(jidPhone)).length, 1, 'no se crea un duplicado');

  // Alta manual del mismo número con otro formato → actualiza el existente (200), no duplica
  const again = await api(ctx.token, 'POST', '/contacts', { first_name: 'Guardado', phone: `+${jidPhone}` });
  assert.equal(again.status, 200);
  assert.equal(again.data.id, created.data.id);
});

async function freeSlots(): Promise<string[]> {
  const r = await api(null, 'GET', `/public/book/${ctx.slug}`);
  assert.equal(r.status, 200);
  return r.data.slots.flatMap((d: { times: string[] }) => d.times);
}

test('Reserva pública: busca el contacto por teléfono con la misma lógica (EE. UU. y Venezuela)', async () => {
  const us = await api(ctx.token, 'POST', '/contacts', { first_name: 'Usa', phone: '+1 (321) 555-7788' });
  const ve = await api(ctx.token, 'POST', '/contacts', { first_name: 'Vene', phone: '+58 414-555-7788' });
  assert.equal(us.status, 201); assert.equal(ve.status, 201);
  const slots = await freeSlots();
  assert.ok(slots.length >= 2, 'hacen falta huecos libres');

  const b1 = await api(null, 'POST', `/public/book/${ctx.slug}`, {
    name: 'Usa Reserva', email: `usa-${stamp}@test.local`, phone: '321-555-7788', start_at: slots[0],
  }, ip());
  assert.equal(b1.status, 201, JSON.stringify(b1.data));
  const b2 = await api(null, 'POST', `/public/book/${ctx.slug}`, {
    name: 'Vene Reserva', email: `ve-${stamp}@test.local`, phone: '0414 5557788', start_at: slots[1],
  }, ip());
  assert.equal(b2.status, 201, JSON.stringify(b2.data));

  assert.equal((await one('SELECT contact_id FROM appointments WHERE id = $1', [b1.data.appointment.id])).contact_id, us.data.id);
  assert.equal((await one('SELECT contact_id FROM appointments WHERE id = $1', [b2.data.appointment.id])).contact_id, ve.data.id);
});

test('Reserva pública: dos reservas simultáneas al mismo hueco → una 201 y la otra 409', async () => {
  const free = await freeSlots();
  const slot = free[Math.floor(free.length / 2)]; // en medio de la ventana (lejos de sus bordes)
  const book = (n: number) => api(null, 'POST', `/public/book/${ctx.slug}`, {
    name: `Carrera ${n}`, email: `carrera-${n}-${stamp}@test.local`, start_at: slot,
  }, ip());
  const results = await Promise.all([book(1), book(2), book(3)]);
  const codes = results.map(r => r.status).sort();
  assert.deepEqual(codes, [201, 409, 409], JSON.stringify(results.map(r => r.data)));
  assert.match(results.find(r => r.status === 409)!.data.error, /no está disponible/);
  const n = await one(
    `SELECT count(*)::int AS n FROM appointments a JOIN calendars c ON c.id = a.calendar_id
     WHERE c.slug = $1 AND a.start_at = $2 AND a.status = 'scheduled'`, [ctx.slug, slot]);
  assert.equal(n.n, 1, 'una sola cita en ese hueco');
});

test('Citas del CRM en el mismo calendario pueden seguir solapándose (no se cambia ese comportamiento)', async () => {
  const cal = await one('SELECT id FROM calendars WHERE slug = $1', [ctx.slug]);
  const start = new Date(Date.now() + 3 * 86_400_000).toISOString();
  const end = new Date(Date.now() + 3 * 86_400_000 + 1_800_000).toISOString();
  const a = await api(ctx.token, 'POST', '/appointments', { title: 'Interna 1', start_at: start, end_at: end, calendar_id: cal.id });
  const b = await api(ctx.token, 'POST', '/appointments', { title: 'Interna 2', start_at: start, end_at: end, calendar_id: cal.id });
  assert.equal(a.status, 201, JSON.stringify(a.data));
  assert.equal(b.status, 201, JSON.stringify(b.data));
});
