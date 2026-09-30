// Plantillas de cuenta: catálogo, vista previa (plan) y aplicación transaccional.
// Todo lo que se crea lleva el organization_id del cliente destino. Una plantilla se aplica
// una sola vez por organización (account_template_applications, UNIQUE org+plantilla).
import type pg from 'pg';
import { pool } from '../db.ts';
import { env } from '../env.ts';
import type { AccountTemplate, TemplateStep, TriggerType } from './base.ts';
import { reclutamientoSeguros } from './reclutamiento-seguros.ts';
import { clinicaEstetica } from './clinica-estetica.ts';
import { consultorioOdontologico } from './consultorio-odontologico.ts';
import { inmobiliaria } from './inmobiliaria.ts';
import { tiendaWhatsapp } from './tienda-whatsapp.ts';
import { academiaCursos } from './academia-cursos.ts';

export const TEMPLATES: AccountTemplate[] = [
  reclutamientoSeguros, clinicaEstetica, consultorioOdontologico, inmobiliaria, tiendaWhatsapp, academiaCursos,
];

export class TemplateError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

type Db = pg.Pool | pg.PoolClient;
const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

// Resumen para el listado (sin los mensajes completos).
export function templateSummary(t: AccountTemplate) {
  return {
    key: t.key, name: t.name, sector: t.sector, description: t.description, variables: t.variables,
    counts: { pipelines: t.pipelines.length, calendars: t.calendars.length, automations: t.automations.length },
  };
}

function slugify(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
}

// Sustituye {{clave}} de la plantilla en todos los textos (recursivo); deja intactas las
// variables del motor ({{contact.x}}, {{appointment.x}}, {{step.x.y}}).
function fill<T>(value: T, vars: Record<string, string>): T {
  if (typeof value === 'string') {
    return value.replace(/\{\{([a-z_]+)\}\}/g, (m, k: string) => {
      if (!(k in vars)) throw new TemplateError(500, `La plantilla usa una variable desconocida: ${m}`);
      return vars[k];
    }) as T;
  }
  if (Array.isArray(value)) return value.map(v => fill(v, vars)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fill(v, vars)])) as T;
  }
  return value;
}

// Primer slug libre a partir del base: base, base-2, base-3…
async function freeSlug(db: Db, base: string): Promise<string> {
  for (let n = 1; n < 50; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    const taken = await db.query('SELECT 1 FROM calendars WHERE slug = $1', [slug]);
    if (!taken.rowCount) return slug;
  }
  throw new TemplateError(409, 'No se encontró un enlace de reserva libre; cambia el nombre de la empresa');
}

