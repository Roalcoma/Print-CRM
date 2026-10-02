import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import type pg from 'pg';
import { pool, query, queryOne } from '../db.ts';
import { findContactByPhone, lockPhone, withTransaction } from '../phone.ts';
import { getGoogleFreebusy } from '../integrations/google-calendar.ts';
import { ensureGoogleMeet } from '../services/google-meet.ts';
import { fireAppointmentBookedTrigger, fireContactCreatedTrigger, rescheduleAppointmentWaits, appointmentTimeFields } from '../services/automation-engine.ts';

export const bookingRouter = Router();

// Rate limit por IP para reservar y reagendar (rutas públicas sin login): evita llenar la agenda
// con reservas falsas y probar tokens de gestión a fuerza bruta. req.ip respeta `trust proxy` de index.ts.
// BOOKING_RATE_LIMIT permite ajustar el máximo por hora (por defecto 10).
const publicBookingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: Number(process.env.BOOKING_RATE_LIMIT) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes de reserva desde tu conexión. Inténtalo de nuevo en una hora.' },
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function formatTime(date: Date, tz: string): string {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz,
  });
}

function dateInTz(date: Date, tz: string): string {
  return date.toLocaleDateString('en-CA', { timeZone: tz }); // YYYY-MM-DD
}

// Obtiene el offset en ms entre UTC y la timezone dada para una fecha concreta.
// sv-SE da formato "YYYY-MM-DD HH:mm:ss" que JavaScript parsea correctamente como local.
function getTzOffsetMs(utcDate: Date, timezone: string): number {
  const utcStr = utcDate.toLocaleString('sv-SE', { timeZone: 'UTC' });      // "2026-08-17 12:00:00"
  const tzStr  = utcDate.toLocaleString('sv-SE', { timeZone: timezone });   // "2026-08-17 07:30:00"
  return new Date(utcStr).getTime() - new Date(tzStr).getTime(); // positivo si tz está detrás de UTC
}

// Convierte fecha+hora expresada en una timezone dada a un objeto Date UTC.
// timeStr puede ser "HH:mm" o "HH:mm:ss" (PostgreSQL TIME devuelve segundos)
function tzLocalToUtc(dateStr: string, timeStr: string, timezone: string): Date {
  const refUtc = new Date(`${dateStr}T12:00:00Z`);
  const offsetMs = getTzOffsetMs(refUtc, timezone);
  const t = timeStr.length > 5 ? timeStr : `${timeStr}:00`; // asegurar HH:mm:ss
  const naiveUtc = new Date(`${dateStr}T${t}Z`);
  return new Date(naiveUtc.getTime() + offsetMs);
}

// Calcula los slots disponibles para un rango de fechas
async function computeSlots(
  calendarId: string,
  duration: number,
  buffer: number,
  timezone: string,
  fromDate: Date,
  toDate: Date,
  googleBusy: Array<{ start: string; end: string }> = [],
  excludeAppointmentId: string | null = null, // al reagendar, la propia cita no ocupa su hueco
): Promise<Array<{ date: string; times: string[] }>> {

  const availability = await query<{
    day_of_week: number; start_time: string; end_time: string; is_active: boolean;
  }>(
    'SELECT day_of_week, start_time, end_time, is_active FROM calendar_availability WHERE calendar_id=$1',
    [calendarId],
  );

  const availMap: Record<number, { start: string; end: string }> = {};
  for (const a of availability) {
    if (a.is_active) availMap[a.day_of_week] = { start: a.start_time, end: a.end_time };
  }

  const booked = await query<{ start_at: string; end_at: string }>(
    `SELECT start_at, end_at FROM appointments
     WHERE calendar_id=$1 AND status IN ('scheduled','blocked')
       AND start_at < $3 AND end_at > $2 AND id IS DISTINCT FROM $4`,
    [calendarId, fromDate, toDate, excludeAppointmentId],
  );

  const result: Array<{ date: string; times: string[] }> = [];

  // Iteramos por fechas usando la timezone del calendario
  const tzFmt = new Intl.DateTimeFormat('en-CA', { timeZone: timezone });
  let dateStr   = tzFmt.format(fromDate);
  const toStr   = tzFmt.format(toDate);

  while (dateStr <= toStr) {
    // Día de la semana (mediodía evita problemas de DST)
    const dayOfWeek = new Date(dateStr + 'T12:00:00').getDay();
    const dayAvail  = availMap[dayOfWeek];

    if (dayAvail) {
      const dayStart = tzLocalToUtc(dateStr, dayAvail.start, timezone);
      const dayEnd   = tzLocalToUtc(dateStr, dayAvail.end,   timezone);

      const times: string[] = [];
      let slot = new Date(dayStart);

      while (addMinutes(slot, duration) <= dayEnd) {
        const slotEnd = addMinutes(slot, duration);

        if (slot > fromDate) {
          const slotWithBuffer = addMinutes(slotEnd, buffer);
          const hasConflict = booked.some(b => {
            const bStart = new Date(b.start_at);
            const bEnd   = addMinutes(new Date(b.end_at), buffer);
            return slot < bEnd && slotWithBuffer > bStart;
          }) || googleBusy.some(b => {
            const bStart = new Date(b.start);
            const bEnd   = new Date(b.end);
            return slot < bEnd && slotWithBuffer > bStart;
          });
          if (!hasConflict) {
            times.push(slot.toISOString()); // instante UTC; el frontend convierte a la TZ del visitante
          }
        }

        slot = addMinutes(slot, duration + buffer);
      }

      if (times.length > 0) {
        result.push({ date: dateStr, times });
      }
    }

    // Avanzar al siguiente día sumando 1 día al YYYY-MM-DD (noon UTC para evitar DST)
    const next = new Date(dateStr + 'T12:00:00Z');
    next.setUTCDate(next.getUTCDate() + 1);
    dateStr = next.toISOString().slice(0, 10);
  }

  return result;
}

