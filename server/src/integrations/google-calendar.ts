const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_CALENDAR_URL = 'https://www.googleapis.com/calendar/v3';

function getCredentials() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Google Calendar no configurado: faltan GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en .env');
  }
  return { clientId, clientSecret };
}

export async function refreshGoogleToken(refreshToken: string): Promise<string> {
  const { clientId, clientSecret } = getCredentials();
  const res = await fetch(GOOGLE_TOKEN_URL, {
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
  const res = await fetch(url, {
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

export async function deleteGoogleEvent(opts: {
  refreshToken: string;
  calendarId: string;
  eventId: string;
}): Promise<void> {
  const accessToken = await refreshGoogleToken(opts.refreshToken);
  const calendarId = encodeURIComponent(opts.calendarId);
  const res = await fetch(
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
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar.readonly',
    ].join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/auth?${params.toString()}`;
}

export async function exchangeGoogleCode(
  code: string,
  redirectUri: string,
): Promise<{ access_token: string; refresh_token: string; expiry_date: number }> {
  const { clientId, clientSecret } = getCredentials();
  const res = await fetch(GOOGLE_TOKEN_URL, {
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