// Resuelve la plantilla con las variables del formulario y el estado actual de la organización.
// Es lo que se muestra en la vista previa y exactamente lo que se crea al aplicar.
export async function buildPlan(db: Db, orgId: string, t: AccountTemplate, input: Record<string, string>) {
  const vars: Record<string, string> = {};
  const missing: string[] = [];
  for (const v of t.variables) {
    let val = (input[v.key] ?? v.default ?? '').trim();
    if (v.type === 'phone') val = val.replace(/\D/g, '');
    if (v.required && !val) missing.push(v.label);
    if (val && v.type === 'phone' && (val.length < 8 || val.length > 15)) throw new TemplateError(400, `${v.label}: número no válido (incluye el código de país)`);
    if (val && v.type === 'url' && !/^https?:\/\/\S+$/.test(val)) throw new TemplateError(400, `${v.label}: debe empezar por https://`);
    if (val && v.type === 'timezone' && !Intl.supportedValuesOf('timeZone').includes(val)) throw new TemplateError(400, `${v.label}: zona horaria no válida`);
    vars[v.key] = val;
  }
  if (missing.length) throw new TemplateError(400, `Faltan datos: ${missing.join(', ')}`);

  const warnings: string[] = [];
  const has = (k?: string) => !k || Boolean(vars[k]);

  // Calendarios: slug normalizado y único global; el primero define {{enlace_reserva}}.
  const calendars = [];
  for (const c of t.calendars) {
    const base = slugify(fill(c.slug, { ...vars, enlace_reserva: '' })) || 'reservas';
    const slug = await freeSlug(db, base);
    if (slug !== base) warnings.push(`El enlace /book/${base} ya lo usa otra cuenta; se usará /book/${slug}.`);
    calendars.push({ ...c, slug, url: `${env.publicUrl}/book/${slug}` });
  }
  vars.enlace_reserva = calendars[0]?.url ?? '';

  const plannedCalendars = calendars.map(c => {
    const open = new Map(c.availability.map(([d, s, e]) => [d, [s, e]]));
    if (c.location_type === 'google_meet') warnings.push(`"${fill(c.name, vars)}" usa Google Meet: conecta Google Calendar en la cuenta para que se genere el enlace de cada cita.`);
    return {
      name: fill(c.name, vars), slug: c.slug, url: c.url, timezone: vars.zona_horaria || 'America/Caracas',
      description: fill(c.description ?? null, vars), custom_message: fill(c.custom_message ?? null, vars),
      duration_minutes: c.duration_minutes, location_type: c.location_type, location: fill(c.location ?? null, vars),
      min_notice_hours: c.min_notice_hours ?? 2,
      availability: [0, 1, 2, 3, 4, 5, 6].map(d => ({
        day_of_week: d, day: DAYS[d], start_time: open.get(d)?.[0] ?? '09:00', end_time: open.get(d)?.[1] ?? '18:00', is_active: open.has(d),
      })),
    };
  });

  // Pipelines: aviso si ya hay uno con el mismo nombre (se crea igual).
  const existingNames = new Set((await db.query<{ name: string }>(
    'SELECT lower(name) AS name FROM pipelines WHERE organization_id = $1', [orgId])).rows.map(r => r.name));
  const pipelines = t.pipelines.map(p => {
    if (existingNames.has(p.name.toLowerCase())) warnings.push(`Ya existe un pipeline llamado "${p.name}"; se creará otro con el mismo nombre.`);
    return p;
  });

  // Automatizaciones: si ya hay una activa con el mismo disparador, la nueva se crea apagada
  // para no mandar dos bienvenidas o dos confirmaciones al mismo contacto.
  const active = (await db.query<{ trigger_type: TriggerType; tag: string | null }>(
    `SELECT trigger_type, config->'trigger'->>'tag' AS tag FROM automation_rules WHERE organization_id = $1 AND enabled`,
    [orgId])).rows;
  const automations = t.automations.filter(a => has(a.requires)).map(a => {
    let enabled = a.enabled ?? true;
    let note: string | null = a.trigger_type === 'ig_comment_received' ? 'Se crea desactivada: requiere conectar Instagram.' : null;
    const clash = active.some(r => r.trigger_type === a.trigger_type && (a.trigger_type !== 'tag_added' || r.tag === a.tag));
    if (enabled && clash && a.trigger_type !== 'ig_comment_received') {
      enabled = false;
      note = 'Se crea desactivada: la cuenta ya tiene otra automatización activa con el mismo disparador.';
      warnings.push(`"${a.name}" se creará desactivada porque ya hay otra automatización activa con ese disparador.`);
    }
    const steps = fill(a.steps.filter(s => has(s.requires)), vars).map(({ requires: _r, ...s }) => s);
    return { name: a.name, description: a.description, trigger_type: a.trigger_type, tag: a.tag ?? null, enabled, note, config: a.config ?? {}, steps };
  });

  const tags = [...new Set(automations.map(a => a.tag).filter((x): x is string => Boolean(x)))];
  return { template: { key: t.key, name: t.name }, variables: vars, pipelines, calendars: plannedCalendars, automations, tags, warnings };
}

export type Plan = Awaited<ReturnType<typeof buildPlan>>;

export async function appliedTemplates(orgId: string) {
  const r = await pool.query<{ template_key: string; applied_at: string; created: unknown }>(
    'SELECT template_key, applied_at, created FROM account_template_applications WHERE organization_id = $1 ORDER BY applied_at',
    [orgId]);
  return r.rows.map(a => ({ ...a, name: TEMPLATES.find(t => t.key === a.template_key)?.name ?? a.template_key }));
}

