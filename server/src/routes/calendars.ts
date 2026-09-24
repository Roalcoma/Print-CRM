import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db.ts';

export const calendarsRouter = Router();

// ── GET /api/calendars  ──────────────────────────────────────────────────────
// Devuelve todos los calendarios de la organización con su disponibilidad
calendarsRouter.get('/', async (req, res) => {
  const orgId = req.auth!.organizationId;
  const rows = await query<Record<string, unknown>>(
    `SELECT c.*, u.name AS owner_name, u.email AS owner_email
     FROM calendars c
     JOIN users u ON u.id = c.user_id
     WHERE c.organization_id = $1
     ORDER BY u.name, c.name`,
    [orgId],
  );

  // Adjuntar disponibilidad a cada calendario
  const ids = rows.map(r => r.id as string);
  const avail = ids.length
    ? await query<{ calendar_id: string; day_of_week: number; start_time: string; end_time: string; is_active: boolean }>(
        `SELECT calendar_id, day_of_week, start_time, end_time, is_active
         FROM calendar_availability WHERE calendar_id = ANY($1) ORDER BY day_of_week`,
        [ids],
      )
    : [];

  // Adjuntar miembros a cada calendario
  const members = ids.length
    ? await query<{ calendar_id: string; user_id: string; is_primary: boolean; name: string; email: string }>(
        `SELECT cm.calendar_id, cm.user_id, cm.is_primary, u.name, u.email
         FROM calendar_members cm JOIN users u ON u.id = cm.user_id
         WHERE cm.calendar_id = ANY($1)`,
        [ids],
      )
    : [];

  const availMap: Record<string, unknown[]> = {};
  for (const a of avail) {
    if (!availMap[a.calendar_id]) availMap[a.calendar_id] = [];
    availMap[a.calendar_id].push(a);
  }

  const membersMap: Record<string, unknown[]> = {};
  for (const m of members) {
    if (!membersMap[m.calendar_id]) membersMap[m.calendar_id] = [];
    membersMap[m.calendar_id].push(m);
  }

  res.json(rows.map(r => ({
    ...r,
    availability: availMap[r.id as string] ?? [],
    members: membersMap[r.id as string] ?? [],
  })));
});

// ── GET /api/calendars/mine  ─────────────────────────────────────────────────
calendarsRouter.get('/mine', async (req, res) => {
  const orgId     = req.auth!.organizationId;
  const forUserId = typeof req.query.forUserId === 'string' ? req.query.forUserId : null;
  if (forUserId && forUserId !== req.auth!.userId) {
    const userRow = await queryOne<{ role: string }>('SELECT role FROM users WHERE id=$1', [req.auth!.userId]);
    if (!userRow || (userRow.role !== 'owner' && userRow.role !== 'admin')) {
      return res.status(403).json({ error: 'Requiere rol de administrador' });
    }
  }
  const userId = forUserId ?? req.auth!.userId;
  const rows = await query<Record<string, unknown>>(
    `SELECT c.*, u.name AS owner_name FROM calendars c
     JOIN users u ON u.id = c.user_id
     WHERE c.organization_id = $1 AND (
       c.user_id = $2
       OR EXISTS (SELECT 1 FROM calendar_members cm WHERE cm.calendar_id = c.id AND cm.user_id = $2)
     )
     ORDER BY c.created_at`,
    [orgId, userId],
  );

  const ids = rows.map(r => r.id as string);
  const members = ids.length
    ? await query<{ calendar_id: string; user_id: string; is_primary: boolean; name: string; email: string }>(
        `SELECT cm.calendar_id, cm.user_id, cm.is_primary, u.name, u.email
         FROM calendar_members cm JOIN users u ON u.id = cm.user_id
         WHERE cm.calendar_id = ANY($1)`,
        [ids],
      )
    : [];

  const membersMap: Record<string, unknown[]> = {};
  for (const m of members) {
    if (!membersMap[m.calendar_id]) membersMap[m.calendar_id] = [];
    membersMap[m.calendar_id].push(m);
  }

  res.json(rows.map(r => ({ ...r, members: membersMap[r.id as string] ?? [] })));
});

// ── Schema ───────────────────────────────────────────────────────────────────
const availabilitySchema = z.array(z.object({
  day_of_week: z.number().int().min(0).max(6),
  start_time:  z.string().regex(/^\d{2}:\d{2}$/),
  end_time:    z.string().regex(/^\d{2}:\d{2}$/),
  is_active:   z.boolean(),
}));

