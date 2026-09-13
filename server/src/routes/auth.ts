import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db.ts';
import { hashPassword, verifyPassword } from '../auth/password.ts';
import { signToken } from '../auth/tokens.ts';
import { audit } from '../audit.ts';

export const authRouter = Router();

interface UserRow {
  id: string;
  organization_id: string;
  email: string;
  password_hash: string;
  name: string;
  role: string;
  preferences?: Record<string, unknown>;
  permissions?: string[];
}

// Registro: crea organización + usuario owner en una transacción lógica simple.
const registerSchema = z.object({
  organizationName: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});

authRouter.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  const { organizationName, name, email, password } = parsed.data;

  const existing = await queryOne('SELECT id FROM users WHERE email = $1', [email]);
  if (existing) return res.status(409).json({ error: 'Ese email ya está registrado' });

  const [org] = await query<{ id: string }>(
    'INSERT INTO organizations (name) VALUES ($1) RETURNING id',
    [organizationName],
  );
  const hash = await hashPassword(password);
  const [user] = await query<UserRow>(
    `INSERT INTO users (organization_id, email, password_hash, name, role)
     VALUES ($1, $2, $3, $4, 'owner') RETURNING *`,
    [org.id, email, hash, name],
  );

  const token = signToken({ userId: user.id, organizationId: user.organization_id, role: user.role });
  res.status(201).json({ token, user: publicUser(user) });
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  const { email, password } = parsed.data;

  const user = await queryOne<UserRow>('SELECT * FROM users WHERE email = $1', [email]);
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  const token = signToken({ userId: user.id, organizationId: user.organization_id, role: user.role });
  // req.auth no existe aún en login, lo poblamos manualmente para el audit
  req.auth = { userId: user.id, organizationId: user.organization_id, role: user.role };
  audit({ req, action: 'login', entityType: 'user', entityId: user.id, entityName: user.name });
  res.json({ token, user: publicUser(user) });
});

function publicUser(u: UserRow) {
  return { id: u.id, email: u.email, name: u.name, role: u.role, organizationId: u.organization_id, preferences: u.preferences ?? {}, permissions: u.permissions ?? [] };
}