// Crea todo en una transacción: o se crea la plantilla completa o no se crea nada.
export async function applyTemplate(orgId: string, t: AccountTemplate, input: Record<string, string>, adminId: string | null) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    // Reserva la aplicación primero: si otra petición ya la aplicó, choca con el UNIQUE.
    const reserved = await db.query(
      `INSERT INTO account_template_applications (organization_id, template_key, applied_by)
       VALUES ($1, $2, $3) ON CONFLICT (organization_id, template_key) DO NOTHING RETURNING id`,
      [orgId, t.key, adminId]);
    if (!reserved.rowCount) throw new TemplateError(409, `La plantilla "${t.name}" ya se aplicó a esta cuenta`);

    const owner = (await db.query<{ id: string }>(
      `SELECT id FROM users WHERE organization_id = $1 ORDER BY (role = 'owner') DESC, created_at LIMIT 1`, [orgId])).rows[0];
    if (!owner) throw new TemplateError(409, 'La cuenta no tiene usuarios: provisiona el CRM antes de aplicar la plantilla');

    const plan = await buildPlan(db, orgId, t, input);
    const created = { pipelines: [] as string[], calendars: [] as string[], automations: [] as string[] };

    // Pipelines y etapas; se guardan los ids para resolver los pasos create_opportunity.
    const refs: Record<string, { id: string; stages: Record<string, string> }> = {};
    for (const p of plan.pipelines) {
      const { rows: [row] } = await db.query<{ id: string }>(
        'INSERT INTO pipelines (organization_id, name) VALUES ($1, $2) RETURNING id', [orgId, p.name]);
      refs[p.key] = { id: row.id, stages: {} };
      created.pipelines.push(row.id);
      for (const [i, s] of p.stages.entries()) {
        const { rows: [st] } = await db.query<{ id: string }>(
          'INSERT INTO pipeline_stages (pipeline_id, name, color, position) VALUES ($1, $2, $3, $4) RETURNING id',
          [row.id, s.name, s.color, i]);
        refs[p.key].stages[s.name] = st.id;
      }
    }

    for (const c of plan.calendars) {
      const { rows: [cal] } = await db.query<{ id: string }>(
        `INSERT INTO calendars (organization_id, user_id, name, slug, timezone, description, booking_enabled,
           duration_minutes, min_notice_hours, custom_message, location, location_type)
         VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8, $9, $10, $11) RETURNING id`,
        [orgId, owner.id, c.name, c.slug, c.timezone, c.description, c.duration_minutes, c.min_notice_hours,
         c.custom_message, c.location, c.location_type]);
      created.calendars.push(cal.id);
      for (const a of c.availability) {
        await db.query(
          'INSERT INTO calendar_availability (calendar_id, day_of_week, start_time, end_time, is_active) VALUES ($1, $2, $3, $4, $5)',
          [cal.id, a.day_of_week, a.start_time, a.end_time, a.is_active]);
      }
      await db.query('INSERT INTO calendar_members (calendar_id, user_id, is_primary) VALUES ($1, $2, true)', [cal.id, owner.id]);
    }

    for (const a of plan.automations) {
      const steps = a.steps.map(({ pipeline, stage, ...s }: TemplateStep) => {
        if (s.type !== 'create_opportunity') return s;
        const ref = refs[pipeline as string];
        const stageId = ref?.stages[stage as string];
        if (!stageId) throw new TemplateError(500, `Paso "${s.label}": etapa "${stage}" no existe en la plantilla`);
        return { ...s, pipeline_id: ref.id, stage_id: stageId };
      });
      const config = { ...a.config, trigger: { type: a.trigger_type, ...(a.tag ? { tag: a.tag } : {}) }, steps };
      const { rows: [rule] } = await db.query<{ id: string }>(
        `INSERT INTO automation_rules (organization_id, trigger_type, name, description, enabled, config)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [orgId, a.trigger_type, a.name, a.description, a.enabled, JSON.stringify(config)]);
      created.automations.push(rule.id);
    }

    await db.query(
      'UPDATE account_template_applications SET variables = $1, created = $2 WHERE id = $3',
      [JSON.stringify(plan.variables), JSON.stringify(created), reserved.rows[0].id]);
    await db.query('COMMIT');
    return { plan, created };
  } catch (e) {
    await db.query('ROLLBACK');
    // Carrera con otra cuenta por el mismo slug de calendario.
    if ((e as { code?: string }).code === '23505') throw new TemplateError(409, 'Conflicto al crear (enlace de reserva ocupado); vuelve a intentarlo');
    throw e;
  } finally {
    db.release();
  }
}
