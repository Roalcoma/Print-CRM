// Motor de automatizaciones del CRM.
// Soporta triggers por tag, ejecución de pasos secuenciales,
// espera de respuestas WA y reanudación tras respuesta entrante.

import { pool } from '../db.ts';
import { broadcast } from './ws-manager.ts';
import { evolutionFor, isNotOnWhatsapp, type EvolutionClient } from './evolution.ts';
import { sendIgDm, sendIgPrivateReply, replyToIgComment } from './instagram.ts';
import { upsertSocialConversation } from './social-inbox.ts';
import { wantsInfo, captionKeywords, matchesKeyword } from './ig-intent.ts';
import { phoneMatchKey } from '../phone.ts';
import { env } from '../env.ts';
import { mediaPublicUrl } from '../routes/automation-media.ts';

// ── Mapa de códigos de área de EE.UU. → Estado ──────────────────────────────

const AREA_CODE_MAP: Record<string, string> = {
  // Alabama
  '205': 'Alabama', '251': 'Alabama', '256': 'Alabama', '334': 'Alabama', '938': 'Alabama',
  // Alaska
  '907': 'Alaska',
  // Arizona
  '480': 'Arizona', '520': 'Arizona', '602': 'Arizona', '623': 'Arizona', '928': 'Arizona',
  // Arkansas
  '479': 'Arkansas', '501': 'Arkansas', '870': 'Arkansas',
  // California
  '209': 'California', '213': 'California', '279': 'California', '310': 'California',
  '323': 'California', '341': 'California', '350': 'California', '408': 'California',
  '415': 'California', '424': 'California', '442': 'California', '510': 'California',
  '530': 'California', '559': 'California', '562': 'California', '619': 'California',
  '626': 'California', '628': 'California', '650': 'California', '657': 'California',
  '661': 'California', '669': 'California', '707': 'California', '714': 'California',
  '747': 'California', '760': 'California', '764': 'California', '805': 'California',
  '818': 'California', '820': 'California', '831': 'California', '840': 'California',
  '858': 'California', '909': 'California', '916': 'California', '925': 'California',
  '949': 'California', '951': 'California',
  // Colorado
  '303': 'Colorado', '719': 'Colorado', '720': 'Colorado', '970': 'Colorado',
  // Connecticut
  '203': 'Connecticut', '475': 'Connecticut', '860': 'Connecticut', '959': 'Connecticut',
  // Delaware
  '302': 'Delaware',
  // Florida
  '239': 'Florida', '305': 'Florida', '321': 'Florida', '352': 'Florida', '386': 'Florida',
  '407': 'Florida', '448': 'Florida', '561': 'Florida', '571': 'Florida', '689': 'Florida',
  '727': 'Florida', '754': 'Florida', '772': 'Florida', '786': 'Florida', '813': 'Florida',
  '850': 'Florida', '863': 'Florida', '904': 'Florida', '941': 'Florida', '954': 'Florida',
  // Georgia
  '229': 'Georgia', '404': 'Georgia', '470': 'Georgia', '478': 'Georgia', '678': 'Georgia',
  '706': 'Georgia', '762': 'Georgia', '770': 'Georgia', '912': 'Georgia', '943': 'Georgia',
  // Hawaii
  '808': 'Hawaii',
  // Idaho
  '208': 'Idaho', '986': 'Idaho',
  // Illinois
  '217': 'Illinois', '224': 'Illinois', '309': 'Illinois', '312': 'Illinois', '331': 'Illinois',
  '447': 'Illinois', '464': 'Illinois', '618': 'Illinois', '630': 'Illinois', '708': 'Illinois',
  '730': 'Illinois', '773': 'Illinois', '779': 'Illinois', '815': 'Illinois', '847': 'Illinois',
  '872': 'Illinois',
  // Indiana
  '219': 'Indiana', '260': 'Indiana', '317': 'Indiana', '463': 'Indiana', '574': 'Indiana',
  '765': 'Indiana', '812': 'Indiana', '930': 'Indiana',
  // Iowa
  '319': 'Iowa', '515': 'Iowa', '563': 'Iowa', '641': 'Iowa', '712': 'Iowa',
  // Kansas
  '316': 'Kansas', '620': 'Kansas', '785': 'Kansas', '913': 'Kansas',
  // Kentucky
  '270': 'Kentucky', '364': 'Kentucky', '502': 'Kentucky', '606': 'Kentucky', '859': 'Kentucky',
  // Louisiana
  '225': 'Louisiana', '318': 'Louisiana', '337': 'Louisiana', '504': 'Louisiana', '985': 'Louisiana',
  // Maine
  '207': 'Maine',
  // Maryland
  '240': 'Maryland', '301': 'Maryland', '410': 'Maryland', '443': 'Maryland', '667': 'Maryland',
  // Massachusetts
  '339': 'Massachusetts', '351': 'Massachusetts', '413': 'Massachusetts', '508': 'Massachusetts',
  '617': 'Massachusetts', '774': 'Massachusetts', '781': 'Massachusetts', '857': 'Massachusetts',
  '978': 'Massachusetts',
  // Michigan
  '231': 'Michigan', '248': 'Michigan', '269': 'Michigan', '313': 'Michigan', '517': 'Michigan',
  '586': 'Michigan', '616': 'Michigan', '679': 'Michigan', '734': 'Michigan', '810': 'Michigan',
  '906': 'Michigan', '947': 'Michigan', '989': 'Michigan',
  // Minnesota
  '218': 'Minnesota', '320': 'Minnesota', '507': 'Minnesota', '612': 'Minnesota', '651': 'Minnesota',
  '763': 'Minnesota', '952': 'Minnesota',
  // Mississippi
  '228': 'Mississippi', '601': 'Mississippi', '662': 'Mississippi', '769': 'Mississippi',
  // Missouri
  '314': 'Missouri', '417': 'Missouri', '557': 'Missouri', '573': 'Missouri', '636': 'Missouri',
  '660': 'Missouri', '816': 'Missouri',
  // Montana
  '406': 'Montana',
  // Nebraska
  '308': 'Nebraska', '402': 'Nebraska', '531': 'Nebraska',
  // Nevada
  '702': 'Nevada', '725': 'Nevada', '775': 'Nevada',
  // New Hampshire
  '603': 'New Hampshire',
  // New Jersey
  '201': 'New Jersey', '551': 'New Jersey', '609': 'New Jersey', '640': 'New Jersey',
  '732': 'New Jersey', '848': 'New Jersey', '856': 'New Jersey', '862': 'New Jersey',
  '908': 'New Jersey', '973': 'New Jersey',
  // New Mexico
  '505': 'New Mexico', '575': 'New Mexico',
  // New York
  '212': 'New York', '315': 'New York', '332': 'New York', '347': 'New York', '363': 'New York',
  '516': 'New York', '518': 'New York', '585': 'New York', '607': 'New York', '631': 'New York',
  '646': 'New York', '680': 'New York', '716': 'New York', '718': 'New York',
  '845': 'New York', '914': 'New York', '917': 'New York', '929': 'New York', '934': 'New York',
  // North Carolina
  '252': 'North Carolina', '336': 'North Carolina', '472': 'North Carolina', '704': 'North Carolina',
  '743': 'North Carolina', '828': 'North Carolina', '910': 'North Carolina', '919': 'North Carolina',
  '980': 'North Carolina', '984': 'North Carolina',
  // North Dakota
  '701': 'North Dakota',
  // Ohio
  '216': 'Ohio', '220': 'Ohio', '234': 'Ohio', '283': 'Ohio', '326': 'Ohio', '330': 'Ohio',
  '380': 'Ohio', '419': 'Ohio', '440': 'Ohio', '513': 'Ohio', '567': 'Ohio', '614': 'Ohio',
  '740': 'Ohio', '937': 'Ohio',
  // Oklahoma
  '405': 'Oklahoma', '539': 'Oklahoma', '580': 'Oklahoma', '918': 'Oklahoma',
  // Oregon
  '458': 'Oregon', '503': 'Oregon', '541': 'Oregon', '971': 'Oregon',
  // Pennsylvania
  '215': 'Pennsylvania', '223': 'Pennsylvania', '267': 'Pennsylvania', '272': 'Pennsylvania',
  '412': 'Pennsylvania', '445': 'Pennsylvania', '484': 'Pennsylvania', '570': 'Pennsylvania',
  '582': 'Pennsylvania', '610': 'Pennsylvania', '717': 'Pennsylvania', '724': 'Pennsylvania',
  '814': 'Pennsylvania', '835': 'Pennsylvania', '878': 'Pennsylvania',
  // Rhode Island
  '401': 'Rhode Island',
  // South Carolina
  '803': 'South Carolina', '839': 'South Carolina', '843': 'South Carolina', '854': 'South Carolina',
  '864': 'South Carolina',
  // South Dakota
  '605': 'South Dakota',
  // Tennessee
  '423': 'Tennessee', '615': 'Tennessee', '629': 'Tennessee', '731': 'Tennessee', '865': 'Tennessee',
  '901': 'Tennessee', '931': 'Tennessee',
  // Texas
  '210': 'Texas', '214': 'Texas', '254': 'Texas', '281': 'Texas', '325': 'Texas', '346': 'Texas',
  '361': 'Texas', '409': 'Texas', '430': 'Texas', '432': 'Texas', '469': 'Texas', '512': 'Texas',
  '682': 'Texas', '713': 'Texas', '726': 'Texas', '737': 'Texas', '806': 'Texas', '817': 'Texas',
  '830': 'Texas', '832': 'Texas', '903': 'Texas', '915': 'Texas', '936': 'Texas', '940': 'Texas',
  '945': 'Texas', '956': 'Texas', '972': 'Texas', '979': 'Texas',
  // Utah
  '385': 'Utah', '435': 'Utah', '801': 'Utah',
  // Vermont
  '802': 'Vermont',
  // Virginia
  '276': 'Virginia', '434': 'Virginia', '540': 'Virginia', '703': 'Virginia', '757': 'Virginia',
  '804': 'Virginia', '826': 'Virginia', '948': 'Virginia',
  // Washington
  '206': 'Washington', '253': 'Washington', '360': 'Washington', '425': 'Washington', '509': 'Washington',
  '564': 'Washington',
  // West Virginia
  '304': 'West Virginia', '681': 'West Virginia',
  // Wisconsin
  '262': 'Wisconsin', '274': 'Wisconsin', '414': 'Wisconsin', '534': 'Wisconsin', '608': 'Wisconsin',
  '715': 'Wisconsin', '920': 'Wisconsin',
  // Wyoming
  '307': 'Wyoming',
  // Washington DC
  '202': 'District of Columbia',
  // Puerto Rico
  '787': 'Puerto Rico', '939': 'Puerto Rico',
};