// Horas ocupadas en Google Calendar del dueño del calendario (si lo tiene conectado)
async function loadGoogleBusy(userId: string, orgId: string, from: Date, to: Date): Promise<Array<{ start: string; end: string }>> {
  const gcalSettings = await queryOne<{
    google_refresh_token: string | null;
    google_calendar_id: string | null;
  }>('SELECT google_refresh_token, google_calendar_id FROM calendar_settings WHERE user_id=$1 AND organization_id=$2', [userId, orgId]);
  if (!gcalSettings?.google_refresh_token) return [];
  try {
    return await getGoogleFreebusy({
      refreshToken: gcalSettings.google_refresh_token,
      calendarId: gcalSettings.google_calendar_id ?? 'primary',
      timeMin: from,
      timeMax: to,
    });
  } catch { return []; /* si falla Google, continuar sin freebusy */ }
}

// Ventana reservable de un calendario: desde ahora + aviso mínimo hasta ahora + días de anticipación
function bookingWindow(cal: { min_notice_hours: number; max_advance_days: number }) {
  const now = new Date();
  return { from: addMinutes(now, cal.min_notice_hours * 60), to: addMinutes(now, cal.max_advance_days * 24 * 60) };
}

type BookableCalendar = {
  id: string; user_id: string; organization_id: string; timezone: string;
  duration_minutes: number; buffer_minutes: number; min_notice_hours: number; max_advance_days: number;
};

// Valida que start_at sea uno de los huecos que ofrece la página pública (mismo cálculo que el GET):
// ni en el pasado ni antes del aviso mínimo (400), dentro de los días de anticipación (400), sin choque
// con otra cita o bloqueo (409) y dentro del horario del calendario con su duración/buffer y Google (400).
// `current` es la cita que se reagenda (no choca consigo misma). Devuelve el error o null si es válido.
async function validateSlot(
  cal: BookableCalendar,
  startAt: Date,
  current: { id: string; start_at: string | Date; end_at: string | Date } | null = null,
): Promise<{ status: number; error: string } | null> {
  const { from, to } = bookingWindow(cal);
  if (startAt <= from) return { status: 400, error: 'El horario seleccionado ya no está disponible' };
  if (startAt > to) return { status: 400, error: `Solo se puede reservar con hasta ${cal.max_advance_days} días de anticipación` };

  const conflict = await queryOne(
    `SELECT id FROM appointments
     WHERE calendar_id=$1 AND status IN ('scheduled','blocked') AND id IS DISTINCT FROM $4
       AND start_at < $3 AND end_at > $2`,
    [cal.id, startAt, addMinutes(startAt, cal.duration_minutes), current?.id ?? null],
  );
  if (conflict) return { status: 409, error: SLOT_TAKEN };

  let busy = await loadGoogleBusy(cal.user_id, cal.organization_id, from, to);
  if (current) {
    // El evento de Google de la propia cita no bloquea su reagendado
    const cs = new Date(current.start_at).getTime(), ce = new Date(current.end_at).getTime();
    busy = busy.filter(b => !(new Date(b.start).getTime() === cs && new Date(b.end).getTime() === ce));
  }
  const slots = await computeSlots(cal.id, cal.duration_minutes, cal.buffer_minutes, cal.timezone, from, to, busy, current?.id ?? null);
  const ok = slots.some(d => d.times.some(t => new Date(t).getTime() === startAt.getTime()));
  return ok ? null : { status: 400, error: 'Ese horario no está dentro de los horarios disponibles del calendario, elige otro' };
}

