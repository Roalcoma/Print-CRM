import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db.ts';

export const bookingRouter = Router();

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
     WHERE calendar_id=$1 AND status='scheduled'
       AND start_at < $3 AND end_at > $2`,
    [calendarId, fromDate, toDate],
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

// ── GET /api/public/book/:slug  ──────────────────────────────────────────────
bookingRouter.get('/:slug', async (req, res) => {
  const cal = await queryOne<{
    id: string; name: string; color: string; slug: string;
    timezone: string; description: string | null; booking_enabled: boolean;
    duration_minutes: number; buffer_minutes: number;
    min_notice_hours: number; max_advance_days: number;
    custom_message: string | null; user_id: string; logo_url: string | null;
  }>(
    'SELECT * FROM calendars WHERE slug=$1 AND is_active=true',
    [req.params.slug],
  );

  if (!cal) return res.status(404).json({ error: 'Calendario no encontrado' });
  if (!cal.booking_enabled) return res.status(403).json({ error: 'Este calendario no acepta reservas en línea' });

  const owner = await queryOne<{ name: string }>(
    'SELECT name FROM users WHERE id=$1', [cal.user_id],
  );

  const now       = new Date();
  const fromDate  = addMinutes(now, cal.min_notice_hours * 60);
  const toDate    = addMinutes(now, cal.max_advance_days * 24 * 60);

  const slots = await computeSlots(
    cal.id, cal.duration_minutes, cal.buffer_minutes,
    cal.timezone, fromDate, toDate,
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
});

bookingRouter.post('/:slug', async (req, res) => {
  const parsed = bookSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  const cal = await queryOne<{
    id: string; name: string; organization_id: string; user_id: string;
    timezone: string; booking_enabled: boolean;
    duration_minutes: number; buffer_minutes: number; min_notice_hours: number;
  }>(
    'SELECT * FROM calendars WHERE slug=$1 AND is_active=true',
    [req.params.slug],
  );

  if (!cal) return res.status(404).json({ error: 'Calendario no encontrado' });
  if (!cal.booking_enabled) return res.status(403).json({ error: 'Este calendario no acepta reservas' });

  const d       = parsed.data;
  const startAt = new Date(d.start_at);
  const endAt   = addMinutes(startAt, cal.duration_minutes);
  const now     = new Date();

  // Validar que el slot no esté en el pasado
  if (startAt <= addMinutes(now, cal.min_notice_hours * 60)) {
    return res.status(400).json({ error: 'El horario seleccionado ya no está disponible' });
  }

  // Verificar colisión
  const conflict = await queryOne(
    `SELECT id FROM appointments
     WHERE calendar_id=$1 AND status='scheduled'
       AND start_at < $3 AND end_at > $2`,
    [cal.id, startAt, endAt],
  );
  if (conflict) return res.status(409).json({ error: 'Ese horario ya no está disponible, elige otro' });

  // Buscar o crear contacto
  let contact = await queryOne<{ id: string }>(
    'SELECT id FROM contacts WHERE email=$1 AND organization_id=$2',
    [d.email, cal.organization_id],
  );
  if (!contact) {
    const nameParts = d.name.trim().split(' ');
    const firstName = nameParts[0];
    const lastName  = nameParts.slice(1).join(' ') || null;
    const [newContact] = await query<{ id: string }>(
      `INSERT INTO contacts (organization_id, first_name, last_name, email, phone)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [cal.organization_id, firstName, lastName, d.email, d.phone ?? null],
    );
    contact = newContact;
  }

  // Crear la cita
  const [appt] = await query<{ id: string }>(
    `INSERT INTO appointments
       (organization_id, user_id, calendar_id, contact_id, title, description,
        start_at, end_at, timezone, status, provider)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'scheduled','manual')
     RETURNING id, title, start_at, end_at, meeting_url`,
    [
      cal.organization_id, cal.user_id, cal.id, contact.id,
      `Reunión con ${d.name}`,
      d.notes ?? null,
      startAt.toISOString(), endAt.toISOString(), cal.timezone,
    ],
  );

  // Guardar como attendee
  await query(
    `INSERT INTO appointment_attendees (appointment_id, contact_id, email, name)
     VALUES ($1,$2,$3,$4)`,
    [appt.id, contact.id, d.email, d.name],
  );

  res.status(201).json({
    success: true,
    appointment: appt,
    message: `Tu cita ha sido agendada para el ${startAt.toLocaleDateString('es', { timeZone: cal.timezone, weekday: 'long', day: 'numeric', month: 'long' })} a las ${formatTime(startAt, cal.timezone)}.`,
  });
});