// ── Utilidades ───────────────────────────────────────────────────────────────

/**
 * Extrae el código de área (3 dígitos) de un número de teléfono de EE.UU.
 * y devuelve el nombre del estado. Si no se reconoce, devuelve 'Desconocido'.
 */
export function detectUsState(phone: string): string {
  // Normalizar: quitar todo lo que no sea dígito
  const digits = phone.replace(/\D/g, '');
  // Los números USA tienen 10 dígitos o 11 con prefijo 1
  let areaCode: string;
  if (digits.length === 11 && digits.startsWith('1')) {
    areaCode = digits.slice(1, 4);
  } else if (digits.length === 10) {
    areaCode = digits.slice(0, 3);
  } else if (digits.length > 3) {
    // Intentar extraer los últimos 10 dígitos (manejo de códigos país distintos)
    const last10 = digits.slice(-10);
    areaCode = last10.slice(0, 3);
  } else {
    return 'Desconocido';
  }
  return AREA_CODE_MAP[areaCode] ?? 'Desconocido';
}

/**
 * Interpola plantillas reemplazando {{contact.X}}, {{step.N.field}} y {{appointment.X}}.
 */
export function interpolate(
  template: string,
  contact: Record<string, unknown>,
  stepOutputs: Record<string, Record<string, unknown>>,
): string {
  const appt = (stepOutputs['__appointment__'] ?? {}) as Record<string, unknown>;
  return template
    .replace(/\{\{contact\.name\}\}/g, () => {
      const fn = (contact.first_name as string) ?? '';
      const ln = (contact.last_name as string) ?? '';
      return [fn, ln].filter(Boolean).join(' ');
    })
    .replace(/\{\{contact\.id\}\}/g, () => (contact.id as string) ?? '')
    .replace(/\{\{contact\.first_name\}\}/g, () => (contact.first_name as string) ?? '')
    .replace(/\{\{contact\.last_name\}\}/g, () => (contact.last_name as string) ?? '')
    .replace(/\{\{contact\.email\}\}/g, () => (contact.email as string) ?? '')
    .replace(/\{\{contact\.phone\}\}/g, () => (contact.phone as string) ?? '')
    .replace(/\{\{appointment\.([^}]+)\}\}/g, (_match, field) => String(appt[field] ?? ''))
    .replace(/\{\{step\.([^.]+)\.([^}]+)\}\}/g, (_match, stepId, field) => {
      return String(stepOutputs[stepId]?.[field] ?? '');
    });
}

// ── Obtener cliente WA activo de la org ─────────────────────────────────────

async function getWaClient(orgId: string): Promise<EvolutionClient | null> {
  const res = await pool.query<{ evo_url: string; evo_api_key: string; instance_name: string }>(
    `SELECT evo_url, evo_api_key, instance_name
     FROM wa_settings
     WHERE organization_id = $1 AND session_status = 'connected'
     ORDER BY is_default DESC, created_at LIMIT 1`,
    [orgId],
  );
  if (!res.rows[0]) return null;
  return evolutionFor(res.rows[0]);
}

// ── Ejecución de un run ─────────────────────────────────────────────────────

// Campos de fecha/hora de una cita para las plantillas ({{appointment.start_date}}, {{appointment.start_time}}),
// formateados en la zona horaria de la cita.
export function appointmentTimeFields(start: Date, tz: string): { start_at: string; start_date: string; start_time: string } {
  return {
    start_at:   start.toISOString(),
    start_date: start.toLocaleDateString('es', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    start_time: start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }),
  };
}

// Zona de la cita para los recordatorios: la del calendario; si no tiene, la guardada en la cita
// (que al crearla ya se resolvió como calendario → navegador → organización).
const APPT_SQL = `SELECT a.status, a.start_at, COALESCE(c.timezone, a.timezone) AS timezone
  FROM appointments a LEFT JOIN calendars c ON c.id = a.calendar_id
  WHERE a.id = $1 AND a.organization_id = $2`;

type ApptWait = { appointment_id?: string | null; minutes_before?: number; resume_step?: number };

