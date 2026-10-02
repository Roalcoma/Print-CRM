// Fiabilidad del motor de automatizaciones y de las llamadas externas:
// reintentos de WhatsApp caído, runs atascados tras un reinicio, reanudación por id de paso
// (editar la regla mientras un run espera), timeouts de Evolution y limpieza de tablas (retención).
// El motor corre EN ESTE PROCESO (importado de src/) contra la BD local y un Evolution FALSO propio
// en otro puerto: no depende del servidor de pruebas ni del falso de flows.test.ts. Todo se filtra por
// la organización de prueba (la BD local es compartida con los demás tests).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import pg from 'pg';
import { pool as appPool } from '../src/db.ts';
import { executeRun, fireTagTrigger, recoverStuckRuns, resumeTimedRuns } from '../src/services/automation-engine.ts';
import { runRetention } from '../src/services/retention.ts';

const FAKE_PORT = Number(process.env.RELIABILITY_FAKE_PORT ?? (Number(new URL(process.env.TEST_FAKE_URL ?? 'http://localhost:4202').port) + 101));
const FAKE = `http://localhost:${FAKE_PORT}`;
if ((process.env.DATABASE_URL ?? '').includes('rocco.arbolaureo.org')) throw new Error('No correr contra producción');

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const stamp = Date.now();
const one = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows[0];

// ── Evolution falso ──────────────────────────────────────────────────────────
let mode: 'ok' | 'down' | 'slow' = 'ok';
const noWa = new Set<string>();                       // números "sin WhatsApp"
const attempts: { number: string; text: string; ok: boolean }[] = [];

const fake = http.createServer((req, res) => {
  let raw = '';
  req.on('data', d => { raw += d; });
  req.on('end', () => {
    const body = raw ? JSON.parse(raw) : {};
    const reply = (status: number, json: unknown) => res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(json));
    if (!req.url!.startsWith('/message/sendText/')) return reply(404, { error: 'no simulado' });
    const ok = mode === 'ok' && !noWa.has(body.number);
    attempts.push({ number: body.number, text: body.text, ok });
    if (noWa.has(body.number)) {
      return reply(400, { status: 400, error: 'Bad Request', response: { message: [{ jid: `${body.number}@s.whatsapp.net`, exists: false, number: body.number }] } });
    }
    if (mode === 'down') return reply(500, { status: 500, error: 'Internal Server Error', response: { message: 'Connection Closed' } });
    const send = () => reply(201, { key: { remoteJid: `${body.number}@s.whatsapp.net`, fromMe: true, id: `EVO-${Math.random()}` }, status: 'PENDING' });
    if (mode === 'slow') setTimeout(send, 3000); else send();
  });
});
const sentOk = (number: string, text?: string) => attempts.filter(a => a.ok && a.number === number && (text === undefined || a.text === text)).length;

// ── Datos de prueba (directo en BD: sin /auth/register por el límite de peticiones) ──
const ctx = {} as { orgId: string; ownerId: string; waId: string };
let seq = 0;
const phoneN = () => `5841255${String(stamp).slice(-3)}${String(++seq).padStart(2, '0')}`;

async function contact(phone: string) {
  return (await one(`INSERT INTO contacts (organization_id, first_name, last_name, phone) VALUES ($1, 'Lina', 'Prueba', $2) RETURNING id`,
    [ctx.orgId, `+${phone}`])).id as string;
}
async function rule(name: string, steps: unknown[]) {
  const tag = `rel-${stamp}-${++seq}`;
  const id = (await one(
    `INSERT INTO automation_rules (organization_id, trigger_type, name, enabled, config) VALUES ($1, 'tag_added', $2, true, $3) RETURNING id`,
    [ctx.orgId, `${name} ${stamp}`, JSON.stringify({ trigger: { tag }, steps })],
  )).id as string;
  return { id, tag };
}
async function setSteps(ruleId: string, steps: unknown[]) {
  await db.query(`UPDATE automation_rules SET config = jsonb_set(config, '{steps}', $2::jsonb) WHERE id = $1`, [ruleId, JSON.stringify(steps)]);
}
const runOf = (ruleId: string) => one(`SELECT * FROM automation_runs WHERE automation_id = $1 ORDER BY created_at DESC LIMIT 1`, [ruleId]);
const setWa = (status: string) => db.query(`UPDATE wa_settings SET session_status = $1 WHERE id = $2`, [status, ctx.waId]);

