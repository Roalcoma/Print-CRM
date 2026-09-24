import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db.ts';
import { requireAdmin } from '../auth/perms.ts';
import {
  getGoogleAuthUrl,
  exchangeGoogleCode,
} from '../integrations/google-calendar.ts';
import {
  getZoomAuthUrl,
  exchangeZoomCode,
} from '../integrations/zoom.ts';

export const calendarSettingsRouter = Router();

// Router público (sin requireAuth) — solo los callbacks de OAuth
export const calendarPublicRouter = Router();

const DEFAULTS = {
  timezone: 'America/Caracas',
  working_hours: { start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5] },
};

// ── GET /api/calendar/settings ───────────────────────────────────────────────
calendarSettingsRouter.get('/settings', async (req, res) => {
  const orgId      = req.auth!.organizationId;
  const forUserId  = typeof req.query.forUserId === 'string' ? req.query.forUserId : null;
  // Solo admin puede consultar ajustes de otro usuario
  if (forUserId && forUserId !== req.auth!.userId) {
    const userRow = await queryOne<{ role: string }>('SELECT role FROM users WHERE id=$1', [req.auth!.userId]);
    if (!userRow || (userRow.role !== 'owner' && userRow.role !== 'admin')) {
      return res.status(403).json({ error: 'Requiere rol de administrador' });
    }
  }
  const userId = forUserId ?? req.auth!.userId;
  const row = await queryOne<{
    timezone: string;
    working_hours: unknown;
    google_refresh_token: string | null;
    zoom_refresh_token: string | null;
  }>(
    'SELECT timezone, working_hours, google_refresh_token, zoom_refresh_token FROM calendar_settings WHERE user_id=$1 AND organization_id=$2',
    [userId, orgId],
  );

  const overrideRows = await query<{
    id: string; override_date: string; is_available: boolean;
    start_time: string | null; end_time: string | null;
  }>(
    'SELECT id, override_date::text, is_available, start_time::text, end_time::text FROM calendar_availability_overrides WHERE organization_id=$1 AND user_id=$2 ORDER BY override_date',
    [orgId, userId],
  );

  if (!row) {
    return res.json({
      ...DEFAULTS,
      google_connected: false,
      zoom_connected: false,
      overrides: overrideRows,
    });
  }

  res.json({
    timezone:         row.timezone,
    working_hours:    row.working_hours,
    google_connected: !!row.google_refresh_token,
    zoom_connected:   !!row.zoom_refresh_token,
    overrides:        overrideRows,
  });
});

// ── PATCH /api/calendar/settings ─────────────────────────────────────────────
calendarSettingsRouter.patch('/settings', async (req, res) => {
  const WorkingHoursDaySchema = z.object({
    enabled: z.boolean(),
    start:   z.string(),
    end:     z.string(),
  });
  const OverrideSchema = z.object({
    id:            z.string().uuid().optional(),
    override_date: z.string(),
    is_available:  z.boolean(),
    start_time:    z.string().nullable().optional(),
    end_time:      z.string().nullable().optional(),
  });
  const parsed = z.object({
    timezone:      z.string().optional(),
    working_hours: z.record(WorkingHoursDaySchema).optional(),
    overrides:     z.array(OverrideSchema).optional(),
  }).safeParse(req.body);

  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  const d          = parsed.data;
  const orgId      = req.auth!.organizationId;
  const forUserId  = typeof req.query.forUserId === 'string' ? req.query.forUserId : null;
  if (forUserId && forUserId !== req.auth!.userId) {
    const userRow = await queryOne<{ role: string }>('SELECT role FROM users WHERE id=$1', [req.auth!.userId]);
    if (!userRow || (userRow.role !== 'owner' && userRow.role !== 'admin')) {
      return res.status(403).json({ error: 'Requiere rol de administrador' });
    }
  }
  const userId = forUserId ?? req.auth!.userId;

  await query(
    `INSERT INTO calendar_settings (user_id, organization_id, timezone, working_hours)
     VALUES ($1, $2, COALESCE($3, 'America/Caracas'), COALESCE($4::jsonb, '{"end":"18:00","days":[1,2,3,4,5],"start":"09:00"}'::jsonb))
     ON CONFLICT (user_id, organization_id) DO UPDATE
       SET timezone      = COALESCE($3::text,  calendar_settings.timezone),
           working_hours = COALESCE($4::jsonb, calendar_settings.working_hours),
           updated_at    = now()`,
    [userId, orgId, d.timezone ?? null, d.working_hours ? JSON.stringify(d.working_hours) : null],
  );

  if (d.overrides !== undefined) {
    await query(
      'DELETE FROM calendar_availability_overrides WHERE organization_id=$1 AND user_id=$2',
      [orgId, userId],
    );
    for (const ov of d.overrides) {
      await query(
        `INSERT INTO calendar_availability_overrides (organization_id, user_id, override_date, is_available, start_time, end_time)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (organization_id, user_id, override_date) DO UPDATE
           SET is_available=$4, start_time=$5, end_time=$6`,
        [orgId, userId, ov.override_date, ov.is_available, ov.start_time ?? null, ov.end_time ?? null],
      );
    }
  }

  const row = await queryOne<{
    timezone: string;
    working_hours: unknown;
    google_refresh_token: string | null;
    zoom_refresh_token: string | null;
  }>(
    'SELECT timezone, working_hours, google_refresh_token, zoom_refresh_token FROM calendar_settings WHERE user_id=$1 AND organization_id=$2',
    [userId, orgId],
  );
  res.json({
    timezone:        row?.timezone ?? DEFAULTS.timezone,
    working_hours:   row?.working_hours ?? DEFAULTS.working_hours,
    google_connected: !!row?.google_refresh_token,
    zoom_connected:   !!row?.zoom_refresh_token,
  });
});