const calendarSchema = z.object({
  name:             z.string().min(1),
  color:            z.string().optional(),
  slug:             z.string().min(3).max(80).regex(/^[a-z0-9-]+$/, 'Solo letras minúsculas, números y guiones').optional(),
  timezone:         z.string().optional(),
  description:      z.string().optional().nullable(),
  is_active:        z.boolean().optional(),
  booking_enabled:  z.boolean().optional(),
  duration_minutes: z.number().int().min(5).max(480).optional(),
  buffer_minutes:   z.number().int().min(0).max(120).optional(),
  min_notice_hours: z.number().int().min(0).max(168).optional(),
  max_advance_days: z.number().int().min(1).max(365).optional(),
  custom_message:   z.string().optional().nullable(),
  logo_url:         z.string().optional().nullable(),
  location:         z.string().optional().nullable(),
  location_type:    z.enum(['custom','google_meet','zoom','phone']).optional(),
  availability:     availabilitySchema.optional(),
  member_ids:       z.array(z.string().uuid()).optional(),
  primary_user_id:  z.string().uuid().optional(),
});

function slugify(name: string, suffix: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 50)
    + '-' + suffix;
}

// ── POST /api/calendars  ─────────────────────────────────────────────────────
calendarsRouter.post('/', async (req, res) => {
  const parsed = calendarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  const d      = parsed.data;
  const orgId  = req.auth!.organizationId;
  const userId = req.auth!.userId;

  // Generar slug si no se proveyó
  let slug = d.slug;
  if (!slug) {
    const suffix = Math.random().toString(36).slice(2, 7);
    slug = slugify(d.name, suffix);
  }

  // Verificar unicidad del slug
  const existing = await queryOne('SELECT id FROM calendars WHERE slug = $1', [slug]);
  if (existing) return res.status(409).json({ error: 'Ese slug ya está en uso, elige otro' });

  const [cal] = await query<{ id: string }>(
    `INSERT INTO calendars
       (organization_id, user_id, name, color, slug, timezone, description,
        booking_enabled, duration_minutes, buffer_minutes, min_notice_hours, max_advance_days, custom_message, logo_url, location, location_type)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     RETURNING *`,
    [
      orgId, userId, d.name, d.color ?? '#F69008', slug,
      d.timezone ?? 'America/Caracas', d.description ?? null,
      d.booking_enabled ?? false, d.duration_minutes ?? 30, d.buffer_minutes ?? 0,
      d.min_notice_hours ?? 2, d.max_advance_days ?? 60, d.custom_message ?? null,
      d.logo_url ?? null, d.location ?? null, d.location_type ?? 'custom',
    ],
  );

  // Insertar disponibilidad
  const avail = d.availability ?? [
    { day_of_week: 1, start_time: '09:00', end_time: '18:00', is_active: true },
    { day_of_week: 2, start_time: '09:00', end_time: '18:00', is_active: true },
    { day_of_week: 3, start_time: '09:00', end_time: '18:00', is_active: true },
    { day_of_week: 4, start_time: '09:00', end_time: '18:00', is_active: true },
    { day_of_week: 5, start_time: '09:00', end_time: '18:00', is_active: true },
  ];
  for (const a of avail) {
    await query(
      `INSERT INTO calendar_availability (calendar_id, day_of_week, start_time, end_time, is_active)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (calendar_id, day_of_week) DO UPDATE
       SET start_time=$3, end_time=$4, is_active=$5`,
      [cal.id, a.day_of_week, a.start_time, a.end_time, a.is_active],
    );
  }

  // Insertar miembros: el creador es siempre primario; se pueden añadir más
  const primaryId = d.primary_user_id ?? userId;
  const memberSet = new Set<string>([userId]);
  if (d.member_ids) d.member_ids.forEach(id => memberSet.add(id));
  for (const memberId of memberSet) {
    await query(
      `INSERT INTO calendar_members (calendar_id, user_id, is_primary)
       VALUES ($1,$2,$3) ON CONFLICT (calendar_id, user_id) DO UPDATE SET is_primary=$3`,
      [cal.id, memberId, memberId === primaryId],
    );
  }

  res.status(201).json(cal);
});

// ── GET /api/calendars/:id  ──────────────────────────────────────────────────
calendarsRouter.get('/:id', async (req, res) => {
  const orgId = req.auth!.organizationId;
  const cal = await queryOne(
    `SELECT c.*, u.name AS owner_name FROM calendars c
     JOIN users u ON u.id = c.user_id
     WHERE c.id = $1 AND c.organization_id = $2`,
    [req.params.id, orgId],
  );
  if (!cal) return res.status(404).json({ error: 'Calendario no encontrado' });
  const avail = await query(
    `SELECT day_of_week, start_time, end_time, is_active FROM calendar_availability
     WHERE calendar_id = $1 ORDER BY day_of_week`,
    [req.params.id],
  );
  const members = await query<{ user_id: string; is_primary: boolean; name: string; email: string }>(
    `SELECT cm.user_id, cm.is_primary, u.name, u.email
     FROM calendar_members cm JOIN users u ON u.id = cm.user_id
     WHERE cm.calendar_id = $1`,
    [req.params.id],
  );
  res.json({ ...cal, availability: avail, members });
});