async function until<T>(what: string, fn: () => Promise<T | null | undefined | false>, ms = 6000): Promise<T> {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error(`Tiempo agotado esperando: ${what}`);
    await new Promise(r => setTimeout(r, 50));
  }
}
const runIn = (ruleId: string, pred: (r: any) => boolean, what: string) =>
  until(what, async () => { const r = await runOf(ruleId); return r && pred(r) ? r : null; });

// "Pasan los 5 minutos": se adelanta resume_at y se reanuda como lo haría el scheduler
async function fastForward(runId: string) {
  await db.query(`UPDATE automation_runs SET resume_at = NOW() WHERE id = $1 AND status = 'waiting_timed'`, [runId]);
  await resumeTimedRuns(ctx.orgId);
}

before(async () => {
  await new Promise<void>(r => fake.listen(FAKE_PORT, r));
  ctx.orgId = (await one(`INSERT INTO organizations (name) VALUES ($1) RETURNING id`, [`Fiabilidad ${stamp}`])).id;
  ctx.ownerId = (await one(
    `INSERT INTO users (organization_id, email, password_hash, name, role) VALUES ($1, $2, 'x', 'Dueña Fiabilidad', 'owner') RETURNING id`,
    [ctx.orgId, `reliability-${stamp}@test.local`],
  )).id;
  ctx.waId = (await one(
    `INSERT INTO wa_settings (organization_id, evo_url, evo_api_key, instance_name, session_status, display_name, is_default)
     VALUES ($1, $2, 'evo-test-key', $3, 'connected', 'WA de prueba', true) RETURNING id`,
    [ctx.orgId, FAKE, `rel-${stamp}`],
  )).id;
});

after(async () => {
  fake.closeAllConnections();
  fake.close();
  await db.query(`DELETE FROM crm_audit_log WHERE organization_id = $1`, [ctx.orgId]).catch(() => {});
  await db.query(`DELETE FROM organizations WHERE id = $1`, [ctx.orgId]).catch(() => {});
  await db.end();
  await appPool.end();
});

// ── 1. WhatsApp caído → espera y reintenta; al volver se envía una sola vez ─────
test('WhatsApp desconectado: el run espera en el mismo paso y, al volver, envía el mensaje una sola vez', async () => {
  const phone = phoneN();
  const r = await rule('Reintento WA', [
    { id: 'm1', type: 'send_whatsapp', message: 'Hola {{contact.first_name}}' },
    { id: 'n1', type: 'send_notification', notification_title: `Después del WA ${stamp}`, notification_body: 'ok' },
  ]);
  const c = await contact(phone);

  // Sin instancia conectada (getWaClient null)
  await setWa('disconnected');
  await fireTagTrigger(ctx.orgId, c, [r.tag]);
  let run = await runIn(r.id, x => x.status === 'waiting_timed', 'run esperando WhatsApp');
  assert.equal(run.current_step, 0);
  assert.equal(run.step_data.__wa_retry__.count, 1);
  assert.equal(run.step_data.__cursor__.next_step_id, 'm1');
  const wait = new Date(run.resume_at).getTime() - Date.now();
  assert.ok(wait > 4 * 60_000 && wait <= 5 * 60_000 + 5000, `resume_at a ~5 min (es ${wait} ms)`);
  assert.equal(attempts.filter(a => a.number === phone).length, 0, 'no se llama a Evolution sin instancia conectada');

  // Instancia "conectada" pero Evolution responde 500: también se reintenta
  await setWa('connected');
  mode = 'down';
  await fastForward(run.id);
  run = await runIn(r.id, x => x.status === 'waiting_timed' && x.step_data.__wa_retry__?.count === 2, 'segundo reintento');
  assert.match(run.step_data.__wa_retry__.last_error, /500/);
  assert.equal(run.step_data.m1, undefined, 'sin marca de envío tras un fallo');

  // Vuelve WhatsApp
  mode = 'ok';
  await fastForward(run.id);
  run = await runIn(r.id, x => x.status === 'completed', 'run completado');
  assert.equal(sentOk(phone, 'Hola Lina'), 1);
  assert.deepEqual(run.step_data.m1, { sent: true });
  assert.equal(run.step_data.__wa_retry__, undefined);
  assert.ok(await one(`SELECT 1 FROM notifications WHERE organization_id = $1 AND title = $2`, [ctx.orgId, `Después del WA ${stamp}`]));

  // Reanudar de nuevo un run terminado no reenvía nada
  await executeRun(run.id);
  assert.equal(sentOk(phone), 1);
});