// ── Google OAuth ──────────────────────────────────────────────────────────────
function googleRedirectUri(): string {
  return `${process.env.APP_URL ?? 'http://localhost:3100'}/api/calendar/google/callback`;
}

calendarSettingsRouter.get('/google/connect', (req, res) => {
  try {
    const state = `${req.auth!.userId}:${req.auth!.organizationId}`;
    const url   = getGoogleAuthUrl(googleRedirectUri(), state);
    res.json({ url });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: 'No configurado', message: msg });
  }
});

// Callback público — Google redirige aquí, no lleva JWT
calendarPublicRouter.get('/google/callback', async (req, res) => {
  const { code, state } = req.query;
  if (typeof code !== 'string' || typeof state !== 'string') {
    return res.status(400).json({ error: 'Parámetros inválidos' });
  }
  // state = "userId:organizationId"
  const [userId, orgId] = state.split(':');
  if (!userId || !orgId) return res.status(400).json({ error: 'State inválido' });

  try {
    const tokens = await exchangeGoogleCode(code, googleRedirectUri());

    await query(
      `INSERT INTO calendar_settings (user_id, organization_id, google_refresh_token, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (user_id, organization_id) DO UPDATE SET google_refresh_token=$3, updated_at=now()`,
      [userId, orgId, tokens.refresh_token],
    );

    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5175';
    res.redirect(`${frontendUrl}/settings/calendar?connected=google`);
  } catch (err) {
    console.error('Google OAuth callback error:', err);
    res.status(500).json({ error: 'Error al conectar Google Calendar' });
  }
});

calendarSettingsRouter.get('/google/disconnect', async (req, res) => {
  const userId = req.auth!.userId;
  const orgId  = req.auth!.organizationId;
  await query(
    'UPDATE calendar_settings SET google_refresh_token=NULL, google_calendar_id=NULL, updated_at=now() WHERE user_id=$1 AND organization_id=$2',
    [userId, orgId],
  );
  res.json({ ok: true });
});

// ── Zoom OAuth ────────────────────────────────────────────────────────────────
function zoomRedirectUri(): string {
  return `${process.env.APP_URL ?? 'http://localhost:3100'}/api/calendar/zoom/callback`;
}

calendarSettingsRouter.get('/zoom/connect', (req, res) => {
  try {
    const state = `${req.auth!.userId}:${req.auth!.organizationId}`;
    const url   = getZoomAuthUrl(zoomRedirectUri(), state);
    res.json({ url });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: 'No configurado', message: msg });
  }
});

// Callback público — Zoom redirige aquí, no lleva JWT
calendarPublicRouter.get('/zoom/callback', async (req, res) => {
  const { code, state } = req.query;
  if (typeof code !== 'string' || typeof state !== 'string') {
    return res.status(400).json({ error: 'Parámetros inválidos' });
  }
  // state = "userId:organizationId"
  const [userId, orgId] = state.split(':');
  if (!userId || !orgId) return res.status(400).json({ error: 'State inválido' });

  try {
    const tokens = await exchangeZoomCode(code, zoomRedirectUri());

    await query(
      `INSERT INTO calendar_settings (user_id, organization_id, zoom_refresh_token, zoom_user_id, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (user_id, organization_id) DO UPDATE SET zoom_refresh_token=$3, zoom_user_id=$4, updated_at=now()`,
      [userId, orgId, tokens.refresh_token, tokens.zoom_user_id],
    );

    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5175';
    res.redirect(`${frontendUrl}/settings/calendar?connected=zoom`);
  } catch (err) {
    console.error('Zoom OAuth callback error:', err);
    res.status(500).json({ error: 'Error al conectar Zoom' });
  }
});

calendarSettingsRouter.get('/zoom/disconnect', async (req, res) => {
  const userId = req.auth!.userId;
  const orgId  = req.auth!.organizationId;
  await query(
    'UPDATE calendar_settings SET zoom_refresh_token=NULL, zoom_user_id=NULL, updated_at=now() WHERE user_id=$1 AND organization_id=$2',
    [userId, orgId],
  );
  res.json({ ok: true });
});
