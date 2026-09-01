import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db.ts';
import { logActivity } from '../activity.ts';
import {
  createGoogleEvent,
  deleteGoogleEvent,
} from '../integrations/google-calendar.ts';
import { createZoomMeeting, deleteZoomMeeting } from '../integrations/zoom.ts';

export const appointmentsRouter = Router();

// ── SELECT base con JOINs ────────────────────────────────────────────────────
const BASE_SELECT = `
  SELECT a.*,
         c.first_name || ' ' || COALESCE(c.last_name, '') AS contact_name,
         c.email  AS contact_email,
         o.title  AS opportunity_title,
         u.name   AS user_name
  FROM appointments a
  LEFT JOIN contacts     c ON c.id = a.contact_id
  LEFT JOIN opportunities o ON o.id = a.opportunity_id
  LEFT JOIN users        u ON u.id = a.user_id`;

// ── GET /api/appointments ────────────────────────────────────────────────────
appointmentsRouter.get('/', async (req, res) => {
  const orgId = req.auth!.organizationId;
  const { month, year, userId, contactId, opportunityId } = req.query;

  const where: string[] = ['a.organization_id = $1'];
  const params: unknown[] = [orgId];

  // Filtro de rango
  if (month && year) {
    const m = Number(month);
    const y = Number(year);
    const start = new Date(y, m - 1, 1);
    const end   = new Date(y, m, 1);
    params.push(start, end);
    where.push(`a.start_at >= $${params.length - 1} AND a.start_at < $${params.length}`);
  } else {
    const now  = new Date();
    const in30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    params.push(now, in30);
    where.push(`a.start_at >= $${params.length - 1} AND a.start_at < $${params.length}`);
  }

  if (userId) {
    params.push(userId);
    where.push(`a.user_id = $${params.length}`);
  }
  if (contactId) {
    params.push(contactId);
    where.push(`a.contact_id = $${params.length}`);
  }
  if (opportunityId) {
    params.push(opportunityId);
    where.push(`a.opportunity_id = $${params.length}`);
  }

  const rows = await query(`${BASE_SELECT} WHERE ${where.join(' AND ')} ORDER BY a.start_at ASC`, params);
  res.json(rows);
});

// ── GET /api/appointments/upcoming ──────────────────────────────────────────
// IMPORTANTE: esta ruta debe definirse ANTES de /:id para no confundirse
appointmentsRouter.get('/upcoming', async (req, res) => {
  const orgId  = req.auth!.organizationId;
  const userId = req.auth!.userId;
  const mine   = req.query.mine === 'true';

  const where: string[] = ['a.organization_id = $1', "a.status = 'scheduled'", 'a.start_at >= now()'];
  const params: unknown[] = [orgId];

  if (mine) {
    params.push(userId);
    where.push(`a.user_id = $${params.length}`);
  }

  const rows = await query(
    `${BASE_SELECT} WHERE ${where.join(' AND ')} ORDER BY a.start_at ASC LIMIT 5`,
    params,
  );
  res.json(rows);
});

// ── GET /api/appointments/:id ────────────────────────────────────────────────
appointmentsRouter.get('/:id', async (req, res) => {
  const row = await queryOne(
    `${BASE_SELECT} WHERE a.id = $1 AND a.organization_id = $2`,
    [req.params.id, req.auth!.organizationId],
  );
  if (!row) return res.status(404).json({ error: 'Cita no encontrada' });
  const attendees = await query(
    `SELECT aa.*, c.first_name || ' ' || COALESCE(c.last_name,'') AS contact_name, u.name AS user_name
     FROM appointment_attendees aa
     LEFT JOIN contacts c ON c.id = aa.contact_id
     LEFT JOIN users   u ON u.id = aa.user_id
     WHERE aa.appointment_id = $1`,
    [req.params.id],
  );
  res.json({ ...row, attendees });
});

// ── Schemas ──────────────────────────────────────────────────────────────────
const attendeeSchema = z.object({
  contact_id: z.string().uuid().optional().nullable(),
  user_id:    z.string().uuid().optional().nullable(),
  email:      z.string().email().optional().nullable(),
  name:       z.string().optional().nullable(),
});

