import { query } from '../db.ts';
import { broadcast } from '../services/ws-manager.ts';
import { fetchWithTimeout } from '../http.ts';

// Overrides por entorno solo para los tests (apuntan a un Google simulado)
const GOOGLE_TOKEN_URL = process.env.GOOGLE_TOKEN_URL ?? 'https://oauth2.googleapis.com/token';
const GOOGLE_CALENDAR_URL = `${process.env.GOOGLE_API_URL ?? 'https://www.googleapis.com'}/calendar/v3`;

function getCredentials() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Google Calendar no configurado: faltan GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en .env');
  }
  return { clientId, clientSecret };
}

// Google revocó o caducó el permiso: se marca como desconectado (el CRM deja de fingir que
// está conectado) y se avisa a los admins para que lo reconecten. Solo avisa una vez.
async function markGoogleDisconnected(refreshToken: string): Promise<void> {
  // Los tokens se guardan cifrados (IV aleatorio): se busca comparando ya descifrados
  const all = await query<{ user_id: string; organization_id: string; google_refresh_token: string }>(
    'SELECT user_id, organization_id, google_refresh_token FROM calendar_settings WHERE google_refresh_token IS NOT NULL',
  );
  const match = all.find(r => r.google_refresh_token === refreshToken);
  if (!match) return;
  const [row] = await query<{ user_id: string; organization_id: string; name: string; email: string }>(
    `UPDATE calendar_settings cs SET google_refresh_token = NULL, updated_at = now()
     FROM users u WHERE u.id = cs.user_id AND cs.user_id = $1 AND cs.organization_id = $2
     RETURNING cs.user_id, cs.organization_id, u.name, u.email`,
    [match.user_id, match.organization_id],
  );
  if (!row) return;
  console.error(`[google] permiso revocado/caducado para ${row.email}: Google Calendar marcado como desconectado`);
  const admins = await query<{ id: string }>(
    `SELECT id FROM users WHERE organization_id = $1 AND (role IN ('owner','admin') OR id = $2)`,
    [row.organization_id, row.user_id],
  );
  for (const a of admins) {
    await query(
      `INSERT INTO notifications (organization_id, user_id, type, title, body)
       VALUES ($1, $2, 'system', $3, $4)`,
      [row.organization_id, a.id, 'Google Calendar se desconectó',
       `Google rechazó el permiso de ${row.name} (${row.email}). Las citas nuevas no tendrán enlace de Meet hasta que se reconecte en Mi Perfil → Conexiones → Google Calendar. Al reconectar, las citas pendientes recibirán su Meet automáticamente.`],
    );
    broadcast(row.organization_id, 'notification:new', { userId: a.id });
  }
}

export async function refreshGoogleToken(refreshToken: string): Promise<string> {
  const { clientId, clientSecret } = getCredentials();
  const res = await fetchWithTimeout(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    if (err.includes('invalid_grant')) await markGoogleDisconnected(refreshToken).catch(console.error);
    throw new Error(`Google token refresh failed: ${err}`);
  }
  const data = await res.json() as { access_token: string };
  return data.access_token;
}

