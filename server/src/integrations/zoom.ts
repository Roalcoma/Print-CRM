const ZOOM_TOKEN_URL = 'https://zoom.us/oauth/token';
const ZOOM_API_URL = 'https://api.zoom.us/v2';

function getCredentials() {
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Zoom no configurado: faltan ZOOM_CLIENT_ID y ZOOM_CLIENT_SECRET en .env');
  }
  return { clientId, clientSecret };
}

function basicAuth(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
}

export async function refreshZoomToken(refreshToken: string): Promise<string> {
  const { clientId, clientSecret } = getCredentials();
  const res = await fetch(
    `${ZOOM_TOKEN_URL}?grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
    {
      method: 'POST',
      headers: {
        Authorization: basicAuth(clientId, clientSecret),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    },
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Zoom token refresh failed: ${err}`);
  }
  const data = await res.json() as { access_token: string };
  return data.access_token;
}

export async function createZoomMeeting(opts: {
  refreshToken: string;
  title: string;
  startAt: Date;
  durationMinutes: number;
  timezone: string;
}): Promise<{ meetingId: string; joinUrl: string; hostUrl: string }> {
  const accessToken = await refreshZoomToken(opts.refreshToken);
  const res = await fetch(`${ZOOM_API_URL}/users/me/meetings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      topic: opts.title,
      type: 2, // scheduled meeting
      start_time: opts.startAt.toISOString().replace('.000Z', 'Z'),
      duration: opts.durationMinutes,
      timezone: opts.timezone,
      settings: {
        join_before_host: true,
        waiting_room: false,
      },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Zoom createMeeting failed: ${err}`);
  }
  const data = await res.json() as { id: number; join_url: string; start_url: string };
  return {
    meetingId: String(data.id),
    joinUrl: data.join_url,
    hostUrl: data.start_url,
  };
}

export async function deleteZoomMeeting(opts: {
  refreshToken: string;
  meetingId: string;
}): Promise<void> {
  const accessToken = await refreshZoomToken(opts.refreshToken);
  const res = await fetch(`${ZOOM_API_URL}/meetings/${opts.meetingId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 404) {
    const err = await res.text();
    throw new Error(`Zoom deleteMeeting failed: ${err}`);
  }
}

export function getZoomAuthUrl(redirectUri: string, state: string): string {
  const { clientId } = getCredentials();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    state,
  });
  return `https://zoom.us/oauth/authorize?${params.toString()}`;
}

export async function exchangeZoomCode(
  code: string,
  redirectUri: string,
): Promise<{ access_token: string; refresh_token: string; zoom_user_id: string }> {
  const { clientId, clientSecret } = getCredentials();
  const res = await fetch(
    `${ZOOM_TOKEN_URL}?grant_type=authorization_code&code=${encodeURIComponent(code)}&redirect_uri=${encodeURIComponent(redirectUri)}`,
    {
      method: 'POST',
      headers: {
        Authorization: basicAuth(clientId, clientSecret),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    },
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Zoom code exchange failed: ${err}`);
  }
  const data = await res.json() as { access_token: string; refresh_token: string };

  // Fetch user ID
  const userRes = await fetch(`${ZOOM_API_URL}/users/me`, {
    headers: { Authorization: `Bearer ${data.access_token}` },
  });
  const userData = userRes.ok
    ? (await userRes.json() as { id: string })
    : { id: '' };

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    zoom_user_id: userData.id,
  };
}