// ── PATCH /api/calendars/:id  ────────────────────────────────────────────────
calendarsRouter.patch('/:id', async (req, res) => {
  const parsed = calendarSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  const orgId = req.auth!.organizationId;
  const cal   = await queryOne<{ id: string; user_id: string }>(
    'SELECT id, user_id FROM calendars WHERE id=$1 AND organization_id=$2',
    [req.params.id, orgId],
  );
  if (!cal) return res.status(404).json({ error: 'Calendario no encontrado' });

  const d = parsed.data;

  // Verificar slug si cambió
  if (d.slug) {
    const dup = await queryOne('SELECT id FROM calendars WHERE slug=$1 AND id<>$2', [d.slug, cal.id]);
    if (dup) return res.status(409).json({ error: 'Ese slug ya está en uso' });
  }

  const COLS = ['name','color','slug','timezone','description','is_active',
                'booking_enabled','duration_minutes','buffer_minutes',
                'min_notice_hours','max_advance_days','custom_message','logo_url','location','location_type'] as const;
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const col of COLS) {
    if (col in d && d[col] !== undefined) {
      sets.push(`${col} = $${vals.length + 1}`);
      vals.push(d[col]);
    }
  }

  if (sets.length) {
    sets.push(`updated_at = now()`);
    await query(
      `UPDATE calendars SET ${sets.join(', ')} WHERE id=$${vals.length + 1} AND organization_id=$${vals.length + 2}`,
      [...vals, cal.id, orgId],
    );
  }

  // Actualizar disponibilidad si se envió
  if (d.availability) {
    for (const a of d.availability) {
      await query(
        `INSERT INTO calendar_availability (calendar_id, day_of_week, start_time, end_time, is_active)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (calendar_id, day_of_week) DO UPDATE
         SET start_time=$3, end_time=$4, is_active=$5`,
        [cal.id, a.day_of_week, a.start_time, a.end_time, a.is_active],
      );
    }
  }

  // Actualizar miembros si se envió member_ids o primary_user_id
  if (d.member_ids !== undefined || d.primary_user_id !== undefined) {
    // Obtener el estado actual para preservar al propietario original
    const currentMembers = await query<{ user_id: string; is_primary: boolean }>(
      'SELECT user_id, is_primary FROM calendar_members WHERE calendar_id=$1',
      [cal.id],
    );
    const currentPrimary = currentMembers.find(m => m.is_primary)?.user_id ?? cal.user_id;
    const newPrimaryId   = d.primary_user_id ?? currentPrimary;

    if (d.member_ids !== undefined) {
      // Siempre incluir el propietario original y el primario
      const memberSet = new Set<string>([cal.user_id, newPrimaryId, ...d.member_ids]);
      // Borrar y reinsertar para simplificar
      await query('DELETE FROM calendar_members WHERE calendar_id=$1', [cal.id]);
      for (const memberId of memberSet) {
        await query(
          `INSERT INTO calendar_members (calendar_id, user_id, is_primary)
           VALUES ($1,$2,$3) ON CONFLICT (calendar_id, user_id) DO UPDATE SET is_primary=$3`,
          [cal.id, memberId, memberId === newPrimaryId],
        );
      }
    } else {
      // Solo cambiar el primario
      await query('UPDATE calendar_members SET is_primary=false WHERE calendar_id=$1', [cal.id]);
      await query(
        `INSERT INTO calendar_members (calendar_id, user_id, is_primary)
         VALUES ($1,$2,true) ON CONFLICT (calendar_id, user_id) DO UPDATE SET is_primary=true`,
        [cal.id, newPrimaryId],
      );
    }
  }

  const updated = await queryOne(
    `SELECT c.*, u.name AS owner_name FROM calendars c JOIN users u ON u.id=c.user_id WHERE c.id=$1`,
    [cal.id],
  );
  const members = await query<{ user_id: string; is_primary: boolean; name: string; email: string }>(
    `SELECT cm.user_id, cm.is_primary, u.name, u.email
     FROM calendar_members cm JOIN users u ON u.id = cm.user_id
     WHERE cm.calendar_id = $1`,
    [cal.id],
  );
  res.json({ ...updated, members });
});

// ── DELETE /api/calendars/:id  ───────────────────────────────────────────────
calendarsRouter.delete('/:id', async (req, res) => {
  const orgId = req.auth!.organizationId;
  const cal   = await queryOne<{ id: string }>(
    'SELECT id FROM calendars WHERE id=$1 AND organization_id=$2',
    [req.params.id, orgId],
  );
  if (!cal) return res.status(404).json({ error: 'Calendario no encontrado' });

  // No permitir borrar el único calendario del usuario
  const count = await queryOne<{ n: string }>(
    'SELECT COUNT(*)::int AS n FROM calendars WHERE user_id=(SELECT user_id FROM calendars WHERE id=$1) AND organization_id=$2',
    [cal.id, orgId],
  );
  if (Number(count?.n) <= 1) return res.status(400).json({ error: 'No puedes eliminar tu único calendario' });

  await query('DELETE FROM calendars WHERE id=$1 AND organization_id=$2', [cal.id, orgId]);
  res.status(204).end();
});
