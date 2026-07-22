import { Router } from 'express';
import { query, queryOne } from '../db.ts';

export const meRouter = Router();

interface UserRow {
  id: string; name: string; email: string; role: string;
  organization_id: string; preferences: Record<string, unknown>; permissions: string[];
}
const publicUser = (u: UserRow) => ({
  id: u.id, name: u.name, email: u.email, role: u.role,
  organizationId: u.organization_id, preferences: u.preferences ?? {}, permissions: u.permissions ?? [],
});

// Datos del usuario logueado (rehidrata la sesión al recargar).
meRouter.get('/', async (req, res) => {
  const u = await queryOne<UserRow>(
    'SELECT id, name, email, role, organization_id, preferences, permissions FROM users WHERE id=$1',
    [req.auth!.userId],
  );
  if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json(publicUser(u));
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
