import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db.ts';
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
  const userId = req.auth!.userId;
  const row = await queryOne<{
    timezone: string;
    working_hours: unknown;
    google_refresh_token: string | null;
    zoom_refresh_token: string | null;
  }>(
    'SELECT timezone, working_hours, google_refresh_token, zoom_refresh_token FROM calendar_settings WHERE user_id=$1',
    [userId],
  );

  if (!row) {
    return res.json({
      ...DEFAULTS,
      google_connected: false,
      zoom_connected: false,
    });
  }

  res.json({
    timezone: row.timezone,
    working_hours: row.working_hours,
    google_connected: !!row.google_refresh_token,
    zoom_connected: !!row.zoom_refresh_token,
  });
});

// ── PATCH /api/calendar/settings ─────────────────────────────────────────────
calendarSettingsRouter.patch('/settings', async (req, res) => {
  const parsed = z.object({
    timezone:      z.string().optional(),
    working_hours: z.object({
      start: z.string(),
      end:   z.string(),
      days:  z.array(z.number().int().min(0).max(6)),
    }).optional(),
  }).safeParse(req.body);

  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  const d      = parsed.data;
  const userId = req.auth!.userId;

  // Upsert: insert with defaults, update only the fields provided
  await query(
    `INSERT INTO calendar_settings (user_id, timezone, working_hours)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE
       SET timezone      = COALESCE($2::text,  calendar_settings.timezone),
           working_hours = COALESCE($3::jsonb, calendar_settings.working_hours),
           updated_at    = now()`,
    [userId, d.timezone ?? null, d.working_hours ? JSON.stringify(d.working_hours) : null],
  );

  // Return updated settings
  const row = await queryOne<{
    timezone: string;
    working_hours: unknown;
    google_refresh_token: string | null;
    zoom_refresh_token: string | null;
  }>(
    'SELECT timezone, working_hours, google_refresh_token, zoom_refresh_token FROM calendar_settings WHERE user_id=$1',
    [userId],
  );
  res.json({
    timezone: row?.timezone ?? DEFAULTS.timezone,
    working_hours: row?.working_hours ?? DEFAULTS.working_hours,
    google_connected: !!row?.google_refresh_token,
    zoom_connected: !!row?.zoom_refresh_token,
  });
});

// ── Google OAuth ──────────────────────────────────────────────────────────────
function googleRedirectUri(): string {
  return `${process.env.APP_URL ?? 'http://localhost:3100'}/api/calendar/google/callback`;
}

calendarSettingsRouter.get('/google/connect', (req, res) => {
  try {
    const state = req.auth!.userId;
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
  try {
    const tokens = await exchangeGoogleCode(code, googleRedirectUri());
    const userId = state; // state lleva el userId del CRM

    await query(
      `INSERT INTO calendar_settings (user_id, google_refresh_token, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (user_id) DO UPDATE SET google_refresh_token=$2, updated_at=now()`,
      [userId, tokens.refresh_token],
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
  await query(
    'UPDATE calendar_settings SET google_refresh_token=NULL, google_calendar_id=NULL, updated_at=now() WHERE user_id=$1',
    [userId],
  );
  res.json({ ok: true });
});

// ── Zoom OAuth ────────────────────────────────────────────────────────────────
function zoomRedirectUri(): string {
  return `${process.env.APP_URL ?? 'http://localhost:3100'}/api/calendar/zoom/callback`;
}

calendarSettingsRouter.get('/zoom/connect', (req, res) => {
  try {
    const state = req.auth!.userId;
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
  try {
    const tokens = await exchangeZoomCode(code, zoomRedirectUri());
    const userId = state;

    await query(
      `INSERT INTO calendar_settings (user_id, zoom_refresh_token, zoom_user_id, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (user_id) DO UPDATE SET zoom_refresh_token=$2, zoom_user_id=$3, updated_at=now()`,
      [userId, tokens.refresh_token, tokens.zoom_user_id],
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
  await query(
    'UPDATE calendar_settings SET zoom_refresh_token=NULL, zoom_user_id=NULL, updated_at=now() WHERE user_id=$1',
    [userId],
  );
  res.json({ ok: true });
});
