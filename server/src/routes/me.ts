import { Router } from 'express';
import { query, queryOne } from '../db.ts';
import { hashPassword, verifyPassword } from '../auth/password.ts';

export const meRouter = Router();

interface UserRow {
  id: string; name: string; email: string; role: string;
  organization_id: string; preferences: Record<string, unknown>; permissions: string[];
  avatar_color: string | null; created_at: string; password_hash: string;
  org_name: string;
}
const publicUser = (u: UserRow) => ({
  id: u.id, name: u.name, email: u.email, role: u.role,
  organizationId: u.organization_id, preferences: u.preferences ?? {}, permissions: u.permissions ?? [],
  avatarColor: u.avatar_color ?? null, createdAt: u.created_at,
  orgName: u.org_name ?? null,
});

// Datos del usuario logueado (rehidrata la sesión al recargar).
meRouter.get('/', async (req, res) => {
  const u = await queryOne<UserRow>(
    `SELECT u.id, u.name, u.email, u.role, u.organization_id, u.preferences, u.permissions,
            u.avatar_color, u.created_at, o.name AS org_name
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
  if (!valid) return res.status(401).json({ error: 'Contraseña actual incorrecta' });

  const newHash = await hashPassword(new_password);
  await query('UPDATE users SET password_hash=$1 WHERE id=$2', [newHash, req.auth!.userId]);

  res.json({ ok: true });
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