test('Número sin WhatsApp (exists:false): se salta el paso sin reintentar', async () => {
  const phone = phoneN();
  noWa.add(phone);
  const r = await rule('Sin WA', [
    { id: 'm1', type: 'send_whatsapp', message: 'Hola' },
    { id: 'n1', type: 'send_notification', notification_title: `Sigue sin WA ${stamp}`, notification_body: 'ok' },
  ]);
  await fireTagTrigger(ctx.orgId, await contact(phone), [r.tag]);
  const run = await runIn(r.id, x => x.status === 'completed', 'run completado');
  assert.equal(attempts.filter(a => a.number === phone).length, 1, 'un solo intento');
  assert.deepEqual(run.step_data.m1, { sent: false, reason: 'sin_whatsapp' });
  assert.equal(run.step_data.__wa_retry__, undefined);
});

test('Evolution lento: el envío corta por timeout y entra en la lógica de reintento', async () => {
  const prev = process.env.EXTERNAL_TIMEOUT_MS;
  process.env.EXTERNAL_TIMEOUT_MS = '300';
  mode = 'slow';
  try {
    const phone = phoneN();
    const r = await rule('Timeout', [{ id: 'm1', type: 'send_whatsapp', message: 'Hola' }]);
    const t0 = Date.now();
    await fireTagTrigger(ctx.orgId, await contact(phone), [r.tag]);
    const run = await runIn(r.id, x => x.status === 'waiting_timed', 'run esperando tras timeout');
    assert.ok(Date.now() - t0 < 2500, `falla rápido (${Date.now() - t0} ms), sin esperar los 3 s de Evolution`);
    assert.equal(run.step_data.__wa_retry__.count, 1);
    assert.match(run.step_data.__wa_retry__.last_error, /no respondió a tiempo/);
  } finally {
    mode = 'ok';
    if (prev === undefined) delete process.env.EXTERNAL_TIMEOUT_MS; else process.env.EXTERNAL_TIMEOUT_MS = prev;
  }
});

test('Tras agotar los reintentos (1 hora) el run falla y avisa a owner/admin', async () => {
  const phone = phoneN();
  const r = await rule('Agotado', [{ id: 'm1', type: 'send_whatsapp', message: 'Hola' }]);
  await setWa('disconnected');
  try {
    await fireTagTrigger(ctx.orgId, await contact(phone), [r.tag]);
    let run = await runIn(r.id, x => x.status === 'waiting_timed', 'run esperando');
    // Simula los 11 reintentos anteriores
    await db.query(`UPDATE automation_runs SET step_data = jsonb_set(step_data, '{__wa_retry__,count}', '12') WHERE id = $1`, [run.id]);
    await fastForward(run.id);
    run = await runIn(r.id, x => x.status === 'failed', 'run fallido');
    assert.equal(run.step_data.m1.sent, false);
    const n = await one(`SELECT title, body FROM notifications WHERE user_id = $1 AND entity_id = $2`, [ctx.ownerId, run.id]);
    assert.ok(n, 'notificación a la dueña');
    assert.match(n.body, new RegExp(`Agotado ${stamp}`));
    assert.match(n.body, /WhatsApp desconectado/);
    assert.match(n.body, new RegExp(phone));
  } finally {
    await setWa('connected');
  }
});