// Antes de continuar un run que esperaba "X minutos antes de la cita": si la cita se canceló, el run se
// cancela (no salen recordatorios de citas canceladas); si se reagendó, se reprograma con la hora nueva;
// si la cita ya empezó (p. ej. el servidor estuvo caído), se salta el recordatorio que seguía a la espera.
// `startIdx` es el paso por el que se va a reanudar (ya resuelto por id); devuelve el paso por el que seguir
// o 'stop'. La comparación con resume_step usa el current_step guardado (los dos se guardaron a la vez).
async function checkAppointmentWait(run: {
  id: string; organization_id: string; current_step: number; step_data: Record<string, Record<string, unknown>>;
}, steps: StepDef[], startIdx: number): Promise<number | 'stop'> {
  const w = run.step_data?.['__appt_wait__'] as ApptWait | undefined;
  if (!w?.appointment_id || run.current_step !== w.resume_step) return startIdx;
  const appt = (await pool.query<{ status: string; start_at: Date; timezone: string }>(
    APPT_SQL, [w.appointment_id, run.organization_id],
  )).rows[0];
  if (!appt || appt.status !== 'scheduled') {
    await pool.query(`UPDATE automation_runs SET status = 'cancelled', updated_at = NOW() WHERE id = $1`, [run.id]);
    return 'stop';
  }
  const prev = run.step_data['__appointment__'] as Record<string, unknown> | undefined;
  const start = new Date(appt.start_at);
  const now = new Date();
  if (start <= now) {
    // La cita ya empezó: un recordatorio a destiempo confunde más de lo que ayuda (se salta el paso que seguía a la espera)
    const next = startIdx + 1;
    await pool.query(`UPDATE automation_runs SET current_step = $1, step_data = $2, updated_at = NOW() WHERE id = $3`,
      [next, withCursor(run.step_data, steps, next), run.id]);
    return next;
  }
  if (!prev?.start_at || new Date(prev.start_at as string).getTime() === start.getTime()) return startIdx;

  // Reagendada: actualizar fecha/hora para los mensajes y recalcular cuándo toca el recordatorio
  run.step_data['__appointment__'] = { ...prev, ...appointmentTimeFields(start, appt.timezone) };
  const resumeAt = new Date(start.getTime() - (w.minutes_before ?? 120) * 60_000);
  if (resumeAt > now) {
    await pool.query(
      `UPDATE automation_runs SET status = 'waiting_timed', step_data = $1, resume_at = $2, updated_at = NOW() WHERE id = $3`,
      [JSON.stringify(run.step_data), resumeAt.toISOString(), run.id],
    );
    return 'stop';
  }
  await pool.query(`UPDATE automation_runs SET step_data = $1, updated_at = NOW() WHERE id = $2`, [JSON.stringify(run.step_data), run.id]);
  return startIdx;
}

/**
 * Sincroniza los runs que esperan "X minutos antes" de una cita tras cambiarla (reagendar, cancelar, borrar):
 * - cita cancelada/borrada/no programada → se cancelan los runs en espera;
 * - nueva hora → se actualizan {{appointment.start_*}} y se recalcula resume_at (si ya pasó, toca ya).
 * Llamar después de guardar el cambio en appointments.
 */
export async function rescheduleAppointmentWaits(orgId: string, appointmentId: string): Promise<void> {
  const runs = (await pool.query<{ id: string; current_step: number; step_data: Record<string, Record<string, unknown>> }>(
    `SELECT id, current_step, step_data FROM automation_runs
     WHERE organization_id = $1 AND status = 'waiting_timed'
       AND step_data->'__appt_wait__'->>'appointment_id' = $2
       AND current_step = (step_data->'__appt_wait__'->>'resume_step')::int`,
    [orgId, appointmentId],
  )).rows;
  if (!runs.length) return;
  const appt = (await pool.query<{ status: string; start_at: Date; timezone: string }>(APPT_SQL, [appointmentId, orgId])).rows[0];
  if (!appt || appt.status !== 'scheduled') {
    await pool.query(`UPDATE automation_runs SET status = 'cancelled', updated_at = NOW() WHERE id = ANY($1)`, [runs.map(r => r.id)]);
    return;
  }
  const start = new Date(appt.start_at);
  for (const run of runs) {
    const w = run.step_data['__appt_wait__'] as ApptWait;
    run.step_data['__appointment__'] = { ...run.step_data['__appointment__'], ...appointmentTimeFields(start, appt.timezone) };
    const resumeAt = new Date(Math.max(start.getTime() - (w.minutes_before ?? 120) * 60_000, Date.now()));
    await pool.query(
      `UPDATE automation_runs SET step_data = $1, resume_at = $2, updated_at = NOW() WHERE id = $3 AND status = 'waiting_timed'`,
      [JSON.stringify(run.step_data), resumeAt.toISOString(), run.id],
    );
  }
}

// ── Progreso y garantías de ejecución ───────────────────────────────────────
// Cada paso, al terminar, guarda en UNA sola UPDATE el índice siguiente (current_step), los datos
// (step_data) y el cursor `__cursor__.next_step_id` = id del paso por el que seguir. Al reanudar se
// busca ese id en la versión ACTUAL de la regla: si alguien insertó, movió o borró pasos mientras el
// run esperaba, se sigue por el mismo paso y no se repite ni se salta un mensaje. Si ese paso ya no
// existe, el run termina como completado con una nota (`__note__`).
// Un reinicio a mitad de un paso (corte de luz) solo puede repetir ESE paso, y nunca un envío de
// WhatsApp: antes de llamar a Evolution se guarda la marca `{sending: true}` del paso; si al reanudar
// la marca sigue ahí, no se sabe si el mensaje salió y se prefiere no duplicarlo (se marca
// `sent: 'unknown'` y se sigue). Un timeout de Evolution, en cambio, se reintenta (el mensaje podría
// llegar dos veces si Evolution lo envió pero respondió tarde: preferible a perderlo).

type StepData = Record<string, Record<string, unknown>>;

// Serializa step_data con el cursor apuntando al paso `idx` de `steps`
function withCursor(stepData: StepData, steps: StepDef[], idx: number): string {
  stepData['__cursor__'] = { next_step_id: steps[idx]?.id ?? null, done: idx >= steps.length };
  return JSON.stringify(stepData);
}

// Paso por el que reanudar un run: por el id del cursor; sin cursor (runs anteriores a este cambio,
// o pasos sin id) por el índice guardado. 'gone' = el paso pendiente se borró de la regla.
function resolveStart(run: { current_step: number; step_data: StepData }, steps: StepDef[]): number | 'gone' {
  const cur = run.step_data?.['__cursor__'] as { next_step_id?: string | null; done?: boolean } | undefined;
  if (!cur) return run.current_step;
  if (cur.done) return steps.length;
  if (!cur.next_step_id) return run.current_step;
  if (steps[run.current_step]?.id === cur.next_step_id) return run.current_step;   // sin cambios (o ids repetidos)
  const idx = steps.findIndex(s => s.id === cur.next_step_id);
  return idx >= 0 ? idx : 'gone';
}

// WhatsApp no disponible: cada cuánto se reintenta un envío y cuántas veces (12 × 5 min = 1 hora)
const WA_RETRY_MINUTES = 5;
const WA_MAX_RETRIES = 12;