const SLOT_TAKEN = 'Ese horario ya no está disponible, elige otro';

// Dentro de una transacción: toma el candado del calendario (se libera en COMMIT/ROLLBACK) y comprueba
// que el hueco siga libre, con el mismo buffer que computeSlots. Así dos reservas/reagendados simultáneos
// no ocupan el mismo hueco. Solo afecta a la reserva pública: las citas que se crean desde el CRM
// (routes/appointments.ts) pueden solaparse a propósito y no pasan por aquí. Devuelve true si está libre.
async function lockCalendarAndCheck(
  tx: pg.PoolClient, cal: { id: string; buffer_minutes: number }, startAt: Date, endAt: Date, excludeId: string | null = null,
): Promise<boolean> {
  await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`calendar-booking:${cal.id}`]);
  const buffer = cal.buffer_minutes ?? 0;
  const r = await tx.query(
    `SELECT 1 FROM appointments
     WHERE calendar_id=$1 AND status IN ('scheduled','blocked') AND id IS DISTINCT FROM $4
       AND start_at < $3 AND end_at + make_interval(mins => $5) > $2
     LIMIT 1`,
    [cal.id, startAt, addMinutes(endAt, buffer), excludeId, buffer],
  );
  return r.rowCount === 0;
}

// ── GET /api/public/book/:slug  ──────────────────────────────────────────────
bookingRouter.get('/:slug', async (req, res) => {
  const cal = await queryOne<{
    id: string; name: string; color: string; slug: string;
    timezone: string; description: string | null; booking_enabled: boolean;
    duration_minutes: number; buffer_minutes: number;
    min_notice_hours: number; max_advance_days: number;
    custom_message: string | null; user_id: string; organization_id: string;
    logo_url: string | null;
    location: string | null; location_type: string | null;
  }>(
    'SELECT * FROM calendars WHERE slug=$1 AND is_active=true',
    [req.params.slug],
  );

  if (!cal) return res.status(404).json({ error: 'Calendario no encontrado' });
  if (!cal.booking_enabled) return res.status(403).json({ error: 'Este calendario no acepta reservas en línea' });

  const owner = await queryOne<{ name: string }>(
    'SELECT name FROM users WHERE id=$1', [cal.user_id],
  );

  const { from: fromDate, to: toDate } = bookingWindow(cal);

  // Obtener freebusy de Google si está conectado
  const googleBusy = await loadGoogleBusy(cal.user_id, cal.organization_id, fromDate, toDate);

  const slots = await computeSlots(
    cal.id, cal.duration_minutes, cal.buffer_minutes,
    cal.timezone, fromDate, toDate, googleBusy,
  );

  res.json({
    calendar: {
      name:             cal.name,
      color:            cal.color,
      slug:             cal.slug,
      timezone:         cal.timezone,
      description:      cal.description,
      duration_minutes: cal.duration_minutes,
      custom_message:   cal.custom_message,
      owner_name:       owner?.name ?? '',
      logo_url:         cal.logo_url,
      location:         cal.location,
      location_type:    cal.location_type,
    },
    slots,
  });
});

// ── POST /api/public/book/:slug  ─────────────────────────────────────────────
const bookSchema = z.object({
  name:     z.string().min(1),
  email:    z.string().email(),
  phone:    z.string().optional().nullable(),
  notes:    z.string().optional().nullable(),
  start_at: z.string().datetime({ offset: true }),
  contact_ref: z.string().uuid().optional().nullable(),
});