// ── 2. Runs atascados tras un reinicio ─────────────────────────────────────────
test('Un run que quedó en running por un reinicio se recupera y no repite un envío interrumpido', async () => {
  const p1 = phoneN();
  const p2 = phoneN();
  const steps = [
    { id: 'm1', type: 'send_whatsapp', message: 'Recuperado' },
    { id: 'n1', type: 'send_notification', notification_title: `Recuperado ${stamp}`, notification_body: 'ok' },
  ];
  const r = await rule('Atascado', steps);
  const c1 = await contact(p1);
  const c2 = await contact(p2);
  const insert = (contactId: string, phone: string, stepData: unknown, age: string) => one(
    `INSERT INTO automation_runs (organization_id, automation_id, contact_id, contact_phone, status, current_step, step_data, updated_at)
     VALUES ($1, $2, $3, $4, 'running', 0, $5, NOW() - $6::interval) RETURNING id`,
    [ctx.orgId, r.id, contactId, phone, JSON.stringify(stepData), age],
  );
  const stuck = await insert(c1, p1, { __cursor__: { next_step_id: 'm1', done: false } }, '15 minutes');
  // Murió justo al enviar: la marca de "enviando" quedó guardada
  const midSend = await insert(c2, p2, { __cursor__: { next_step_id: 'm1', done: false }, m1: { sending: true } }, '20 minutes');
  const fresh = await insert(c1, p1, { __cursor__: { next_step_id: 'm1', done: false } }, '2 minutes');
  const ancient = await insert(c1, p1, { __cursor__: { next_step_id: 'm1', done: false } }, '3 days');

  assert.equal(await recoverStuckRuns(ctx.orgId), 2);
  assert.equal((await one(`SELECT status FROM automation_runs WHERE id = $1`, [fresh.id])).status, 'running', 'uno reciente no se toca');
  const old = await one(`SELECT status, step_data FROM automation_runs WHERE id = $1`, [ancient.id]);
  assert.equal(old.status, 'failed', 'uno atascado hace días no se reanuda (mensaje a destiempo)');
  assert.match(old.step_data.__note__.message, /24 h/);
  await resumeTimedRuns(ctx.orgId);

  const done = (id: string) => until('run completado', async () => {
    const x = await one(`SELECT * FROM automation_runs WHERE id = $1`, [id]);
    return x.status === 'completed' ? x : null;
  });
  const a = await done(stuck.id);
  assert.deepEqual(a.step_data.m1, { sent: true });
  assert.equal(sentOk(p1, 'Recuperado'), 1);
  const b = await done(midSend.id);
  assert.deepEqual(b.step_data.m1, { sent: 'unknown' });
  assert.equal(attempts.filter(x => x.number === p2).length, 0, 'el envío interrumpido no se repite');
  await db.query(`UPDATE automation_runs SET status = 'cancelled' WHERE id = $1`, [fresh.id]);
});

