import { Router } from 'express';
import { query, queryOne } from '../db.ts';
import { hashPassword, verifyPassword } from '../auth/password.ts';
import { signToken } from '../auth/tokens.ts';
import { invalidateUser } from '../auth/session.ts';
import { z } from 'zod';
import { PREF_KEYS, type PrefKey } from '../services/notify.ts';

export const meRouter = Router();

interface UserRow {
  id: string; name: string; email: string; role: string;
  organization_id: string; preferences: Record<string, unknown>; permissions: string[];
  avatar_color: string | null; created_at: string; password_hash: string;
  org_name: string; must_change_password?: boolean;
}
const publicUser = (u: UserRow) => ({
  id: u.id, name: u.name, email: u.email, role: u.role,
  organizationId: u.organization_id, preferences: u.preferences ?? {}, permissions: u.permissions ?? [],
  avatarColor: u.avatar_color ?? null, createdAt: u.created_at,
  orgName: u.org_name ?? null,
  mustChangePassword: u.must_change_password === true,
});

// Datos del usuario logueado (rehidrata la sesión al recargar).
meRouter.get('/', async (req, res) => {
  const u = await queryOne<UserRow>(
    `SELECT u.id, u.name, u.email, u.role, u.organization_id, u.preferences, u.permissions,
            u.avatar_color, u.created_at, u.must_change_password, o.name AS org_name
     FROM users u
     JOIN organizations o ON o.id = u.organization_id
     WHERE u.id = $1`,
    [req.auth!.userId],
  );
  if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json(publicUser(u));
});

// Lista de organizaciones del usuario (multi-org: actualmente solo la propia).
meRouter.get('/organizations', async (req, res) => {
  const rows = await query<{ id: string; name: string; role: string }>(
    `SELECT o.id, o.name, u.role
     FROM users u
     JOIN organizations o ON o.id = u.organization_id
     WHERE u.id = $1`,
    [req.auth!.userId],
  );
  const organizations = rows.map(r => ({ ...r, is_current: true }));
  res.json({ organizations });
});

// Actualiza nombre y/o avatar_color del propio usuario.
meRouter.patch('/', async (req, res) => {
  const { name, avatarColor } = req.body ?? {};
  const fields: string[] = [];
  const vals: unknown[] = [];
  let idx = 1;

  if (typeof name === 'string' && name.trim()) {
    fields.push(`name = $${idx++}`);
    vals.push(name.trim());
  }
  if (typeof avatarColor === 'string' || avatarColor === null) {
    fields.push(`avatar_color = $${idx++}`);
    vals.push(avatarColor ?? null);
  }
  if (fields.length === 0) {
    return res.status(400).json({ error: 'No hay campos para actualizar' });
  }

  vals.push(req.auth!.userId);
  const [u] = await query<UserRow>(
    `UPDATE users SET ${fields.join(', ')} WHERE id=$${idx} RETURNING id, name, email, role, organization_id, preferences, permissions, avatar_color, created_at`,
    vals,
  );
  if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json(publicUser(u));
});

// Cambia la contraseña del propio usuario.
meRouter.post('/password', async (req, res) => {
  const { current_password, new_password } = req.body ?? {};

  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Se requieren current_password y new_password' });
  }
  if (typeof new_password !== 'string' || new_password.length < 8) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres' });
  }

  const u = await queryOne<{ password_hash: string }>(
    'SELECT password_hash FROM users WHERE id=$1',
    [req.auth!.userId],
  );
  if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });

  const valid = await verifyPassword(current_password, u.password_hash);
  // 400 y no 401: el front trata cualquier 401 como sesión caducada y cerraría la sesión
  if (!valid) return res.status(400).json({ error: 'Contraseña actual incorrecta' });
  if (current_password === new_password) return res.status(400).json({ error: 'La nueva contraseña debe ser distinta de la actual' });

  // Al cambiarla uno mismo deja de ser temporal.
  const newHash = await hashPassword(new_password);
  // token_version+1 cierra las demás sesiones abiertas; esta sigue con el token nuevo que
  // devolvemos (el front lo guarda). La agencia impersonando no cierra nada.
  const a = req.auth!;
  if (a.impersonatedByAgency) {
    await query('UPDATE users SET password_hash=$1, must_change_password=false WHERE id=$2', [newHash, a.userId]);
    return res.json({ ok: true });
  }
  const [row] = await query<{ token_version: number }>(
    'UPDATE users SET password_hash=$1, must_change_password=false, token_version=token_version+1 WHERE id=$2 RETURNING token_version',
    [newHash, a.userId],
  );
  invalidateUser(a.userId);
  const token = signToken({ userId: a.userId, organizationId: a.organizationId, role: a.role, tv: row.token_version });
  res.json({ ok: true, token });
});