// Aviso en la campanita a owner/admin cuando una automatización no pudo enviar un WhatsApp
async function notifySendFailure(orgId: string, runId: string, automationId: string, contact: Record<string, unknown>, phone: string, reason: string) {
  const rule = (await pool.query<{ name: string }>(`SELECT name FROM automation_rules WHERE id = $1`, [automationId])).rows[0];
  const who = [contact.first_name, contact.last_name].filter(Boolean).join(' ');
  const to = who ? `${who} (+${phone})` : `+${phone}`;
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE organization_id = $1 AND role IN ('owner','admin')`, [orgId],
  );
  for (const u of rows) {
    await pool.query(
      `INSERT INTO notifications (organization_id, user_id, type, title, body, entity_type, entity_id)
       VALUES ($1, $2, 'automation', $3, $4, 'automation_run', $5)`,
      [orgId, u.id, 'Mensaje de automatización no enviado',
       `No se pudo enviar el mensaje de la automatización «${rule?.name ?? 'sin nombre'}» a ${to}: ${reason}. ` +
       `Se reintentó durante ${WA_RETRY_MINUTES * WA_MAX_RETRIES} minutos. Revisa la conexión en Configuración → WhatsApp y envíalo a mano.`,
       runId],
    );
    broadcast(orgId, 'notification:new', { userId: u.id });
  }
}

export async function executeRun(runId: string): Promise<void> {
  // Cargar el run
  const runRes = await pool.query<{
    id: string;
    organization_id: string;
    automation_id: string;
    contact_id: string | null;
    contact_phone: string | null;
    status: string;
    current_step: number;
    step_data: StepData;
  }>(
    `SELECT * FROM automation_runs WHERE id = $1`,
    [runId],
  );
  const run = runRes.rows[0];
  if (!run || run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled') return;
  run.step_data ??= {};

  // Cargar la automatización
  const autoRes = await pool.query<{ config: { steps: StepDef[] } }>(
    `SELECT config FROM automation_rules WHERE id = $1`,
    [run.automation_id],
  );
  const autoRule = autoRes.rows[0];
  if (!autoRule) return;

  const steps: StepDef[] = autoRule.config?.steps ?? [];
  const orgId = run.organization_id;

  // Paso por el que seguir (por id, ver arriba)
  const resolved = resolveStart(run, steps);
  if (resolved === 'gone') {
    const missing = (run.step_data['__cursor__'] as { next_step_id?: string }).next_step_id;
    run.step_data['__note__'] = { message: `El paso ${missing} se eliminó de la automatización mientras el run esperaba: se dio por terminado.` };
    await pool.query(
      `UPDATE automation_runs SET status = 'completed', step_data = $1, completed_at = NOW(), updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(run.step_data), runId],
    );
    return;
  }
  const start = await checkAppointmentWait(run, steps, resolved);
  if (start === 'stop') return;

  // Flujo de "No asistió": si mientras esperaba la cita dejó de estar en no_show (la corrigieron
  // o el lead reagendó), no se envía nada
  const noShow = (run.step_data as Record<string, unknown>).__no_show__ as { appointment_id?: string } | undefined;
  if (noShow?.appointment_id) {
    const st = (await pool.query<{ status: string }>('SELECT status FROM appointments WHERE id = $1', [noShow.appointment_id])).rows[0]?.status;
    if (st !== 'no_show') {
      await pool.query(`UPDATE automation_runs SET status = 'cancelled', updated_at = NOW() WHERE id = $1`, [runId]);
      return;
    }
  }

  // Cargar contacto
  let contact: Record<string, unknown> = {};
  if (run.contact_id) {
    const cRes = await pool.query(
      `SELECT * FROM contacts WHERE id = $1`,
      [run.contact_id],
    );
    contact = cRes.rows[0] ?? {};
  }

  const stepData: StepData = run.step_data;
  let currentStep = start;

  for (let i = currentStep; i < steps.length; i++) {
    const step = steps[i];

    try {
      if (step.type === 'detect_us_state') {
        const phone = (contact.phone as string) ?? run.contact_phone ?? '';
        const state = detectUsState(phone);
        stepData[step.id] = { state };
        currentStep = i + 1;
        await persistRunProgress(runId, steps, currentStep, stepData);

      } else if (step.type === 'create_opportunity') {
        // Usar pipeline/stage del config si están definidos, si no tomar el primero
        let pipelineId = step.pipeline_id as string | undefined;
        let stageId    = step.stage_id    as string | undefined;

        if (!pipelineId) {
          const pipeRes = await pool.query<{ id: string }>(
            `SELECT id FROM pipelines WHERE organization_id = $1 ORDER BY created_at LIMIT 1`,
            [orgId],
          );
          if (!pipeRes.rows[0]) { currentStep = i + 1; await persistRunProgress(runId, steps, currentStep, stepData); continue; }
          pipelineId = pipeRes.rows[0].id;
        }

        if (!stageId) {
          const stageRes = await pool.query<{ id: string }>(
            `SELECT id FROM pipeline_stages WHERE pipeline_id = $1 ORDER BY position LIMIT 1`,
            [pipelineId],
          );
          if (!stageRes.rows[0]) { currentStep = i + 1; await persistRunProgress(runId, steps, currentStep, stepData); continue; }
          stageId = stageRes.rows[0].id;
        }

        const title  = interpolate(step.title  ?? '{{contact.name}}', contact, stepData);
        const source = interpolate(step.source ?? '', contact, stepData);

        const oppRes = await pool.query<{ id: string }>(
          `INSERT INTO opportunities (organization_id, pipeline_id, stage_id, contact_id, title, source)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [orgId, pipelineId, stageId, run.contact_id ?? null, title, source || null],
        );
        stepData[step.id] = { opportunity_id: oppRes.rows[0].id };
        broadcast(orgId, 'opportunity:new', { id: oppRes.rows[0].id });
        currentStep = i + 1;
        await persistRunProgress(runId, steps, currentStep, stepData);

      } else if (step.type === 'send_notification') {
        const notifTitle = interpolate(step.notification_title ?? '', contact, stepData);
        const notifBody  = interpolate(step.notification_body  ?? '', contact, stepData);

        const usersRes = await pool.query<{ id: string }>(
          `SELECT id FROM users WHERE organization_id = $1`,
          [orgId],
        );
        for (const u of usersRes.rows) {
          await pool.query(
            `INSERT INTO notifications (organization_id, user_id, type, title, body, entity_type, entity_id)
             VALUES ($1, $2, 'automation', $3, $4, 'automation_run', $5)`,
            [orgId, u.id, notifTitle, notifBody, runId],
          );
          broadcast(orgId, 'notification:new', { userId: u.id });
        }
        stepData[step.id] = { sent: true };
        currentStep = i + 1;
        await persistRunProgress(runId, steps, currentStep, stepData);

      } else if (step.type === 'wait_minutes') {
        // Espera N minutos desde ahora antes de continuar con el siguiente paso
        const minutes = (step.minutes as number) ?? 3;
        const resumeAt = new Date(Date.now() + minutes * 60_000);
        currentStep = i + 1;
        await pool.query(
          `UPDATE automation_runs
           SET status = 'waiting_timed', current_step = $1, step_data = $2,
               resume_at = $3, updated_at = NOW()
           WHERE id = $4`,
          [currentStep, withCursor(stepData, steps, currentStep), resumeAt.toISOString(), runId],
        );
        return;

      } else if (step.type === 'send_whatsapp') {
        // Si el step define `to_phone` se usa ese número fijo; de lo contrario el del contacto
        const phone = (step.to_phone as string | undefined)
          ? (step.to_phone as string).replace(/\D/g, '')
          : normalizeContactPhone(contact, run);
        const retry = stepData['__wa_retry__'] as { step_id?: string; count?: number } | undefined;

        if (!phone) {
          stepData[step.id] = { sent: false, reason: 'sin_telefono' };
        } else if (stepData[step.id]?.sending) {
          // Se reinició el servidor en pleno envío: no se sabe si salió → no se repite (ver garantías arriba)
          console.warn(`[automation-engine] run ${runId} ${step.id}: envío interrumpido por un reinicio; no se repite`);
          stepData[step.id] = { sent: 'unknown' };
        } else {
          const message = interpolate(step.message ?? '', contact, stepData);
          // Adjunto opcional (video/imagen del almacén de medios de la org): el mensaje va como caption
          const media = await resolveStepMedia(orgId, step, runId);
          const client = await getWaClient(orgId);
          let outcome: 'sent' | 'no_wa' | 'retry' = 'retry';
          let reason = 'WhatsApp desconectado';
          if (client) {
            // Marca de "enviando" ANTES de llamar a Evolution (si el proceso muere aquí, no se duplica)
            stepData[step.id] = { sending: true };
            await persistRunProgress(runId, steps, i, stepData);
            try {
              if (media) {
                await client.sendMedia(phone, {
                  mediatype: media.type, media: media.url, caption: message,
                  fileName: media.file_name, mimetype: media.mime,
                });
              } else {
                await client.sendText(phone, message);
              }
              outcome = 'sent';
            } catch (sendErr: unknown) {
              if (isNotOnWhatsapp(sendErr)) {
                outcome = 'no_wa';
              } else {
                // 5xx, instancia caída, sin red, timeout…: pasajero, se reintenta
                const msg = !(sendErr instanceof Error) ? String(sendErr)
                  : sendErr.name === 'TimeoutError' ? 'Evolution no respondió a tiempo' : sendErr.message;
                reason = `error al enviar (${msg.slice(0, 160)})`;
              }
            }
          }

          if (outcome === 'retry') {
            const count = (retry?.step_id === step.id ? retry.count ?? 0 : 0) + 1;
            if (count > WA_MAX_RETRIES) {
              stepData[step.id] = { sent: false, error: reason };
              delete stepData['__wa_retry__'];
              console.warn(`[automation-engine] run ${runId} ${step.id}: sin enviar tras ${WA_MAX_RETRIES} reintentos (${reason})`);
              await pool.query(
                `UPDATE automation_runs SET status = 'failed', current_step = $1, step_data = $2, updated_at = NOW() WHERE id = $3`,
                [i, withCursor(stepData, steps, i), runId],
              );
              await notifySendFailure(orgId, runId, run.automation_id, contact, phone, reason);
              return;
            }
            // Mismo paso dentro de 5 min (resumeTimedRuns lo retoma)
            delete stepData[step.id];
            stepData['__wa_retry__'] = { step_id: step.id, count, last_error: reason };
            await pool.query(
              `UPDATE automation_runs
               SET status = 'waiting_timed', current_step = $1, step_data = $2,
                   resume_at = NOW() + make_interval(mins => $3), updated_at = NOW()
               WHERE id = $4`,
              [i, withCursor(stepData, steps, i), WA_RETRY_MINUTES, runId],
            );
            return;
          }

          if (outcome === 'no_wa') {
            // El número no tiene WhatsApp: se sigue con la automatización sin reintentar
            console.warn(`[automation-engine] ${step.id}: número ${phone} sin WA, continuando`);
            stepData[step.id] = { sent: false, reason: 'sin_whatsapp' };
          } else {
            stepData[step.id] = media ? { sent: true, media_id: media.id } : { sent: true };
            await logOutboundWa(orgId, phone, message, media);
          }
          if (retry?.step_id === step.id) delete stepData['__wa_retry__'];
        }
        currentStep = i + 1;
        await persistRunProgress(runId, steps, currentStep, stepData);

      } else if (step.type === 'wait_for_reply') {
        // Avanzar current_step al siguiente para que al retomar empiece después de este
        currentStep = i + 1;
        withCursor(stepData, steps, currentStep);
        const phone = normalizeContactPhone(contact, run);
        await pool.query(
          `UPDATE automation_runs
           SET status = 'waiting', current_step = $1, step_data = $2,
               contact_phone = $3, waiting_since = NOW(), updated_at = NOW()
           WHERE id = $4`,
          [currentStep, JSON.stringify(stepData), phone ?? run.contact_phone, runId],
        );
        return; // parar ejecución hasta que llegue una respuesta

      } else if (step.type === 'ig_reply_comment') {
        // Responde al comentario de IG con uno de los mensajes del array (rotación circular)
        const commentId = (stepData['__ig_comment__']?.commentId as string | undefined) ?? '';
        const accessToken = (stepData['__ig_comment__']?.accessToken as string | undefined) ?? '';
        const messages: string[] = (step.messages as string[] | undefined) ?? [];
        // Aleatorio: cada comentario abre una ejecución nueva, así que un contador por run
        // siempre elegía el primer mensaje (respuestas idénticas = patrón de spam para IG).
        const message = messages.length ? messages[Math.floor(Math.random() * messages.length)] : (step.message as string ?? '');
        if (commentId && accessToken && message) {
          const interpolated = interpolate(message, contact, stepData);
          const reply = await replyToIgComment(commentId, accessToken, interpolated);
          const ig = stepData['__ig_comment__'] ?? {};
          await logIgInbox(orgId, ig, contact, `💬 Comentó en tu publicación: "${ig.text ?? ''}"`, `igc_${commentId}`, 'inbound');
          if (reply.id) await logIgInbox(orgId, ig, contact, `💬 Respuesta pública: ${interpolated}`, `igr_${reply.id}`, 'outbound');
        }
        stepData[step.id] = { replied: true };
        currentStep = i + 1;
        await persistRunProgress(runId, steps, currentStep, stepData);

      } else if (step.type === 'ig_send_dm') {
        // Envía un DM al usuario que comentó
        // El primer DM a quien comentó va como private reply (recipient.comment_id): un DM por
        // IGSID solo se permite si la persona escribió en las últimas 24h.
        const ig = stepData['__ig_comment__'] ?? {};
        const commentId = (ig.commentId as string | undefined) ?? '';
        const senderId = (ig.senderId as string | undefined) ?? '';
        const igUserId = (ig.igUserId as string | undefined) ?? '';
        const accessToken = (ig.accessToken as string | undefined) ?? '';
        const privateReplyUsed = Boolean(stepData['__ig_private_reply__']);
        const message = interpolate((step.message as string) ?? '', contact, stepData);
        let result: { message_id?: string; error?: unknown } = {};
        if (igUserId && accessToken && message) {
          if (commentId && !privateReplyUsed) {
            result = await sendIgPrivateReply(igUserId, accessToken, commentId, message);
            stepData['__ig_private_reply__'] = { used: true };
          } else if (senderId) {
            result = await sendIgDm(igUserId, accessToken, senderId, message);
          }
        }
        if (result.message_id) await logIgInbox(orgId, ig, contact, message, result.message_id, 'outbound');
        stepData[step.id] = { sent: Boolean(result.message_id), ...(result.error ? { error: result.error } : {}) };
        currentStep = i + 1;
        await persistRunProgress(runId, steps, currentStep, stepData);

      } else if (step.type === 'wait_before_appointment') {
        const minutesBefore = (step.minutes_before as number) ?? 120;
        const apptData = stepData['__appointment__'] as { start_at?: string } | undefined;

        if (!apptData?.start_at) {
          // Sin datos de cita, saltar este paso
          currentStep = i + 1;
          await persistRunProgress(runId, steps, currentStep, stepData);
          continue;
        }

        const resumeAt = new Date(new Date(apptData.start_at).getTime() - minutesBefore * 60_000);

        if (new Date(apptData.start_at) <= new Date()) {
          // La cita ya empezó: saltar la espera y el recordatorio que la sigue
          currentStep = i + 2;
          i++;
          await persistRunProgress(runId, steps, currentStep, stepData);
          continue;
        }

        if (resumeAt <= new Date()) {
          // El tiempo ya pasó, continuar de inmediato
          currentStep = i + 1;
          await persistRunProgress(runId, steps, currentStep, stepData);
          continue;
        }

        currentStep = i + 1;
        // Al reanudar se revisa la cita: si se canceló no sale el recordatorio; si se reagendó, se reprograma
        stepData['__appt_wait__'] = { appointment_id: (apptData as { appointment_id?: string }).appointment_id ?? null, minutes_before: minutesBefore, resume_step: currentStep };
        await pool.query(
          `UPDATE automation_runs
           SET status = 'waiting_timed', current_step = $1, step_data = $2,
               resume_at = $3, updated_at = NOW()
           WHERE id = $4`,
          [currentStep, withCursor(stepData, steps, currentStep), resumeAt.toISOString(), runId],
        );
        return; // parar hasta que el scheduler lo reanude
      }

    } catch (err) {
      console.error(`[automation-engine] Error en step ${step.id} (${step.type}):`, err);
      await pool.query(
        `UPDATE automation_runs SET status = 'failed', updated_at = NOW() WHERE id = $1`,
        [runId],
      );
      return;
    }
  }

  // Todos los pasos completados
  await pool.query(
    `UPDATE automation_runs
     SET status = 'completed', current_step = $1, step_data = $2,
         completed_at = NOW(), updated_at = NOW()
     WHERE id = $3`,
    [currentStep, withCursor(stepData, steps, currentStep), runId],
  );
}

// ── Helpers internos ─────────────────────────────────────────────────────────

async function persistRunProgress(
  runId: string,
  steps: StepDef[],
  currentStep: number,
  stepData: StepData,
): Promise<void> {
  await pool.query(
    `UPDATE automation_runs SET current_step = $1, step_data = $2, updated_at = NOW() WHERE id = $3`,
    [currentStep, withCursor(stepData, steps, currentStep), runId],
  );
}

// Registra en la conversación del chat (si existe) el mensaje que envió la automatización
async function logOutboundWa(orgId: string, phone: string, message: string, media?: StepMedia | null): Promise<void> {
  const chatJid = `${phone}@s.whatsapp.net`;
  const convRes = await pool.query<{ id: string }>(
    `SELECT id FROM conversations WHERE organization_id = $1 AND wa_chat_id = $2 LIMIT 1`,
    [orgId, chatJid],
  );
  if (!convRes.rows[0]) return;
  const convId = convRes.rows[0].id;
  const msgType = media?.type ?? 'text';
  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO conv_messages (conversation_id, organization_id, direction, msg_type, body, status)
     VALUES ($1, $2, 'outbound', $3, $4, 'sent')
     RETURNING id`,
    [convId, orgId, msgType, message],
  );
  if (inserted.rows[0] && media) {
    await pool.query(`UPDATE conv_messages SET media_url = $1, media_mime = $2 WHERE id = $3`, [media.url, media.mime, inserted.rows[0].id]);
  }
  if (!inserted.rows[0]) return;
  await pool.query(
    `UPDATE conversations SET last_message_at = NOW(), last_message_preview = $1, updated_at = NOW() WHERE id = $2`,
    [(message || (media?.type === 'video' ? '🎥 Video' : media ? '📷 Imagen' : '')).slice(0, 100), convId],
  );
  broadcast(orgId, 'message:new', {
    conversationId: convId,
    message: {
      id: inserted.rows[0].id, conversation_id: convId, wa_message_id: null,
      direction: 'outbound', msg_type: msgType, body: message,
      media_url: media?.url ?? null, media_mime: media?.mime ?? null, sender_name: null,
      status: 'sent', created_at: new Date().toISOString(),
    },
  });
}

// Adjunto de un paso send_whatsapp: `media_id` de automation_media de la MISMA org. Si no existe (borrado,
// de otra org, id inválido) se envía solo el texto y queda un aviso en el log.
type StepMedia = { id: string; type: 'video' | 'image'; url: string; mime: string; file_name: string };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveStepMedia(orgId: string, step: StepDef, runId: string): Promise<StepMedia | null> {
  const mediaId = step.media_id;
  if (!mediaId) return null;
  const row = UUID_RE.test(mediaId)
    ? (await pool.query<{ id: string; token: string; mime: string; file_name: string }>(
        `SELECT id, token, mime, file_name FROM automation_media WHERE id = $1 AND organization_id = $2`,
        [mediaId, orgId],
      )).rows[0]
    : undefined;
  if (!row) {
    console.warn(`[automation-engine] run ${runId} ${step.id}: el adjunto ${mediaId} no existe en la organización; se envía solo el texto`);
    return null;
  }
  const type = step.media_type === 'video' || step.media_type === 'image' ? step.media_type
    : row.mime.startsWith('video/') ? 'video' : 'image';
  return { id: row.id, type, url: mediaPublicUrl(row.token), mime: row.mime, file_name: row.file_name };
}

function normalizeContactPhone(
  contact: Record<string, unknown>,
  run: { contact_phone: string | null },
): string | null {
  const raw = (contact.phone as string) ?? run.contact_phone ?? null;
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  // Números de EE.UU. de 10 dígitos: añadir prefijo de país 1
  if (digits.length === 10 && AREA_CODE_MAP[digits.slice(0, 3)]) {
    return '1' + digits;
  }
  return digits;
}

// ── Tipos internos ───────────────────────────────────────────────────────────

interface StepDef {
  id: string;
  type: string;
  label?: string;
  // detect_us_state — sin campos extra
  // create_opportunity
  title?: string;
  source?: string;
  pipeline_id?: string;
  stage_id?: string;
  // send_notification
  notification_title?: string;
  notification_body?: string;
  // send_whatsapp
  message?: string;
  media_id?: string | null;          // adjunto (automation_media) enviado con el mensaje como caption
  media_type?: 'video' | 'image';    // opcional: se deduce del mime
  // wait_for_reply — sin campos extra
  to_phone?: string;
  // wait_before_appointment
  minutes_before?: number;
  // wait_minutes
  minutes?: number;
  // ig_reply_comment — rotación circular de respuestas
  messages?: string[];
}

// ── Iniciar automatización ───────────────────────────────────────────────────

async function startAutomation(
  orgId: string,
  ruleId: string,
  contactId: string,
  extraStepData?: Record<string, Record<string, unknown>>,
): Promise<void> {
  const contactRes = await pool.query(
    `SELECT * FROM contacts WHERE id = $1 AND organization_id = $2`,
    [contactId, orgId],
  );
  const contact = contactRes.rows[0];
  if (!contact) return;

  const phone = contact.phone ? String(contact.phone).replace(/\D/g, '') : null;
  const initialStepData = extraStepData ? JSON.stringify(extraStepData) : '{}';

  const runRes = await pool.query<{ id: string }>(
    `INSERT INTO automation_runs
       (organization_id, automation_id, contact_id, contact_phone, status, current_step, step_data)
     VALUES ($1, $2, $3, $4, 'running', 0,
       -- cursor al primer paso de la regla tal como está ahora (se reanuda por id, no por índice)
       $5::jsonb || jsonb_build_object('__cursor__', jsonb_build_object(
         'next_step_id', (SELECT config->'steps'->0->>'id' FROM automation_rules WHERE id = $2),
         'done', COALESCE((SELECT jsonb_array_length(config->'steps') = 0 FROM automation_rules WHERE id = $2), true))))
     RETURNING id`,
    [orgId, ruleId, contactId, phone, initialStepData],
  );
  const runId = runRes.rows[0].id;

  pool.query(
    `UPDATE automation_rules SET run_count = run_count + 1, last_run_at = NOW() WHERE id = $1`,
    [ruleId],
  ).catch(console.error);

  executeRun(runId).catch(e => console.error('[automation-engine] executeRun error:', e));
}

// ── Trigger por tag añadido ──────────────────────────────────────────────────

export async function fireTagTrigger(
  orgId: string,
  contactId: string,
  newlyAddedTags: string[],
): Promise<void> {
  try {
    const rulesRes = await pool.query<{ id: string; config: { trigger: { tag: string } } }>(
      `SELECT id, config FROM automation_rules
       WHERE organization_id = $1 AND trigger_type = 'tag_added' AND enabled = true`,
      [orgId],
    );
    for (const rule of rulesRes.rows) {
      const triggerTag = rule.config?.trigger?.tag;
      if (triggerTag && newlyAddedTags.includes(triggerTag)) {
        await startAutomation(orgId, rule.id, contactId);
      }
    }
  } catch (e) {
    console.error('[automation-engine] fireTagTrigger error:', e);
  }
}

// ── Disparador: nuevo mensaje de WhatsApp ───────────────────────────────────

export async function fireWaNewMessageTrigger(
  orgId: string,
  contactId: string | null,
): Promise<void> {
  if (!contactId) return;
  try {
    const rulesRes = await pool.query<{ id: string }>(
      `SELECT id FROM automation_rules
       WHERE organization_id = $1 AND trigger_type = 'whatsapp_new_message' AND enabled = true`,
      [orgId],
    );
    for (const rule of rulesRes.rows) {
      await startAutomation(orgId, rule.id, contactId);
    }
  } catch (e) {
    console.error('[automation-engine] fireWaNewMessageTrigger error:', e);
  }
}

// ── Disparador: contacto creado ──────────────────────────────────────────────
// Se llama justo después de insertar un contacto nuevo (alta manual, CSV, WhatsApp,
// reserva pública, Instagram, oportunidad, Lead Ads). Nunca lanza.

export async function fireContactCreatedTrigger(orgId: string, contactId: string | null | undefined): Promise<void> {
  if (!contactId) return;
  try {
    const rulesRes = await pool.query<{ id: string }>(
      `SELECT id FROM automation_rules
       WHERE organization_id = $1 AND trigger_type = 'contact_created' AND enabled = true`,
      [orgId],
    );
    for (const rule of rulesRes.rows) {
      await startAutomation(orgId, rule.id, contactId);
    }
  } catch (e) {
    console.error('[automation-engine] fireContactCreatedTrigger error:', e);
  }
}

// ── Disparador: cita agendada ────────────────────────────────────────────────

export interface AppointmentTriggerData {
  appointment_id?: string; // para revisar la cita antes de cada recordatorio
  start_at: string;       // ISO UTC
  start_date: string;     // "lunes, 18 de septiembre de 2026"
  start_time: string;     // "10:00"
  meeting_url: string;    // enlace Google Meet / Zoom / ubicación
  reschedule_link: string;
}

export async function fireAppointmentBookedTrigger(
  orgId: string,
  contactId: string,
  appointmentData: AppointmentTriggerData,
  source: 'booking' | 'manual' = 'booking',
): Promise<void> {
  try {
    // Las citas creadas a mano solo disparan las reglas que lo activan (config.include_manual): así una
    // regla existente que manda WhatsApp al contacto no cambia de comportamiento sin que nadie lo decida.
    const rulesRes = await pool.query<{ id: string }>(
      `SELECT id FROM automation_rules
       WHERE organization_id = $1 AND trigger_type = 'appointment_booked' AND enabled = true
         AND ($2 = 'booking' OR (config->>'include_manual')::boolean IS TRUE)`,
      [orgId, source],
    );
    const extraStepData: Record<string, Record<string, unknown>> = {
      // reschedule_url: mismo enlace que reschedule_link (nombre que usa también "Cita: no asistió")
      __appointment__: { ...appointmentData, reschedule_url: appointmentData.reschedule_link },
    };
    for (const rule of rulesRes.rows) {
      await startAutomation(orgId, rule.id, contactId, extraStepData);
    }
  } catch (e) {
    console.error('[automation-engine] fireAppointmentBookedTrigger error:', e);
  }
}

// ── Disparador: cita marcada como "No asistió" ───────────────────────────────
// Se llama tras guardar appointments.status = 'no_show'. Solo citas con contacto y UNA sola vez por cita
// (marca appointments.no_show_notified_at, tomada de forma atómica): si la corrigen y la vuelven a marcar,
// no se repite. Datos para las plantillas: los mismos que "cita agendada" + {{appointment.reschedule_url}}.
// Nunca lanza.

// Enlace para reagendar: la página de gestión de la cita (/book/<slug>/manage/<token>) si tiene calendario
// y token; si no, la página de reservas del calendario de la cita o, sin calendario, la del calendario
// por defecto de la org (el primero activo, preferiblemente con reservas públicas).
async function appointmentRescheduleUrl(orgId: string, calendarSlug: string | null, token: string | null): Promise<string> {
  const base = env.publicUrl.replace(/\/$/, '');
  if (calendarSlug && token) return `${base}/book/${calendarSlug}/manage/${token}`;
  if (calendarSlug) return `${base}/book/${calendarSlug}`;
  const def = (await pool.query<{ slug: string }>(
    `SELECT slug FROM calendars WHERE organization_id = $1 AND is_active = true
     ORDER BY booking_enabled DESC, created_at ASC LIMIT 1`,
    [orgId],
  )).rows[0];
  return def ? `${base}/book/${def.slug}` : '';
}

// La cita dejó de estar en "No asistió" (corrección o el lead reagendó): se cancelan los mensajes
// pendientes de ese flujo y se quita la marca, para que una nueva falta sí vuelva a avisar.
export async function clearAppointmentNoShow(orgId: string, appointmentId: string): Promise<void> {
  await pool.query(
    `UPDATE automation_runs SET status = 'cancelled', updated_at = NOW()
     WHERE organization_id = $1 AND status IN ('waiting_timed', 'waiting', 'running')
       AND step_data->'__no_show__'->>'appointment_id' = $2`,
    [orgId, appointmentId],
  );
  await pool.query(
    `UPDATE appointments SET no_show_notified_at = NULL WHERE id = $1 AND organization_id = $2 AND status <> 'no_show'`,
    [appointmentId, orgId],
  );
}

export async function fireAppointmentNoShowTrigger(orgId: string, appointmentId: string): Promise<void> {
  try {
    const rulesRes = await pool.query<{ id: string }>(
      `SELECT id FROM automation_rules
       WHERE organization_id = $1 AND trigger_type = 'appointment_no_show' AND enabled = true`,
      [orgId],
    );
    if (!rulesRes.rows.length) return;   // sin reglas no se marca: una regla creada después aún puede dispararse

    // Marca atómica: dos PATCH simultáneos no disparan dos veces
    const appt = (await pool.query<{
      contact_id: string; start_at: Date; timezone: string; meeting_url: string | null; location: string | null;
      cancel_token: string | null; slug: string | null; cal_location: string | null;
    }>(
      `UPDATE appointments a SET no_show_notified_at = NOW()
       FROM appointments x LEFT JOIN calendars c ON c.id = x.calendar_id
       WHERE a.id = x.id AND a.id = $1 AND a.organization_id = $2
         AND a.status = 'no_show' AND a.contact_id IS NOT NULL AND a.no_show_notified_at IS NULL
       RETURNING a.contact_id, a.start_at, COALESCE(c.timezone, a.timezone) AS timezone, a.meeting_url, a.location,
                 a.cancel_token, c.slug, c.location AS cal_location`,
      [appointmentId, orgId],
    )).rows[0];
    if (!appt) return;

    const rescheduleUrl = await appointmentRescheduleUrl(orgId, appt.slug, appt.cancel_token);
    const extraStepData: Record<string, Record<string, unknown>> = {
      __appointment__: {
        appointment_id:  appointmentId,
        ...appointmentTimeFields(new Date(appt.start_at), appt.timezone),
        meeting_url:     appt.meeting_url ?? appt.location ?? appt.cal_location ?? '',
        reschedule_link: rescheduleUrl,
        reschedule_url:  rescheduleUrl,
      },
      __no_show__: { appointment_id: appointmentId },
    };
    for (const rule of rulesRes.rows) {
      await startAutomation(orgId, rule.id, appt.contact_id, extraStepData);
    }
  } catch (e) {
    console.error('[automation-engine] fireAppointmentNoShowTrigger error:', e);
  }
}

// ── Scheduler: reanudar esperas por tiempo ───────────────────────────────────

// `onlyOrgId` limita a una organización (lo usan los tests: la BD local es compartida).
export async function resumeTimedRuns(onlyOrgId?: string): Promise<void> {
  try {
    const runsRes = await pool.query<{ id: string }>(
      `UPDATE automation_runs
       SET status = 'running', updated_at = NOW()
       WHERE status = 'waiting_timed' AND resume_at <= NOW()
         AND ($1::uuid IS NULL OR organization_id = $1)
       RETURNING id`,
      [onlyOrgId ?? null],
    );
    for (const row of runsRes.rows) {
      executeRun(row.id).catch(e => console.error('[automation-engine] timed resume error:', e));
    }
  } catch (e) {
    console.error('[automation-engine] resumeTimedRuns error:', e);
  }
}

// ── Recuperar runs atascados ─────────────────────────────────────────────────
// Un run en 'running' solo dura lo que tarda un paso (segundos; cada paso actualiza updated_at). Si
// lleva más de 10 min sin moverse, el proceso murió a mitad (reinicio, corte de luz): se pasa a
// 'waiting_timed' para que resumeTimedRuns lo retome por el paso guardado (ver garantías en executeRun).
// Los que llevan más de 24 h atascados (p. ej. de antes de este arreglo) no se reanudan: un mensaje
// automático con días de retraso confunde al lead; se marcan 'failed' con una nota.
export async function recoverStuckRuns(onlyOrgId?: string): Promise<number> {
  await pool.query(
    `UPDATE automation_runs
     SET status = 'failed', updated_at = NOW(),
         step_data = step_data || '{"__note__":{"message":"Quedó atascado más de 24 h (reinicio del servidor): no se reanudó."}}'::jsonb
     WHERE status = 'running' AND updated_at < NOW() - INTERVAL '24 hours'
       AND ($1::uuid IS NULL OR organization_id = $1)`,
    [onlyOrgId ?? null],
  );
  const { rowCount } = await pool.query(
    `UPDATE automation_runs SET status = 'waiting_timed', resume_at = NOW(), updated_at = NOW()
     WHERE status = 'running' AND updated_at < NOW() - INTERVAL '10 minutes'
       AND ($1::uuid IS NULL OR organization_id = $1)`,
    [onlyOrgId ?? null],
  );
  if (rowCount) console.warn(`[automation-engine] ${rowCount} run(s) atascados en 'running' se reanudarán`);
  return rowCount ?? 0;
}

// ── Manejar mensaje WA entrante ──────────────────────────────────────────────

export async function handleIncomingWaMessage(
  orgId: string,
  waChatId: string,
  messageText: string,
): Promise<void> {
  try {
    // Extraer el número de teléfono del chatId (ej: "16893183087@s.whatsapp.net")
    const rawPhone = waChatId.split('@')[0];
    if (!rawPhone) return;

    // Misma comparación tolerante que los contactos (últimos 10 dígitos, ver phone.ts)
    const phoneKey = phoneMatchKey(rawPhone);
    if (!phoneKey) return;

    // Tomar de forma atómica el run en estado 'waiting' cuyo contact_phone coincida: dos mensajes
    // simultáneos del mismo lead no pueden reanudar el mismo run (SKIP LOCKED + condición de estado).
    const runRes = await pool.query<{ id: string }>(
      `UPDATE automation_runs SET status = 'running', waiting_since = NULL, updated_at = NOW()
       WHERE status = 'waiting' AND id = (
         SELECT id FROM automation_runs
         WHERE organization_id = $1
           AND status = 'waiting'
           AND right(crm_phone_digits(contact_phone), 10) = $2
         ORDER BY waiting_since ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING id`,
      [orgId, phoneKey],
    );
    const runRow = runRes.rows[0];
    if (!runRow) return;

    executeRun(runRow.id).catch(e => console.error('[automation-engine] resumeRun error:', e));
  } catch (e) {
    console.error('[automation-engine] handleIncomingWaMessage error:', e);
  }
}

// ── Trigger: comentario recibido en Instagram ────────────────────────────────

export interface IgCommentTriggerData {
  commentId: string;
  senderId: string;
  senderName: string;
  text: string;
  mediaId: string;
  caption?: string;            // caption del post: de ahí sale su palabra clave ("Comenta CAMBIO")
  accessToken: string;
  igUserId: string;
  connectionId?: string;       // social_connections.id, para registrar la conversación
}

// Registra en la bandeja (conversación de IG del contacto) lo que pasa en el flujo de comentarios.
async function logIgInbox(
  orgId: string,
  ig: Record<string, unknown>,
  contact: Record<string, unknown>,
  text: string,
  mid: string,
  direction: 'inbound' | 'outbound',
) {
  const peerId = ig.senderId as string | undefined;
  const connectionId = ig.connectionId as string | undefined;
  if (!peerId || !connectionId) return;
  const name = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || (ig.senderName as string) || peerId;
  await upsertSocialConversation({
    orgId, socialAccountId: connectionId, channel: 'instagram_dm', chatId: `ig_${peerId}`,
    displayName: name, text, mid, direction, contactId: (contact.id as string) ?? null,
  });
}

export async function fireIgCommentTrigger(
  orgId: string,
  commentData: IgCommentTriggerData,
): Promise<void> {
  try {
    const allRules = await pool.query<{ id: string; config: { intent_filter?: boolean; exclude_usernames?: string[] } | null }>(
      `SELECT id, config FROM automation_rules
       WHERE organization_id = $1 AND trigger_type = 'ig_comment_received' AND enabled = true`,
      [orgId],
    );
    if (!allRules.rows.length) {
      console.log(`[automation-engine] comentario IG ${commentData.commentId} ignorado: org ${orgId} sin regla ig_comment_received activa`);
      return;
    }

    // Filtros: nunca las cuentas del propio equipo, y solo comentarios que piden información
    const author = commentData.senderName.toLowerCase();
    const team = (await pool.query<{ u: string }>(
      `SELECT lower(username) AS u FROM social_connections WHERE organization_id = $1 AND username IS NOT NULL`, [orgId],
    )).rows.map(r => r.u);
    const keywords = captionKeywords(commentData.caption ?? '');
    const asksInfo = wantsInfo(commentData.text) || matchesKeyword(commentData.text, keywords);
    const rulesRes = {
      rows: allRules.rows.filter(r => {
        const excluded = (r.config?.exclude_usernames ?? []).map(u => u.toLowerCase().replace(/^@/, ''));
        if (team.includes(author) || excluded.includes(author)) return false;
        return r.config?.intent_filter === false || asksInfo;
      }),
    };
    if (!rulesRes.rows.length) {
      console.log(`[automation-engine] comentario IG ${commentData.commentId} de @${author} ignorado: no pide información o es del equipo (texto: "${commentData.text.slice(0, 60)}", palabras clave del post: ${keywords.join(', ') || 'ninguna'})`);
      return;
    }

    // Crear o encontrar contacto por senderId de IG
    const existingContact = await pool.query<{ id: string }>(
      `SELECT id FROM contacts WHERE organization_id = $1 AND ig_sender_id = $2 LIMIT 1`,
      [orgId, commentData.senderId],
    );

    let contactId: string;
    if (existingContact.rows[0]) {
      contactId = existingContact.rows[0].id;
      // Una persona que comenta en varios posts recibe el flujo (DM + lead) una sola vez por semana
      const recent = await pool.query(
        `SELECT 1 FROM automation_runs WHERE contact_id = $1 AND automation_id = ANY($2::uuid[])
           AND created_at > NOW() - INTERVAL '7 days' LIMIT 1`,
        [contactId, rulesRes.rows.map(r => r.id)],
      );
      if (recent.rowCount) {
        console.log(`[automation-engine] comentario IG ${commentData.commentId} ignorado: el contacto ${contactId} ya recibió el flujo esta semana`);
        return;
      }
    } else {
      const parts = commentData.senderName.trim().split(/\s+/);
      const created = await pool.query<{ id: string }>(
        `INSERT INTO contacts (organization_id, first_name, last_name, tags, ig_sender_id)
         VALUES ($1, $2, $3, ARRAY['instagram']::text[], $4)
         RETURNING id`,
        [orgId, parts[0] || commentData.senderId, parts.slice(1).join(' ') || null, commentData.senderId || null],
      );
      contactId = created.rows[0].id;
      fireContactCreatedTrigger(orgId, contactId).catch(console.error);
    }

    const extraStepData: Record<string, Record<string, unknown>> = {
      __ig_comment__: { ...commentData },
    };
    for (const rule of rulesRes.rows) {
      await startAutomation(orgId, rule.id, contactId, extraStepData);
    }
  } catch (e) {
    console.error('[automation-engine] fireIgCommentTrigger error:', e);
  }
}
