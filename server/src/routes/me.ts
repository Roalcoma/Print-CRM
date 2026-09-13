import { Router } from 'express';
import { query, queryOne } from '../db.ts';
import { signToken } from '../auth/tokens.ts';

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

// Lista las organizaciones a las que pertenece el usuario logueado.
meRouter.get('/organizations', async (req, res) => {
  const rows = await query<{ id: string; name: string; role: string; is_current: boolean }>(
    `SELECT o.id, o.name, uo.role,
            (o.id = $2) AS is_current
     FROM   user_organizations uo
     JOIN   organizations o ON o.id = uo.organization_id
     WHERE  uo.user_id = $1
     ORDER  BY o.name`,
    [req.auth!.userId, req.auth!.organizationId],
  );
  res.json({ organizations: rows });
});

// Cambia la organización activa del usuario (multi-CRM sin impersonación).
meRouter.post('/switch-org', async (req, res) => {
  const { organizationId } = req.body ?? {};
  if (!organizationId) return res.status(400).json({ error: 'organizationId requerido' });

  const membership = await queryOne<{ role: string }>(
    'SELECT role FROM user_organizations WHERE user_id = $1 AND organization_id = $2',
    [req.auth!.userId, organizationId],
  );
  if (!membership) return res.status(403).json({ error: 'No tienes acceso a esa organización' });

  const token = signToken({
    userId: req.auth!.userId,
    organizationId,
    role: membership.role,
  });
  res.json({ token });
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