export async function createGoogleEvent(opts: {
  refreshToken: string;
  calendarId: string;
  title: string;
  description?: string;
  startAt: Date;
  endAt: Date;
  timezone: string;
  isAllDay?: boolean;
  attendeeEmails?: string[];
  createMeet?: boolean;
}): Promise<{ eventId: string; htmlLink: string; meetLink?: string }> {
  const accessToken = await refreshGoogleToken(opts.refreshToken);

  const body: Record<string, unknown> = {
    summary: opts.title,
    description: opts.description ?? '',
  };

  if (opts.isAllDay) {
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    body.start = { date: fmt(opts.startAt) };
    body.end   = { date: fmt(opts.endAt) };
  } else {
    body.start = { dateTime: opts.startAt.toISOString(), timeZone: opts.timezone };
    body.end   = { dateTime: opts.endAt.toISOString(),   timeZone: opts.timezone };
  }

  if (opts.attendeeEmails?.length) {
    body.attendees = opts.attendeeEmails.map(email => ({ email }));
  }

  // Google Meet automático
  if (opts.createMeet) {
    body.conferenceData = {
      createRequest: {
        requestId: `crm-${Date.now()}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    };
  }

  const calendarId = encodeURIComponent(opts.calendarId);
  // conferenceDataVersion=1 es necesario para que Google cree el Meet
  const url = `${GOOGLE_CALENDAR_URL}/calendars/${calendarId}/events?conferenceDataVersion=1&sendUpdates=all`;
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google createEvent failed: ${err}`);
  }
  const data = await res.json() as {
    id: string;
    htmlLink: string;
    conferenceData?: { entryPoints?: Array<{ entryPointType: string; uri: string }> };
  };

  const meetLink = data.conferenceData?.entryPoints
    ?.find(ep => ep.entryPointType === 'video')?.uri;

  return { eventId: data.id, htmlLink: data.htmlLink, meetLink };
}

export async function updateGoogleEvent(opts: {
  refreshToken: string;
  calendarId: string;
  eventId: string;
  title?: string;
  description?: string;
  startAt?: Date;
  endAt?: Date;
  timezone?: string;
  isAllDay?: boolean;
  cancelled?: boolean;
}): Promise<void> {
  const accessToken = await refreshGoogleToken(opts.refreshToken);
  const calId = encodeURIComponent(opts.calendarId);
  const body: Record<string, unknown> = {};
  if (opts.title !== undefined) body.summary = opts.title;
  if (opts.description !== undefined) body.description = opts.description;
  if (opts.cancelled) body.status = 'cancelled';
  if (opts.startAt && opts.endAt) {
    if (opts.isAllDay) {
      const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      body.start = { date: fmt(opts.startAt) };
      body.end   = { date: fmt(opts.endAt) };
    } else {
      body.start = { dateTime: opts.startAt.toISOString(), timeZone: opts.timezone ?? 'UTC' };
      body.end   = { dateTime: opts.endAt.toISOString(),   timeZone: opts.timezone ?? 'UTC' };
    }
  }
  if (Object.keys(body).length === 0) return;
  const res = await fetchWithTimeout(
    `${GOOGLE_CALENDAR_URL}/calendars/${calId}/events/${opts.eventId}?sendUpdates=all`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    const err = await res.text();
    throw new Error(`Google updateEvent failed: ${err}`);
  }
}

export async function getGoogleEvents(opts: {
  refreshToken: string;
  calendarId: string;
  timeMin: Date;
  timeMax: Date;
}): Promise<Array<{
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  isAllDay: boolean;
  meetLink?: string;
  htmlLink: string;
}>> {
  const accessToken = await refreshGoogleToken(opts.refreshToken);
  const calId = encodeURIComponent(opts.calendarId);
  const params = new URLSearchParams({
    timeMin: opts.timeMin.toISOString(),
    timeMax: opts.timeMax.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '500',
  });
  const res = await fetchWithTimeout(`${GOOGLE_CALENDAR_URL}/calendars/${calId}/events?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return [];
  const data = await res.json() as {
    items: Array<{
      id: string;
      summary?: string;
      start: { dateTime?: string; date?: string };
      end:   { dateTime?: string; date?: string };
      htmlLink: string;
      status?: string;
      conferenceData?: { entryPoints?: Array<{ entryPointType: string; uri: string }> };
    }>;
  };
  return (data.items ?? [])
    .filter(e => e.status !== 'cancelled')
    .map(e => ({
      id:       e.id,
      title:    e.summary ?? '(sin título)',
      startAt:  e.start.dateTime ?? e.start.date ?? '',
      endAt:    e.end.dateTime   ?? e.end.date   ?? '',
      isAllDay: !e.start.dateTime,
      meetLink: e.conferenceData?.entryPoints?.find(ep => ep.entryPointType === 'video')?.uri,
      htmlLink: e.htmlLink,
    }));
}

export async function deleteGoogleEvent(opts: {
  refreshToken: string;
  calendarId: string;
  eventId: string;
}): Promise<void> {
  const accessToken = await refreshGoogleToken(opts.refreshToken);
  const calendarId = encodeURIComponent(opts.calendarId);
  const res = await fetchWithTimeout(
    `${GOOGLE_CALENDAR_URL}/calendars/${calendarId}/events/${opts.eventId}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    const err = await res.text();
    throw new Error(`Google deleteEvent failed: ${err}`);
  }
}

export function getGoogleAuthUrl(redirectUri: string, state: string): string {
  const { clientId } = getCredentials();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: [
      // Mínimos necesarios (verificación de Google): eventos de los calendarios propios del usuario
      // (el CRM siempre usa su calendario principal) + solo ocupado/libre
      'https://www.googleapis.com/auth/calendar.events.owned',
      'https://www.googleapis.com/auth/calendar.events.freebusy',
    ].join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/auth?${params.toString()}`;
}

export async function getGoogleFreebusy(opts: {
  refreshToken: string;
  calendarId: string;
  timeMin: Date;
  timeMax: Date;
}): Promise<Array<{ start: string; end: string }>> {
  const accessToken = await refreshGoogleToken(opts.refreshToken);
  const res = await fetchWithTimeout(`${GOOGLE_CALENDAR_URL}/freeBusy`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      timeMin: opts.timeMin.toISOString(),
      timeMax: opts.timeMax.toISOString(),
      items: [{ id: opts.calendarId }],
    }),
  });
  if (!res.ok) return [];
  const data = await res.json() as {
    calendars: Record<string, { busy: Array<{ start: string; end: string }> }>;
  };
  return data.calendars[opts.calendarId]?.busy ?? [];
}

export async function exchangeGoogleCode(
  code: string,
  redirectUri: string,
): Promise<{ access_token: string; refresh_token: string; expiry_date: number }> {
  const { clientId, clientSecret } = getCredentials();
  const res = await fetchWithTimeout(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google code exchange failed: ${err}`);
  }
  const data = await res.json() as { access_token: string; refresh_token: string; expires_in: number };
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expiry_date: Date.now() + data.expires_in * 1000,
  };
}