test('Editar la regla mientras un run espera: se reanuda por id de paso (sin repetir ni saltar mensajes)', async () => {
  const phone = phoneN();
  const m1 = { id: 'm1', type: 'send_whatsapp', message: 'primero' };
  const w1 = { id: 'w1', type: 'wait_minutes', minutes: 60 };
  const m2 = { id: 'm2', type: 'send_whatsapp', message: 'segundo' };
  const r = await rule('Editada', [m1, w1, m2]);
  await fireTagTrigger(ctx.orgId, await contact(phone), [r.tag]);
  let run = await runIn(r.id, x => x.status === 'waiting_timed', 'run en la espera');
  assert.equal(run.current_step, 2);
  assert.equal(sentOk(phone, 'primero'), 1);

  // Se inserta un paso ANTES del actual: con el índice viejo (2) tocaría la espera otra vez
  await setSteps(r.id, [{ id: 'x0', type: 'send_whatsapp', message: 'nuevo' }, m1, w1, m2]);
  await fastForward(run.id);
  run = await runIn(r.id, x => x.status === 'completed', 'run completado');
  assert.equal(sentOk(phone, 'segundo'), 1);
  assert.equal(sentOk(phone, 'primero'), 1, 'no se repite el primero');
  assert.equal(sentOk(phone, 'nuevo'), 0, 'el paso insertado antes no se ejecuta');
  assert.equal(run.current_step, 4);

  // Si el paso pendiente se borró de la regla, el run termina con una nota
  const phone2 = phoneN();
  const r2 = await rule('Paso borrado', [m1, w1, m2]);
  await fireTagTrigger(ctx.orgId, await contact(phone2), [r2.tag]);
  run = await runIn(r2.id, x => x.status === 'waiting_timed', 'run en la espera');
  await setSteps(r2.id, [m1, w1, { id: 'm3', type: 'send_whatsapp', message: 'otro' }]);
  await fastForward(run.id);
  run = await runIn(r2.id, x => x.status === 'completed', 'run completado');
  assert.match(run.step_data.__note__.message, /m2 se eliminó/);
  assert.equal(sentOk(phone2, 'otro'), 0);
});

