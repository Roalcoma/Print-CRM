import { Router } from 'express';
import { randomBytes } from 'node:crypto';
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

// Límite de usuarios según el plan asignado por la agencia. plans.max_users son usuarios
// extra además del owner (>= 999 = ilimitado) + usuarios de cortesía. Sin plan → sin límite.
export async function userLimit(orgId: string) {
  const row = await queryOne<{ used: number; max_users: number | null; courtesy: number | null }>(
    `SELECT (SELECT count(*)::int FROM users WHERE organization_id = $1) AS used,
            p.max_users, ac.courtesy_extra_users AS courtesy
     FROM (SELECT 1) x
     LEFT JOIN agency_clients ac ON ac.organization_id = $1
     LEFT JOIN plans p ON p.id = ac.plan_id
     ORDER BY ac.created_at LIMIT 1`,
    [orgId],
  );
  const used = row?.used ?? 0;
  if (row?.max_users == null || row.max_users >= 999) return { used, max: null as number | null };
  return { used, max: 1 + row.max_users + (row.courtesy ?? 0) };
}

usersRouter.get('/limit', async (req, res) => {
  res.json(await userLimit(req.auth!.organizationId));
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
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8),
  role: z.enum(['admin', 'member']),
  permissions: permsSchema,
});

usersRouter.post('/', requireAdmin, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  const { name, email, password, role, permissions } = parsed.data;

  const existing = await queryOne('SELECT id FROM users WHERE lower(email) = $1', [email]);
  if (existing) return res.status(409).json({ error: 'Ese email ya está registrado' });

  // Aplica también a la agencia impersonando: el límite se amplía cambiando plan o cortesía.
  const { used, max } = await userLimit(req.auth!.organizationId);
  if (max !== null && used >= max) {
    return res.status(409).json({
      error: `Tu plan permite ${max} usuario${max === 1 ? '' : 's'} y ya tienes ${used}. Pide a tu agencia ampliar el plan para añadir más.`,
    });
  }

  // La contraseña la define el admin: el usuario debe cambiarla al entrar.
  const hash = await hashPassword(password);
  const [u] = await query<UserRow>(
    `INSERT INTO users (organization_id, name, email, password_hash, role, permissions, must_change_password)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,true) RETURNING id, name, email, role, permissions, created_at`,
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
  const isSelf = req.auth!.userId === req.params.id;
  const isAgency = req.auth!.impersonatedByAgency === true;
  if (target.role === 'owner' && !isSelf && !isAgency) return res.status(403).json({ error: 'No se puede modificar al owner' });

  const sets: string[] = [];
  const values: unknown[] = [];
  const d = parsed.data;
  if (d.name !== undefined) { sets.push(`name = $${sets.length + 1}`); values.push(d.name); }
  if (target.role !== 'owner') {
    if (d.role !== undefined) { sets.push(`role = $${sets.length + 1}`); values.push(d.role); }
    if (d.permissions !== undefined) { sets.push(`permissions = $${sets.length + 1}::jsonb`); values.push(JSON.stringify(d.permissions)); }
  }
  if (d.password !== undefined) {
    sets.push(`password_hash = $${sets.length + 1}`); values.push(await hashPassword(d.password));
    // Si la cambia otro (admin/agencia), es temporal: obligar a cambiarla al entrar.
    sets.push(`must_change_password = $${sets.length + 1}`); values.push(!isSelf);
  }
  if (sets.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });

  const [u] = await query<UserRow>(
    `UPDATE users SET ${sets.join(', ')} WHERE id = $${values.length + 1} AND organization_id = $${values.length + 2}
     RETURNING id, name, email, role, permissions, created_at`,
    [...values, req.params.id, orgId],
  );
  res.json(publicUser(u));
});

// ── Restablecer contraseña (solo admin) ───────────────────────────────────────
// Define (o genera) una contraseña temporal, la devuelve UNA vez y obliga a cambiarla.
// No hay correo: el admin se la pasa al usuario por su cuenta.
const resetSchema = z.object({ password: z.string().min(8).optional() });

usersRouter.post('/:id/reset-password', requireAdmin, async (req, res) => {
  const parsed = resetSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  const orgId = req.auth!.organizationId;
  const target = await queryOne<{ role: string }>('SELECT role FROM users WHERE id=$1 AND organization_id=$2', [req.params.id, orgId]);
  if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (req.params.id === req.auth!.userId) return res.status(400).json({ error: 'Cambia tu propia contraseña desde Mi perfil' });
  if (target.role === 'owner' && req.auth!.impersonatedByAgency !== true) {
    return res.status(403).json({ error: 'No se puede modificar al owner' });
  }
  const password = parsed.data.password ?? randomBytes(9).toString('base64url');
  await query('UPDATE users SET password_hash=$1, must_change_password=true WHERE id=$2 AND organization_id=$3',
    [await hashPassword(password), req.params.id, orgId]);
  res.json({ password });
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
