import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db.ts';
import { hashPassword } from '../auth/password.ts';
import { requireAdmin, MODULES } from '../auth/perms.ts';

export const usersRouter = Router();

const permsSchema = z.array(z.enum(MODULES)).optional();

interface UserRow {
  id: string; name: string; email: string; role: string;
  permissions: string[]; created_at: string;
}
const publicUser = (u: UserRow) => ({
  id: u.id, name: u.name, email: u.email, role: u.role,
  permissions: u.permissions ?? [], created_at: u.created_at,
});

// Lista de usuarios de la organización (disponible para cualquier autenticado:
// el select de "Responsable" la usa). Incluye permisos para la pantalla de ajustes.
usersRouter.get('/', async (req, res) => {
  const orgId = req.auth!.organizationId;
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const limit = Math.min(Number(req.query.limit) || 100, 100);

  let rows: UserRow[];
  if (q) {
    rows = await query<UserRow>(
      `SELECT id, name, email, role, permissions, created_at FROM users
       WHERE organization_id = $1 AND (name ILIKE $2 OR email ILIKE $2)
       ORDER BY name LIMIT $3`,
      [orgId, `%${q}%`, limit],
    );
  } else {
    rows = await query<UserRow>(
      'SELECT id, name, email, role, permissions, created_at FROM users WHERE organization_id = $1 ORDER BY created_at LIMIT $2',
      [orgId, limit],
    );
  }
  res.json(rows.map(publicUser));
});

// ── Crear usuario (solo admin) ────────────────────────────────────────────────
const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['admin', 'member']),
  permissions: permsSchema,
});

usersRouter.post('/', requireAdmin, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  const { name, email, password, role, permissions } = parsed.data;

  const existing = await queryOne('SELECT id FROM users WHERE email = $1', [email]);
  if (existing) return res.status(409).json({ error: 'Ese email ya está registrado' });

  const hash = await hashPassword(password);
  const [u] = await query<UserRow>(
    `INSERT INTO users (organization_id, name, email, password_hash, role, permissions)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb) RETURNING id, name, email, role, permissions, created_at`,
    [req.auth!.organizationId, name, email, hash, role, JSON.stringify(permissions ?? [])],
  );
  res.status(201).json(publicUser(u));
});

// ── Editar usuario (solo admin) ───────────────────────────────────────────────
const updateSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(['admin', 'member']).optional(),
  permissions: permsSchema,
  password: z.string().min(8).optional(),
});

usersRouter.patch('/:id', requireAdmin, async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  const orgId = req.auth!.organizationId;

  const target = await queryOne<{ role: string }>('SELECT role FROM users WHERE id=$1 AND organization_id=$2', [req.params.id, orgId]);
  if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (target.role === 'owner') return res.status(403).json({ error: 'No se puede modificar al owner' });

  const sets: string[] = [];
  const values: unknown[] = [];
  const d = parsed.data;
  if (d.name !== undefined) { sets.push(`name = $${sets.length + 1}`); values.push(d.name); }
  if (d.role !== undefined) { sets.push(`role = $${sets.length + 1}`); values.push(d.role); }
  if (d.permissions !== undefined) { sets.push(`permissions = $${sets.length + 1}::jsonb`); values.push(JSON.stringify(d.permissions)); }
  if (d.password !== undefined) { sets.push(`password_hash = $${sets.length + 1}`); values.push(await hashPassword(d.password)); }
  if (sets.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });

  const [u] = await query<UserRow>(
    `UPDATE users SET ${sets.join(', ')} WHERE id = $${values.length + 1} AND organization_id = $${values.length + 2}
     RETURNING id, name, email, role, permissions, created_at`,
    [...values, req.params.id, orgId],
  );
  res.json(publicUser(u));
});

// ── Eliminar usuario (solo admin; no a sí mismo ni al owner) ──────────────────
usersRouter.delete('/:id', requireAdmin, async (req, res) => {
  if (req.params.id === req.auth!.userId) return res.status(400).json({ error: 'No puedes eliminarte a ti mismo' });
  const target = await queryOne<{ role: string }>('SELECT role FROM users WHERE id=$1 AND organization_id=$2', [req.params.id, req.auth!.organizationId]);
  if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (target.role === 'owner') return res.status(403).json({ error: 'No se puede eliminar al owner' });
  await query('DELETE FROM users WHERE id=$1 AND organization_id=$2', [req.params.id, req.auth!.organizationId]);
  res.status(204).end();
});