const appointmentSchema = z.object({
  title:              z.string().min(1),
  description:        z.string().optional().nullable(),
  start_at:           z.string().datetime({ offset: true }),
  end_at:             z.string().datetime({ offset: true }),
  timezone:           z.string().optional(),
  is_all_day:         z.boolean().optional(),
  contact_id:         z.string().uuid().optional().nullable(),
  opportunity_id:     z.string().uuid().optional().nullable(),
  location:           z.string().optional().nullable(),
  meeting_url:        z.string().optional().nullable(),
  provider:           z.enum(['manual', 'google', 'zoom']).optional(),
  status:             z.enum(['scheduled', 'completed', 'cancelled', 'no_show']).optional(),
  recurrence_type:    z.enum(['none', 'daily', 'weekly', 'monthly', 'yearly']).optional(),
  recurrence_days:    z.array(z.number().int().min(0).max(6)).optional().nullable(),
  recurrence_end_at:  z.string().datetime({ offset: true }).optional().nullable(),
  recurrence_count:   z.number().int().positive().max(365).optional().nullable(),
  attendees:          z.array(attendeeSchema).optional(),
});

const updateSchema = appointmentSchema.partial();

// ── Helper: generar instancias recurrentes ───────────────────────────────────
function generateRecurrenceDates(
  first: Date,
  durationMs: number,
  type: string,
  days: number[] | null,
  endAt: Date | null,
  count: number | null,
): Array<{ start: Date; end: Date }> {
  const instances: Array<{ start: Date; end: Date }> = [];
  const MAX = Math.min(count ?? 52, 365);
  let current = new Date(first);
  // Avanzar al siguiente para no duplicar el primero
  function advance(d: Date): Date {
    const n = new Date(d);
    if (type === 'daily') {
      n.setDate(n.getDate() + 1);
    } else if (type === 'weekly') {
      n.setDate(n.getDate() + 1);
    } else if (type === 'monthly') {
      n.setMonth(n.getMonth() + 1);
    } else if (type === 'yearly') {
      n.setFullYear(n.getFullYear() + 1);
    }
    return n;
  }
  current = advance(current);

  while (instances.length < MAX - 1) {
    if (endAt && current >= endAt) break;
    const isValidDay = type !== 'weekly' || !days?.length || days.includes(current.getDay());
    if (isValidDay) {
      instances.push({ start: new Date(current), end: new Date(current.getTime() + durationMs) });
      if (count && instances.length >= MAX - 1) break;
    }
    current = type === 'weekly' ? (() => { const n = new Date(current); n.setDate(n.getDate() + 1); return n; })() : advance(current);
  }
  return instances;
}

