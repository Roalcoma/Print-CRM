// Motor de automatizaciones del CRM.
// Soporta triggers por tag, ejecución de pasos secuenciales,
// espera de respuestas WA y reanudación tras respuesta entrante.

import { pool } from '../db.ts';
import { broadcast } from './ws-manager.ts';
import { EvolutionClient } from './evolution.ts';
import { sendIgDm, replyToIgComment } from './instagram.ts';

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
  '646': 'New York', '680': 'New York', '716': 'New York', '718': 'New York', '726': 'New York',
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
 * y devuelve el nombre del estado. Si no se reconoce, devuelve 'Unknown'.
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
    return 'Unknown';
  }
  return AREA_CODE_MAP[areaCode] ?? 'Unknown';
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
     ORDER BY created_at LIMIT 1`,
    [orgId],
  );
  if (!res.rows[0]) return null;
  const { evo_url, evo_api_key, instance_name } = res.rows[0];
  return new EvolutionClient({ url: evo_url, apiKey: evo_api_key, instanceName: instance_name });
}

// ── Ejecución de un run ─────────────────────────────────────────────────────

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
    step_data: Record<string, Record<string, unknown>>;
  }>(
    `SELECT * FROM automation_runs WHERE id = $1`,
    [runId],
  );
  const run = runRes.rows[0];
  if (!run || run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled') return;

  // Cargar la automatización
  const autoRes = await pool.query<{ config: { steps: StepDef[] } }>(
    `SELECT config FROM automation_rules WHERE id = $1`,
    [run.automation_id],
  );
  const autoRule = autoRes.rows[0];
  if (!autoRule) return;

  const steps: StepDef[] = autoRule.config.steps ?? [];
  const orgId = run.organization_id;

  // Cargar contacto
  let contact: Record<string, unknown> = {};
  if (run.contact_id) {
    const cRes = await pool.query(
      `SELECT * FROM contacts WHERE id = $1`,
      [run.contact_id],
    );
    contact = cRes.rows[0] ?? {};
  }

  const stepData: Record<string, Record<string, unknown>> = run.step_data ?? {};
  let currentStep = run.current_step;

  for (let i = currentStep; i < steps.length; i++) {
    const step = steps[i];

    try {
      if (step.type === 'detect_us_state') {
        const phone = (contact.phone as string) ?? run.contact_phone ?? '';
        const state = detectUsState(phone);
        stepData[step.id] = { state };
        currentStep = i + 1;
        await persistRunProgress(runId, currentStep, stepData);

      } else if (step.type === 'create_opportunity') {
        // Usar pipeline/stage del config si están definidos, si no tomar el primero
        let pipelineId = step.pipeline_id as string | undefined;
        let stageId    = step.stage_id    as string | undefined;

        if (!pipelineId) {
          const pipeRes = await pool.query<{ id: string }>(
            `SELECT id FROM pipelines WHERE organization_id = $1 ORDER BY created_at LIMIT 1`,
            [orgId],
          );
          if (!pipeRes.rows[0]) { currentStep = i + 1; await persistRunProgress(runId, currentStep, stepData); continue; }
          pipelineId = pipeRes.rows[0].id;
        }

        if (!stageId) {
          const stageRes = await pool.query<{ id: string }>(
            `SELECT id FROM pipeline_stages WHERE pipeline_id = $1 ORDER BY position LIMIT 1`,
            [pipelineId],
          );
          if (!stageRes.rows[0]) { currentStep = i + 1; await persistRunProgress(runId, currentStep, stepData); continue; }
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
        currentStep = i + 1;
        await persistRunProgress(runId, currentStep, stepData);

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
        await persistRunProgress(runId, currentStep, stepData);

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
          [currentStep, JSON.stringify(stepData), resumeAt.toISOString(), runId],
        );
        return;

      } else if (step.type === 'send_whatsapp') {
        // Si el step define `to_phone` se usa ese número fijo; de lo contrario el del contacto
        const phone = (step.to_phone as string | undefined)
          ? (step.to_phone as string).replace(/\D/g, '')
          : normalizeContactPhone(contact, run);
        if (phone) {
          const client = await getWaClient(orgId);
          if (client) {
            const message = interpolate(step.message ?? '', contact, stepData);
            let messageSent = false;
            try {
              await client.sendText(phone, message);
              messageSent = true;
            } catch (sendErr: unknown) {
              // Si el número no está registrado en WA, continuar sin fallar la automatización
              const msg = sendErr instanceof Error ? sendErr.message : String(sendErr);
              if (msg.includes('exists":false') || msg.includes('400')) {
                console.warn(`[automation-engine] ${step.id}: número ${phone} sin WA, continuando`);
              } else {
                throw sendErr;
              }
            }

            // Insertar mensaje outbound en el chat solo si el envío fue exitoso
            if (messageSent) {
              const chatJid = `${phone}@s.whatsapp.net`;
              const convRes = await pool.query<{ id: string }>(
                `SELECT id FROM conversations WHERE organization_id = $1 AND wa_chat_id = $2 LIMIT 1`,
                [orgId, chatJid],
              );
              if (convRes.rows[0]) {
                const convId = convRes.rows[0].id;
                const inserted = await pool.query<{ id: string }>(
                  `INSERT INTO conv_messages (conversation_id, organization_id, direction, msg_type, body, status)
                   VALUES ($1, $2, 'outbound', 'text', $3, 'sent')
                   RETURNING id`,
                  [convId, orgId, message],
                );
                if (inserted.rows[0]) {
                  await pool.query(
                    `UPDATE conversations SET last_message_at = NOW(), last_message_preview = $1, updated_at = NOW() WHERE id = $2`,
                    [message.slice(0, 100), convId],
                  );
                  broadcast(orgId, 'message:new', {
                    conversationId: convId,
                    message: {
                      id: inserted.rows[0].id, conversation_id: convId, wa_message_id: null,
                      direction: 'outbound', msg_type: 'text', body: message,
                      media_url: null, media_mime: null, sender_name: null,
                      status: 'sent', created_at: new Date().toISOString(),
                    },
                  });
                }
              }
            }
          }
        }
        stepData[step.id] = { sent: true };
        currentStep = i + 1;
        await persistRunProgress(runId, currentStep, stepData);

      } else if (step.type === 'wait_for_reply') {
        // Avanzar current_step al siguiente para que al retomar empiece después de este
        currentStep = i + 1;
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
        const runCount = Number(stepData['__ig_reply_count__']?.count ?? 0);
        const message = messages.length ? messages[runCount % messages.length] : (step.message as string ?? '');
        if (commentId && accessToken && message) {
          const interpolated = interpolate(message, contact, stepData);
          await replyToIgComment(commentId, accessToken, interpolated);
        }
        stepData['__ig_reply_count__'] = { count: runCount + 1 };
        stepData[step.id] = { replied: true };
        currentStep = i + 1;
        await persistRunProgress(runId, currentStep, stepData);

      } else if (step.type === 'ig_send_dm') {
        // Envía un DM al usuario que comentó
        const senderId = (stepData['__ig_comment__']?.senderId as string | undefined) ?? '';
        const igUserId = (stepData['__ig_comment__']?.igUserId as string | undefined) ?? '';
        const accessToken = (stepData['__ig_comment__']?.accessToken as string | undefined) ?? '';
        const message = interpolate((step.message as string) ?? '', contact, stepData);
        if (senderId && igUserId && accessToken && message) {
          await sendIgDm(igUserId, accessToken, senderId, message);
        }
        stepData[step.id] = { sent: true };
        currentStep = i + 1;
        await persistRunProgress(runId, currentStep, stepData);

      } else if (step.type === 'wait_before_appointment') {
        const minutesBefore = (step.minutes_before as number) ?? 120;
        const apptData = stepData['__appointment__'] as { start_at?: string } | undefined;

        if (!apptData?.start_at) {
          // Sin datos de cita, saltar este paso
          currentStep = i + 1;
          await persistRunProgress(runId, currentStep, stepData);
          continue;
        }

        const resumeAt = new Date(new Date(apptData.start_at).getTime() - minutesBefore * 60_000);

        if (resumeAt <= new Date()) {
          // El tiempo ya pasó, continuar de inmediato
          currentStep = i + 1;
          await persistRunProgress(runId, currentStep, stepData);
          continue;
        }

        currentStep = i + 1;
        await pool.query(
          `UPDATE automation_runs
           SET status = 'waiting_timed', current_step = $1, step_data = $2,
               resume_at = $3, updated_at = NOW()
           WHERE id = $4`,
          [currentStep, JSON.stringify(stepData), resumeAt.toISOString(), runId],
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
    [currentStep, JSON.stringify(stepData), runId],
  );
}

// ── Helpers internos ─────────────────────────────────────────────────────────

async function persistRunProgress(
  runId: string,
  currentStep: number,
  stepData: Record<string, Record<string, unknown>>,
): Promise<void> {
  await pool.query(
    `UPDATE automation_runs SET current_step = $1, step_data = $2, updated_at = NOW() WHERE id = $3`,
    [currentStep, JSON.stringify(stepData), runId],
  );
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
  // wait_for_reply — sin campos extra
  // wait_before_appointment
  minutes_before?: number;
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
     VALUES ($1, $2, $3, $4, 'running', 0, $5)
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

// ── Disparador: cita agendada ────────────────────────────────────────────────

export interface AppointmentTriggerData {
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
): Promise<void> {
  try {
    const rulesRes = await pool.query<{ id: string }>(
      `SELECT id FROM automation_rules
       WHERE organization_id = $1 AND trigger_type = 'appointment_booked' AND enabled = true`,
      [orgId],
    );
    const extraStepData: Record<string, Record<string, unknown>> = {
      __appointment__: { ...appointmentData },
    };
    for (const rule of rulesRes.rows) {
      await startAutomation(orgId, rule.id, contactId, extraStepData);
    }
  } catch (e) {
    console.error('[automation-engine] fireAppointmentBookedTrigger error:', e);
  }
}

// ── Scheduler: reanudar esperas por tiempo ───────────────────────────────────

export async function resumeTimedRuns(): Promise<void> {
  try {
    const runsRes = await pool.query<{ id: string }>(
      `UPDATE automation_runs
       SET status = 'running', updated_at = NOW()
       WHERE status = 'waiting_timed' AND resume_at <= NOW()
       RETURNING id`,
    );
    for (const row of runsRes.rows) {
      executeRun(row.id).catch(e => console.error('[automation-engine] timed resume error:', e));
    }
  } catch (e) {
    console.error('[automation-engine] resumeTimedRuns error:', e);
  }
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

    const normalizedPhone = rawPhone.replace(/\D/g, '');
    if (!normalizedPhone) return;

    // Buscar run en estado 'waiting' cuyo contact_phone coincida
    const runRes = await pool.query<{ id: string; organization_id: string }>(
      `SELECT id, organization_id FROM automation_runs
       WHERE organization_id = $1
         AND status = 'waiting'
         AND regexp_replace(contact_phone, '\\D', '', 'g') LIKE $2
       ORDER BY waiting_since ASC
       LIMIT 1`,
      [orgId, `%${normalizedPhone}%`],
    );
    const runRow = runRes.rows[0];
    if (!runRow) return;

    // Reanudar el run
    await pool.query(
      `UPDATE automation_runs SET status = 'running', waiting_since = NULL, updated_at = NOW() WHERE id = $1`,
      [runRow.id],
    );
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
  accessToken: string;
  igUserId: string;
}

export async function fireIgCommentTrigger(
  orgId: string,
  commentData: IgCommentTriggerData,
): Promise<void> {
  try {
    const rulesRes = await pool.query<{ id: string }>(
      `SELECT id FROM automation_rules
       WHERE organization_id = $1 AND trigger_type = 'ig_comment_received' AND enabled = true`,
      [orgId],
    );
    if (!rulesRes.rows.length) return;

    // Crear o encontrar contacto por senderId de IG
    const existingContact = await pool.query<{ id: string }>(
      `SELECT id FROM contacts WHERE organization_id = $1 AND ig_sender_id = $2 LIMIT 1`,
      [orgId, commentData.senderId],
    ).catch(() => ({ rows: [] as { id: string }[] }));

    let contactId: string;
    if (existingContact.rows[0]) {
      contactId = existingContact.rows[0].id;
    } else {
      const parts = commentData.senderName.trim().split(/\s+/);
      const created = await pool.query<{ id: string }>(
        `INSERT INTO contacts (organization_id, first_name, last_name, tags)
         VALUES ($1, $2, $3, ARRAY['instagram']::text[])
         RETURNING id`,
        [orgId, parts[0] || commentData.senderId, parts.slice(1).join(' ') || null],
      );
      contactId = created.rows[0].id;
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