// ── 4. Retención ─────────────────────────────────────────────────────────────
test('Retención: borra lo viejo y conserva lo reciente', async () => {
  const o = ctx.orgId;
  const notif = (title: string, age: string, read: boolean, entity = 'contact', entityId: string | null = null) => one(
    `INSERT INTO notifications (organization_id, user_id, type, title, read_at, entity_type, entity_id, created_at)
     VALUES ($1, $2, 'system', $3, CASE WHEN $4 THEN NOW() END, $5, $6, NOW() - $7::interval) RETURNING id`,
    [o, ctx.ownerId, title, read, entity, entityId, age],
  );
  const n = {
    readOld: await notif('leída vieja', '100 days', true),
    readNew: await notif('leída reciente', '30 days', true),
    unreadMid: await notif('no leída 100 d', '100 days', false),
    unreadOld: await notif('no leída vieja', '200 days', false),
    waOlder: await notif('WhatsApp desconectado', '300 days', false, 'wa_instance', ctx.waId),
    waLast: await notif('WhatsApp desconectado', '200 days', false, 'wa_instance', ctx.waId),
  };

  const r = await rule('Retención', [{ id: 'n1', type: 'send_notification', notification_title: 'x' }]);
  const run = (status: string, age: string) => one(
    `INSERT INTO automation_runs (organization_id, automation_id, status, completed_at, created_at, updated_at)
     VALUES ($1, $2, $3, CASE WHEN $3 = 'completed' THEN NOW() - $4::interval END, NOW() - $4::interval, NOW() - $4::interval) RETURNING id`,
    [o, r.id, status, age],
  );
  const runs = {
    doneOld: await run('completed', '100 days'), failedOld: await run('failed', '100 days'),
    doneNew: await run('completed', '10 days'), waitingOld: await run('waiting', '200 days'),
  };

  const ent = '00000000-0000-0000-0000-000000000001';
  const act = (age: string) => one(`INSERT INTO activity_feed (organization_id, entity_type, entity_id, event_type, created_at)
    VALUES ($1, 'contact', $2, 'note', NOW() - $3::interval) RETURNING id`, [o, ent, age]);
  const acts = { old: await act('400 days'), recent: await act('300 days') };
  const aud = (age: string) => one(`INSERT INTO crm_audit_log (organization_id, action, created_at) VALUES ($1, 'login', NOW() - $2::interval) RETURNING id`, [o, age]);
  const auds = { old: await aud('800 days'), year: await aud('400 days') };

  const conn = (await one(`INSERT INTO social_connections (organization_id, platform, page_id, page_name, access_token, status)
    VALUES ($1, 'instagram', $2, 'IG retención', 'x', 'disconnected') RETURNING id`, [o, `ret-${stamp}`])).id;
  await db.query(`INSERT INTO ig_processed_comments (comment_id, connection_id, created_at) VALUES ($1, $3, NOW() - interval '40 days'), ($2, $3, NOW() - interval '5 days')`,
    [`c-old-${stamp}`, `c-new-${stamp}`, conn]);

  const conv = (await one(`INSERT INTO conversations (organization_id, wa_chat_id, display_name) VALUES ($1, $2, 'Media') RETURNING id`, [o, `${phoneN()}@s.whatsapp.net`])).id;
  const msg = (dir: string, waId: string | null, age: string) => one(
    `INSERT INTO conv_messages (conversation_id, organization_id, wa_message_id, direction, msg_type, media_url, created_at)
     VALUES ($1, $2, $3, $4, 'image', 'data:image/png;base64,AAAA', NOW() - $5::interval) RETURNING id`,
    [conv, o, waId, dir, age],
  );
  const msgs = {
    inOld: await msg('inbound', `WA-RET-1-${stamp}`, '40 days'),
    outOld: await msg('outbound', `WA-RET-2-${stamp}`, '40 days'),
    inNew: await msg('inbound', `WA-RET-3-${stamp}`, '5 days'),
  };

  // Sin RETENTION_PURGE_MEDIA la media no se toca
  await runRetention({ orgId: o, purgeMedia: false });
  assert.ok((await one(`SELECT media_url FROM conv_messages WHERE id = $1`, [msgs.inOld.id])).media_url);
  const res = await runRetention({ orgId: o, purgeMedia: true });
  assert.equal(res['media cacheada'], 1);

  const exists = async (table: string, id: string, key = 'id') => !!(await one(`SELECT 1 FROM ${table} WHERE ${key} = $1`, [id]));
  assert.equal(await exists('notifications', n.readOld.id), false);
  assert.equal(await exists('notifications', n.readNew.id), true);
  assert.equal(await exists('notifications', n.unreadMid.id), true);
  assert.equal(await exists('notifications', n.unreadOld.id), false);
  assert.equal(await exists('notifications', n.waOlder.id), false);
  assert.equal(await exists('notifications', n.waLast.id), true, 'el último aviso de la instancia se conserva (wa-monitor)');

  assert.equal(await exists('automation_runs', runs.doneOld.id), false);
  assert.equal(await exists('automation_runs', runs.failedOld.id), false);
  assert.equal(await exists('automation_runs', runs.doneNew.id), true);
  assert.equal(await exists('automation_runs', runs.waitingOld.id), true, 'un run en espera nunca se borra');

  assert.equal(await exists('activity_feed', acts.old.id), false);
  assert.equal(await exists('activity_feed', acts.recent.id), true);
  assert.equal(await exists('crm_audit_log', auds.old.id), false);
  assert.equal(await exists('crm_audit_log', auds.year.id), true, 'la auditoría se guarda 2 años');

  assert.equal(await exists('ig_processed_comments', `c-old-${stamp}`, 'comment_id'), false);
  assert.equal(await exists('ig_processed_comments', `c-new-${stamp}`, 'comment_id'), true);

  const media = async (id: string) => (await one(`SELECT media_url FROM conv_messages WHERE id = $1`, [id])).media_url;
  assert.equal(await media(msgs.inOld.id), null);
  assert.ok(await media(msgs.outOld.id), 'la media enviada desde el CRM no se borra');
  assert.ok(await media(msgs.inNew.id));
});