// ── POST /api/appointments ───────────────────────────────────────────────────
appointmentsRouter.post('/', async (req, res) => {
  const parsed = appointmentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  const d       = parsed.data;
  const orgId   = req.auth!.organizationId;
  const actorId = req.auth!.userId;
  const provider = d.provider ?? 'manual';
  const timezone = d.timezone ?? 'America/Caracas';

  let meetingUrl:      string | null = d.meeting_url ?? null;
  let providerEventId: string | null = null;

  // Recolectar emails de los asistentes para invitaciones externas
  const attendeeEmails: string[] = [];
  if (d.attendees?.length) {
    for (const att of d.attendees) {
      if (att.email) {
        attendeeEmails.push(att.email);
      } else if (att.contact_id) {
        const contact = await queryOne<{ email: string | null }>(
          'SELECT email FROM contacts WHERE id=$1 AND organization_id=$2',
          [att.contact_id, orgId],
        );
        if (contact?.email) attendeeEmails.push(contact.email);
      } else if (att.user_id) {
        const user = await queryOne<{ email: string }>(
          'SELECT email FROM users WHERE id=$1',
          [att.user_id],
        );
        if (user?.email) attendeeEmails.push(user.email);
      }
    }
  }

  // Intentar crear evento externo
  if (provider !== 'manual') {
    const settings = await queryOne<{
      google_refresh_token: string | null;
      google_calendar_id:   string | null;
      zoom_refresh_token:   string | null;
    }>(
      'SELECT google_refresh_token, google_calendar_id, zoom_refresh_token FROM calendar_settings WHERE user_id = $1',
      [actorId],
    );

    if (provider === 'google' && settings?.google_refresh_token) {
      try {
        const result = await createGoogleEvent({
          refreshToken:   settings.google_refresh_token,
          calendarId:     settings.google_calendar_id ?? 'primary',
          title:          d.title,
          description:    d.description ?? undefined,
          startAt:        new Date(d.start_at),
          endAt:          new Date(d.end_at),
          timezone,
          isAllDay:       d.is_all_day,
          attendeeEmails: attendeeEmails.length ? attendeeEmails : undefined,
          createMeet:     true,
        });
        providerEventId = result.eventId;
        meetingUrl      = result.meetLink ?? result.htmlLink;
      } catch (err) {
        console.error('Google Calendar integration error:', err);
      }
    }

    if (provider === 'zoom' && settings?.zoom_refresh_token) {
      try {
        const start    = new Date(d.start_at);
        const end      = new Date(d.end_at);
        const duration = Math.round((end.getTime() - start.getTime()) / 60000);
        const result   = await createZoomMeeting({
          refreshToken:    settings.zoom_refresh_token,
          title:           d.title,
          startAt:         start,
          durationMinutes: duration,
          timezone,
        });
        providerEventId = result.meetingId;
        meetingUrl      = result.joinUrl;
      } catch (err) {
        console.error('Zoom integration error:', err);
      }
    }
  }

  const recType  = d.recurrence_type ?? 'none';
  const recDays  = d.recurrence_days ?? null;
  const recEndAt = d.recurrence_end_at ? new Date(d.recurrence_end_at) : null;
  const recCount = d.recurrence_count ?? null;

  const [row] = await query(
    `INSERT INTO appointments
       (organization_id, user_id, contact_id, opportunity_id, title, description,
        start_at, end_at, timezone, is_all_day, status, location, meeting_url, provider, provider_event_id,
        recurrence_type, recurrence_days, recurrence_end_at, recurrence_count)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
     RETURNING id`,
    [
      orgId, actorId,
      d.contact_id ?? null, d.opportunity_id ?? null,
      d.title, d.description ?? null,
      d.start_at, d.end_at, timezone,
      d.is_all_day ?? false,
      d.status ?? 'scheduled',
      d.location ?? null, meetingUrl, provider, providerEventId,
      recType, recDays, recEndAt, recCount,
    ],
  );

  // Guardar attendees
  if (d.attendees?.length) {
    for (const att of d.attendees) {
      await query(
        `INSERT INTO appointment_attendees (appointment_id, contact_id, user_id, email, name)
         VALUES ($1, $2, $3, $4, $5)`,
        [row.id, att.contact_id ?? null, att.user_id ?? null, att.email ?? null, att.name ?? null],
      );
    }
  }

  // Generar instancias recurrentes (si aplica)
  if (recType !== 'none') {
    const startDt   = new Date(d.start_at);
    const endDt     = new Date(d.end_at);
    const durMs     = endDt.getTime() - startDt.getTime();
    const instances = generateRecurrenceDates(startDt, durMs, recType, recDays, recEndAt, recCount);
    for (const inst of instances) {
      await query(
        `INSERT INTO appointments
           (organization_id, user_id, contact_id, opportunity_id, title, description,
            start_at, end_at, timezone, is_all_day, status, location, provider,
            recurrence_type, recurrence_days, recurrence_end_at, recurrence_count, parent_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [
          orgId, actorId,
          d.contact_id ?? null, d.opportunity_id ?? null,
          d.title, d.description ?? null,
          inst.start.toISOString(), inst.end.toISOString(), timezone,
          d.is_all_day ?? false,
          d.status ?? 'scheduled',
          d.location ?? null, provider,
          recType, recDays, recEndAt, recCount, row.id,
        ],
      );
    }
  }

  // Activity log
  const actor = await queryOne<{ name: string }>('SELECT name FROM users WHERE id=$1', [actorId]);
  const meta  = { title: d.title, provider };

  if (d.contact_id) {
    logActivity({
      orgId, entityType: 'contact', entityId: d.contact_id,
      actorId, actorName: actor?.name ?? null,
      eventType: 'appointment_created', meta,
    }).catch(console.error);
  }
  if (d.opportunity_id) {
    logActivity({
      orgId, entityType: 'opportunity', entityId: d.opportunity_id,
      actorId, actorName: actor?.name ?? null,
      eventType: 'appointment_created', meta,
    }).catch(console.error);
  }

  const full = await queryOne(`${BASE_SELECT} WHERE a.id = $1`, [row.id]);
  res.status(201).json(full);
});

// ── PATCH /api/appointments/:id ──────────────────────────────────────────────
appointmentsRouter.patch('/:id', async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  const d     = parsed.data;
  const orgId = req.auth!.organizationId;
  const actorId = req.auth!.userId;

  const existing = await queryOne<{
    status: string; contact_id: string | null; opportunity_id: string | null; title: string;
  }>(
    'SELECT status, contact_id, opportunity_id, title FROM appointments WHERE id=$1 AND organization_id=$2',
    [req.params.id, orgId],
  );
  if (!existing) return res.status(404).json({ error: 'Cita no encontrada' });

  const COLS = ['title','description','start_at','end_at','timezone','is_all_day','contact_id',
                'opportunity_id','location','meeting_url','provider','status',
                'recurrence_type','recurrence_days','recurrence_end_at','recurrence_count'] as const;
  type Col = typeof COLS[number];
  const cols = COLS.filter(c => c in d) as Col[];
  if (cols.length === 0) {
    const full = await queryOne(`${BASE_SELECT} WHERE a.id = $1`, [req.params.id]);
    return res.json(full);
  }

  const sets = cols.map((c, i) => `${c} = $${i + 1}`);
  const values: unknown[] = cols.map(c => (d as Record<string, unknown>)[c] ?? null);

  await query(
    `UPDATE appointments SET ${sets.join(', ')}, updated_at = now()
     WHERE id = $${values.length + 1} AND organization_id = $${values.length + 2}`,
    [...values, req.params.id, orgId],
  );

  // Log status change
  if ('status' in d && d.status && d.status !== existing.status) {
    const actor = await queryOne<{ name: string }>('SELECT name FROM users WHERE id=$1', [actorId]);
    const meta  = { title: existing.title, from: existing.status, to: d.status };
    if (existing.contact_id) {
      logActivity({
        orgId, entityType: 'contact', entityId: existing.contact_id,
        actorId, actorName: actor?.name ?? null,
        eventType: 'appointment_status_changed', meta,
      }).catch(console.error);
    }
    if (existing.opportunity_id) {
      logActivity({
        orgId, entityType: 'opportunity', entityId: existing.opportunity_id,
        actorId, actorName: actor?.name ?? null,
        eventType: 'appointment_status_changed', meta,
      }).catch(console.error);
    }
  }

  const full = await queryOne(`${BASE_SELECT} WHERE a.id = $1`, [req.params.id]);
  res.json(full);
});

// ── DELETE /api/appointments/:id ─────────────────────────────────────────────
appointmentsRouter.delete('/:id', async (req, res) => {
  const orgId   = req.auth!.organizationId;
  const actorId = req.auth!.userId;

  const appt = await queryOne<{
    id: string; provider: string; provider_event_id: string | null;
  }>(
    'SELECT id, provider, provider_event_id FROM appointments WHERE id=$1 AND organization_id=$2',
    [req.params.id, orgId],
  );
  if (!appt) return res.status(404).json({ error: 'Cita no encontrada' });

  // Intentar eliminar del proveedor externo
  if (appt.provider !== 'manual' && appt.provider_event_id) {
    const settings = await queryOne<{
      google_refresh_token: string | null;
      google_calendar_id:   string | null;
      zoom_refresh_token:   string | null;
    }>(
      'SELECT google_refresh_token, google_calendar_id, zoom_refresh_token FROM calendar_settings WHERE user_id = $1',
      [actorId],
    );

    if (appt.provider === 'google' && settings?.google_refresh_token) {
      deleteGoogleEvent({
        refreshToken: settings.google_refresh_token,
        calendarId:   settings.google_calendar_id ?? 'primary',
        eventId:      appt.provider_event_id,
      }).catch(err => console.error('Google deleteEvent error:', err));
    }

    if (appt.provider === 'zoom' && settings?.zoom_refresh_token) {
      deleteZoomMeeting({
        refreshToken: settings.zoom_refresh_token,
        meetingId:    appt.provider_event_id,
      }).catch(err => console.error('Zoom deleteMeeting error:', err));
    }
  }

  await query('DELETE FROM appointments WHERE id=$1 AND organization_id=$2', [req.params.id, orgId]);
  res.status(204).end();
});