// Guarda preferencias (merge superficial de claves de nivel superior).
meRouter.put('/preferences', async (req, res) => {
  const patch = req.body ?? {};
  const [u] = await query<{ preferences: Record<string, unknown> }>(
    'UPDATE users SET preferences = preferences || $1::jsonb WHERE id=$2 RETURNING preferences',
    [JSON.stringify(patch), req.auth!.userId],
  );
  res.json(u.preferences);
});

// ── Notificaciones push (app móvil) ─────────────────────────────────────────

// Registra el token FCM del dispositivo. Upsert por token: si estaba con otro usuario (otra
// sesión en el mismo teléfono) pasa al actual.
const pushTokenSchema = z.object({
  token: z.string().trim().min(10).max(4096),
  platform: z.enum(['android', 'ios']),
  device_name: z.string().trim().max(200).optional().nullable(),
});
meRouter.post('/push-tokens', async (req, res) => {
  const parsed = pushTokenSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  const { token, platform, device_name } = parsed.data;
  await query(
    `INSERT INTO push_tokens (user_id, organization_id, token, platform, device_name)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (token) DO UPDATE SET
       user_id = EXCLUDED.user_id, organization_id = EXCLUDED.organization_id,
       platform = EXCLUDED.platform, device_name = EXCLUDED.device_name, last_used_at = now()`,
    [req.auth!.userId, req.auth!.organizationId, token, platform, device_name || null],
  );
  res.status(201).json({ ok: true });
});

// Al cerrar sesión en la app: deja de recibir push en ese dispositivo (solo tokens propios)
meRouter.delete('/push-tokens', async (req, res) => {
  const parsed = z.object({ token: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  await query('DELETE FROM push_tokens WHERE token = $1 AND user_id = $2', [parsed.data.token, req.auth!.userId]);
  res.status(204).end();
});

// Preferencias de push del usuario en la org activa (por defecto todo activado)
const fullPrefs = (stored: Record<string, unknown> | undefined) =>
  Object.fromEntries(PREF_KEYS.map(k => [k, stored?.[k] !== false])) as Record<PrefKey, boolean>;

meRouter.get('/notification-prefs', async (req, res) => {
  const row = await queryOne<{ prefs: Record<string, unknown> }>(
    'SELECT prefs FROM notification_prefs WHERE user_id = $1 AND organization_id = $2',
    [req.auth!.userId, req.auth!.organizationId],
  );
  res.json({ prefs: fullPrefs(row?.prefs) });
});

// Acepta {prefs: {...}} o las claves sueltas; las que no vengan se mantienen
const prefsSchema = z.object(Object.fromEntries(PREF_KEYS.map(k => [k, z.boolean().optional()]))).strict();
meRouter.put('/notification-prefs', async (req, res) => {
  const parsed = prefsSchema.safeParse(req.body?.prefs ?? req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  const patch = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => typeof v === 'boolean'));
  const [row] = await query<{ prefs: Record<string, unknown> }>(
    `INSERT INTO notification_prefs (user_id, organization_id, prefs) VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (user_id, organization_id) DO UPDATE SET prefs = notification_prefs.prefs || EXCLUDED.prefs, updated_at = now()
     RETURNING prefs`,
    [req.auth!.userId, req.auth!.organizationId, JSON.stringify(patch)],
  );
  res.json({ prefs: fullPrefs(row.prefs) });
});