bookingRouter.post('/:slug', publicBookingLimiter, async (req, res) => {
  const parsed = bookSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  const cal = await queryOne<{
    id: string; slug: string; name: string; organization_id: string; user_id: string;
    timezone: string; booking_enabled: boolean;
    duration_minutes: number; buffer_minutes: number; min_notice_hours: number; max_advance_days: number;
    location: string | null; location_type: string | null;
  }>(
    'SELECT * FROM calendars WHERE slug=$1 AND is_active=true',
    [req.params.slug],
  );

  if (!cal) return res.status(404).json({ error: 'Calendario no encontrado' });
  if (!cal.booking_enabled) return res.status(403).json({ error: 'Este calendario no acepta reservas' });

  const d       = parsed.data;
  const startAt = new Date(d.start_at);
  const endAt   = addMinutes(startAt, cal.duration_minutes);

  // Debe ser uno de los huecos que ofrece la página: futuro, en ventana, libre y en horario
  const invalid = await validateSlot(cal, startAt);
  if (invalid) return res.status(invalid.status).json({ error: invalid.error });

  // Todo en una transacción con candado por calendario: dos reservas simultáneas al mismo hueco pasan
  // validateSlot a la vez, pero aquí se serializan y la segunda ve la cita de la primera → 409.
  const nameParts = d.name.trim().split(/\s+/);
  const booked = await withTransaction(pool, async tx => {
    if (!(await lockCalendarAndCheck(tx, cal, startAt, endAt))) return null;

    // Buscar o crear contacto. Orden: enlace personalizado (?c=) → email → teléfono → nuevo.
    // Candado por teléfono: no se duplica con un WhatsApp/reserva simultáneos del mismo número.
    await lockPhone(tx, cal.organization_id, d.phone);
    let contact: { id: string } | null = null;
    let created = false;

    if (d.contact_ref) {
      const ref = (await tx.query<{ id: string; email: string | null; phone: string | null; ig_sender_id: string | null }>(
        'SELECT id, email, phone, ig_sender_id FROM contacts WHERE id=$1 AND organization_id=$2',
        [d.contact_ref, cal.organization_id],
      )).rows[0];
      if (ref) {
        // Completa lo que falte; si vino de Instagram su nombre era el usuario de IG → nombre real
        await tx.query(
          `UPDATE contacts SET
             email      = COALESCE(NULLIF(email, ''), $2),
             phone      = COALESCE(NULLIF(phone, ''), $3),
             first_name = CASE WHEN $4 THEN $5 ELSE first_name END,
             last_name  = CASE WHEN $4 THEN $6 ELSE last_name END,
             updated_at = NOW()
           WHERE id = $1`,
          [ref.id, d.email, d.phone ?? null, ref.ig_sender_id !== null, nameParts[0], nameParts.slice(1).join(' ') || null],
        );
        contact = ref;
      }
    }
    if (!contact) {
      contact = (await tx.query<{ id: string }>(
        'SELECT id FROM contacts WHERE lower(email)=lower($1) AND organization_id=$2 ORDER BY created_at LIMIT 1',
        [d.email, cal.organization_id],
      )).rows[0] ?? null;
    }
    if (!contact) {
      // Comparación tolerante (últimos 10 dígitos, phone.ts): misma lógica que WhatsApp y el CRM
      const byPhone = await findContactByPhone<{ id: string; ig_sender_id: string | null }>(
        tx, cal.organization_id, d.phone, 'id, ig_sender_id',
      );
      if (byPhone) {
        await tx.query(
          `UPDATE contacts SET
             email      = COALESCE(NULLIF(email, ''), $2),
             first_name = CASE WHEN $3 THEN $4 ELSE first_name END,
             last_name  = CASE WHEN $3 THEN $5 ELSE last_name END,
             updated_at = NOW()
           WHERE id = $1`,
          [byPhone.id, d.email, byPhone.ig_sender_id !== null, nameParts[0], nameParts.slice(1).join(' ') || null],
        );
        contact = byPhone;
      }
    }
    if (!contact) {
      const firstName = nameParts[0];
      const lastName  = nameParts.slice(1).join(' ') || null;
      contact = (await tx.query<{ id: string }>(
        `INSERT INTO contacts (organization_id, first_name, last_name, email, phone)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [cal.organization_id, firstName, lastName, d.email, d.phone ?? null],
      )).rows[0];
      created = true;
    }

    // Crear la cita
    const appt = (await tx.query<{ id: string; title: string; start_at: string; end_at: string; meeting_url: string | null; cancel_token: string }>(
      `INSERT INTO appointments
         (organization_id, user_id, calendar_id, contact_id, title, description,
          start_at, end_at, timezone, status, provider)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'scheduled','manual')
       RETURNING id, title, start_at, end_at, meeting_url, cancel_token`,
      [
        cal.organization_id, cal.user_id, cal.id, contact.id,
        `Reunión con ${d.name}`,
        d.notes ?? null,
        startAt.toISOString(), endAt.toISOString(), cal.timezone,
      ],
    )).rows[0];

    // Guardar como attendee
    await tx.query(
      `INSERT INTO appointment_attendees (appointment_id, contact_id, email, name)
       VALUES ($1,$2,$3,$4)`,
      [appt.id, contact.id, d.email, d.name],
    );
    return { contact, created, appt };
  });
  if (!booked) return res.status(409).json({ error: SLOT_TAKEN });
  const { contact, appt } = booked;
  // Tras el COMMIT: el flujo de "Contacto creado" ya ve el contacto (y solo se dispara una vez)
  if (booked.created) fireContactCreatedTrigger(cal.organization_id, contact.id).catch(console.error);

  // Crear evento en Google Meet si está configurado
  const meetLink = await ensureGoogleMeet(appt.id);

  const locationNote = meetLink
    ? ` El enlace de la reunión es: ${meetLink}`
    : cal.location ? ` El enlace de la reunión es: ${cal.location}` : '';

  // Disparar automatizaciones de cita agendada
  if (contact?.id) {
    const publicUrl = process.env.PUBLIC_URL ?? '';
    fireAppointmentBookedTrigger(cal.organization_id, contact.id, {
      appointment_id:  appt.id,
      ...appointmentTimeFields(startAt, cal.timezone),
      meeting_url:     meetLink ?? cal.location ?? '',
      reschedule_link: `${publicUrl}/book/${cal.slug}/manage/${appt.cancel_token}`,
    }).catch(console.error);
  }

  res.status(201).json({
    success: true,
    appointment: appt,
    cancel_token: appt.cancel_token,
    location: meetLink ?? cal.location ?? null,
    message: `Tu cita ha sido agendada para el ${startAt.toLocaleDateString('es', { timeZone: cal.timezone, weekday: 'long', day: 'numeric', month: 'long' })} a las ${formatTime(startAt, cal.timezone)}.${locationNote}`,
  });
});

// ── GET /api/public/book/:slug/manage/:token  ────────────────────────────────
bookingRouter.get('/:slug/manage/:token', async (req, res) => {
  const appt = await queryOne<{
    id: string; title: string; start_at: string; end_at: string;
    status: string; meeting_url: string | null; timezone: string;
    cancel_token: string;
  }>(
    `SELECT a.id, a.title, a.start_at, a.end_at, a.status, a.meeting_url, a.timezone, a.cancel_token
     FROM appointments a
     JOIN calendars c ON c.id = a.calendar_id
     WHERE c.slug=$1 AND a.cancel_token=$2`,
    [req.params.slug, req.params.token],
  );
  if (!appt) return res.status(404).json({ error: 'Cita no encontrada' });
  res.json(appt);
});

// ── POST /api/public/book/:slug/cancel/:token  ───────────────────────────────
bookingRouter.post('/:slug/cancel/:token', async (req, res) => {
  const appt = await queryOne<{
    id: string; status: string; provider: string; provider_event_id: string | null;
    user_id: string; organization_id: string;
  }>(
    `SELECT a.id, a.status, a.provider, a.provider_event_id, a.user_id, c.organization_id
     FROM appointments a
     JOIN calendars c ON c.id = a.calendar_id
     WHERE c.slug=$1 AND a.cancel_token=$2`,
    [req.params.slug, req.params.token],
  );
  if (!appt) return res.status(404).json({ error: 'Cita no encontrada' });
  if (appt.status === 'cancelled') return res.json({ success: true, message: 'La cita ya estaba cancelada' });

  await query("UPDATE appointments SET status='cancelled', updated_at=now() WHERE id=$1", [appt.id]);
  // Sin recordatorios para una cita cancelada
  await rescheduleAppointmentWaits(appt.organization_id, appt.id);

  // Cancelar en Google si aplica
  if (appt.provider === 'google' && appt.provider_event_id) {
    const gs = await queryOne<{ google_refresh_token: string | null; google_calendar_id: string | null }>(
      'SELECT google_refresh_token, google_calendar_id FROM calendar_settings WHERE user_id=$1 AND organization_id=$2',
      [appt.user_id, appt.organization_id],
    );
    if (gs?.google_refresh_token) {
      const { updateGoogleEvent } = await import('../integrations/google-calendar.ts');
      updateGoogleEvent({
        refreshToken: gs.google_refresh_token,
        calendarId:   gs.google_calendar_id ?? 'primary',
        eventId:      appt.provider_event_id,
        cancelled:    true,
      }).catch(console.error);
    }
  }

  res.json({ success: true, message: 'Tu cita ha sido cancelada correctamente.' });
});

// ── POST /api/public/book/:slug/reschedule/:token  ───────────────────────────
bookingRouter.post('/:slug/reschedule/:token', publicBookingLimiter, async (req, res) => {
  const parsed = z.object({ start_at: z.string().datetime({ offset: true }) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Fecha inválida' });

  const appt = await queryOne<{
    id: string; status: string; provider: string; provider_event_id: string | null;
    user_id: string; organization_id: string; title: string; description: string | null;
    meeting_url: string | null; calendar_id: string; start_at: string; end_at: string;
  }>(
    `SELECT a.id, a.status, a.provider, a.provider_event_id, a.user_id, c.organization_id,
            a.title, a.description, a.meeting_url, a.calendar_id, a.start_at, a.end_at
     FROM appointments a
     JOIN calendars c ON c.id = a.calendar_id
     WHERE c.slug=$1 AND a.cancel_token=$2`,
    [req.params.slug, req.params.token],
  );
  if (!appt) return res.status(404).json({ error: 'Cita no encontrada' });
  if (appt.status === 'cancelled') return res.status(400).json({ error: 'No se puede reagendar una cita cancelada' });

  const cal = await queryOne<BookableCalendar>(
    `SELECT id, user_id, organization_id, timezone, duration_minutes, buffer_minutes, min_notice_hours, max_advance_days
     FROM calendars WHERE id=$1`,
    [appt.calendar_id],
  );
  if (!cal) return res.status(404).json({ error: 'Calendario no encontrado' });

  const newStart = new Date(parsed.data.start_at);
  const newEnd   = addMinutes(newStart, cal.duration_minutes);

  // Mismas reglas que al reservar (las horas bloqueadas también ocupan el hueco)
  const invalid = await validateSlot(cal, newStart, appt);
  if (invalid) return res.status(invalid.status).json({ error: invalid.error });

  // Mismo candado por calendario que la reserva: revalida el hueco y mueve la cita sin carreras
  const moved = await withTransaction(pool, async tx => {
    if (!(await lockCalendarAndCheck(tx, cal, newStart, newEnd, appt.id))) return false;
    await tx.query(
      "UPDATE appointments SET start_at=$1, end_at=$2, updated_at=now() WHERE id=$3",
      [newStart.toISOString(), newEnd.toISOString(), appt.id],
    );
    return true;
  });
  if (!moved) return res.status(409).json({ error: SLOT_TAKEN });
  // Recordatorios pendientes ("X min antes") pasan a la hora nueva
  await rescheduleAppointmentWaits(appt.organization_id, appt.id);

  // Actualizar en Google
  if (appt.provider === 'google' && appt.provider_event_id) {
    const gs = await queryOne<{ google_refresh_token: string | null; google_calendar_id: string | null }>(
      'SELECT google_refresh_token, google_calendar_id FROM calendar_settings WHERE user_id=$1 AND organization_id=$2',
      [appt.user_id, appt.organization_id],
    );
    if (gs?.google_refresh_token) {
      const { updateGoogleEvent } = await import('../integrations/google-calendar.ts');
      updateGoogleEvent({
        refreshToken: gs.google_refresh_token,
        calendarId:   gs.google_calendar_id ?? 'primary',
        eventId:      appt.provider_event_id,
        startAt:      newStart,
        endAt:        newEnd,
        timezone:     cal.timezone,
      }).catch(console.error);
    }
  }

  res.json({
    success: true,
    message: `Tu cita ha sido reagendada para el ${newStart.toLocaleDateString('es', { timeZone: cal.timezone, weekday: 'long', day: 'numeric', month: 'long' })} a las ${formatTime(newStart, cal.timezone)}.`,
    start_at: newStart.toISOString(),
    end_at:   newEnd.toISOString(),
  });
});
