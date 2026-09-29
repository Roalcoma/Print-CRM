// Evento de Google Calendar + enlace de Meet para las citas de calendarios tipo google_meet.
// Lo usan el enlace público de agenda y la reparación al reconectar Google.

import { query, queryOne } from '../db.ts';
import { createGoogleEvent } from '../integrations/google-calendar.ts';

// Crea el evento con Meet para una cita que aún no lo tiene. Devuelve el enlace o null
// si el calendario no es de Meet, no hay Google conectado o Google falla.
export async function ensureGoogleMeet(appointmentId: string): Promise<string | null> {
  const appt = await queryOne<{
    id: string; organization_id: string; calendar_id: string | null; title: string; description: string | null;
    start_at: Date; end_at: Date; provider_event_id: string | null; meeting_url: string | null;
  }>(`SELECT id, organization_id, calendar_id, title, description, start_at, end_at, provider_event_id, meeting_url
      FROM appointments WHERE id = $1`, [appointmentId]);
  if (!appt?.calendar_id) return null;
  if (appt.provider_event_id) return appt.meeting_url;

  const cal = await queryOne<{ id: string; user_id: string; timezone: string; location_type: string | null }>(
    'SELECT id, user_id, timezone, location_type FROM calendars WHERE id = $1', [appt.calendar_id],
  );
  if (cal?.location_type !== 'google_meet') return null;

  // El miembro primario autentica con Google (o el dueño del calendario)
  const members = await query<{ user_id: string; email: string; is_primary: boolean }>(
    `SELECT cm.user_id, u.email, cm.is_primary
     FROM calendar_members cm JOIN users u ON u.id = cm.user_id
     WHERE cm.calendar_id = $1`,
    [cal.id],
  );
  const googleUserId = (members.find(m => m.is_primary) ?? members[0])?.user_id ?? cal.user_id;
  const gc = await queryOne<{ google_refresh_token: string | null; google_calendar_id: string | null }>(
    'SELECT google_refresh_token, google_calendar_id FROM calendar_settings WHERE user_id=$1 AND organization_id=$2',
    [googleUserId, appt.organization_id],
  );
  if (!gc?.google_refresh_token) return null;

  // Invitados: el cliente + todos los miembros del calendario
  const guests = await query<{ email: string | null }>(
    'SELECT email FROM appointment_attendees WHERE appointment_id = $1', [appt.id],
  );
  const attendeeEmails = [...guests.map(g => g.email), ...members.map(m => m.email)].filter((e): e is string => !!e);

  try {
    const ev = await createGoogleEvent({
      refreshToken: gc.google_refresh_token,
      calendarId:   gc.google_calendar_id ?? 'primary',
      title:        appt.title,
      description:  appt.description ?? undefined,
      startAt:      new Date(appt.start_at),
      endAt:        new Date(appt.end_at),
      timezone:     cal.timezone,
      attendeeEmails,
      createMeet:   true,
    });
    await query(
      `UPDATE appointments SET provider='google', provider_event_id=$1, meeting_url=$2 WHERE id=$3`,
      [ev.eventId, ev.meetLink ?? null, appt.id],
    );
    return ev.meetLink ?? null;
  } catch (err) {
    console.error(`[google-meet] no se pudo crear el Meet de la cita ${appt.id}:`, err);
    return null;
  }
}

// Tras reconectar Google: crea el Meet de las citas futuras que quedaron como manuales
// en los calendarios de Meet de ese usuario.
export async function repairPendingMeets(userId: string, orgId: string): Promise<number> {
  const pending = await query<{ id: string }>(
    `SELECT a.id FROM appointments a
     JOIN calendars c ON c.id = a.calendar_id
     WHERE a.organization_id = $2 AND c.location_type = 'google_meet'
       AND a.status = 'scheduled' AND a.provider_event_id IS NULL AND a.start_at > now()
       AND COALESCE((SELECT cm.user_id FROM calendar_members cm WHERE cm.calendar_id = c.id
                     ORDER BY cm.is_primary DESC LIMIT 1), c.user_id) = $1`,
    [userId, orgId],
  );
  let fixed = 0;
  for (const a of pending) if (await ensureGoogleMeet(a.id)) fixed++;
  if (pending.length) console.log(`[google-meet] reparadas ${fixed}/${pending.length} citas sin Meet (usuario ${userId})`);
  return fixed;
}
