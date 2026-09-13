import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { query, queryOne, pool } from '../db.ts';
import { hashPassword, verifyPassword } from '../auth/password.ts';
import { env } from '../env.ts';

export const agencyRouter = Router();

// ─── Types ───────────────────────────────────────────────────────────────────

interface AgencyClaims {
  type: 'agency';
  adminId: string;
  role: string;
}

interface AgencyAdminRow {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  role: string;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

interface AgencyClientRow {
  id: string;
  organization_id: string | null;
  name: string;
  company: string | null;
  email: string;
  phone: string | null;
  country: string | null;
  plan: string;
  plan_id: string | null;
  status: string;
  type: 'own' | 'client';
  trial_ends_at: string | null;
  monthly_value: string;
  notes: string | null;
  courtesy_extra_users: number;
  courtesy_full_access: boolean;
  created_at: string;
  updated_at: string;
}

// Augment Express request to carry agency claims
declare global {
  // eslint-disable-next-line no-var
  namespace Express {
    interface Request {
      agencyAuth?: AgencyClaims;
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function signAgencyToken(claims: Omit<AgencyClaims, 'type'>): string {
  return jwt.sign({ type: 'agency', ...claims }, env.jwtSecret, { expiresIn: '30d' });
}

function verifyAgencyToken(token: string): AgencyClaims {
  const decoded = jwt.verify(token, env.jwtSecret) as AgencyClaims;
  if (decoded.type !== 'agency') throw new Error('Invalid token type');
  return decoded;
}

async function logActivity(
  adminId: string | null,
  clientId: string | null,
  action: string,
  details?: Record<string, unknown>,
) {
  await query(
    `INSERT INTO agency_activity_log (admin_id, client_id, action, details)
     VALUES ($1, $2, $3, $4)`,
    [adminId, clientId, action, details ? JSON.stringify(details) : null],
  );
}

function publicAdmin(a: AgencyAdminRow) {
  return { id: a.id, email: a.email, name: a.name, role: a.role, isActive: a.is_active, lastLoginAt: a.last_login_at, createdAt: a.created_at };
}

// ─── Middleware ───────────────────────────────────────────────────────────────

function requireAgencyAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  try {
    req.agencyAuth = verifyAgencyToken(header.slice(7));
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

// ─── Auth Routes ─────────────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

agencyRouter.post('/auth/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  const { email, password } = parsed.data;

  const admin = await queryOne<AgencyAdminRow>(
    'SELECT * FROM agency_admins WHERE email = $1 AND is_active = true',
    [email],
  );
  if (!admin || !(await verifyPassword(password, admin.password_hash))) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  await query('UPDATE agency_admins SET last_login_at = now() WHERE id = $1', [admin.id]);
  const token = signAgencyToken({ adminId: admin.id, role: admin.role });
  res.json({ token, admin: publicAdmin(admin) });
});

agencyRouter.get('/auth/me', requireAgencyAuth, async (req, res) => {
  const admin = await queryOne<AgencyAdminRow>(
    'SELECT * FROM agency_admins WHERE id = $1',
    [req.agencyAuth!.adminId],
  );
  if (!admin) return res.status(404).json({ error: 'Admin no encontrado' });
  res.json(publicAdmin(admin));
});

// Intercambia un CRM token válido por un agency token, si el email del usuario
// está registrado como agency admin.
agencyRouter.post('/auth/exchange', async (req, res) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  let crmClaims: { userId: string };
  try {
    crmClaims = jwt.verify(header.slice(7), env.jwtSecret) as { userId: string };
  } catch {
    return res.status(401).json({ error: 'Token CRM inválido o expirado' });
  }

  const user = await queryOne<{ email: string }>(
    'SELECT email FROM users WHERE id = $1',
    [crmClaims.userId],
  );
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  const admin = await queryOne<AgencyAdminRow>(
    'SELECT * FROM agency_admins WHERE email = $1 AND is_active = true',
    [user.email],
  );
  if (!admin) return res.status(403).json({ error: 'Sin acceso al panel de agencia' });

  await query('UPDATE agency_admins SET last_login_at = now() WHERE id = $1', [admin.id]);
  const token = signAgencyToken({ adminId: admin.id, role: admin.role });
  res.json({ token, admin: publicAdmin(admin) });
});

// ─── Dashboard ───────────────────────────────────────────────────────────────

agencyRouter.get('/dashboard', requireAgencyAuth, async (req, res) => {
  const [[stats], recentActivity] = await Promise.all([
    query<{
      total_clients: string;
      active_clients: string;
      trial_clients: string;
      monthly_revenue: string;
      new_this_month: string;
    }>(
      `SELECT
         COUNT(*)                                           AS total_clients,
         COUNT(*) FILTER (WHERE status = 'active')         AS active_clients,
         COUNT(*) FILTER (WHERE status = 'trial')          AS trial_clients,
         COALESCE(SUM(monthly_value) FILTER (WHERE status IN ('active','trial')), 0) AS monthly_revenue,
         COUNT(*) FILTER (WHERE created_at >= date_trunc('month', now()))  AS new_this_month
       FROM agency_clients`,
    ),
    query<{
      id: string;
      action: string;
      details: Record<string, unknown> | null;
      created_at: string;
      admin_name: string | null;
      client_name: string | null;
    }>(
      `SELECT al.id, al.action, al.details, al.created_at,
              aa.name AS admin_name,
              ac.name AS client_name
       FROM agency_activity_log al
       LEFT JOIN agency_admins aa ON aa.id = al.admin_id
       LEFT JOIN agency_clients ac ON ac.id = al.client_id
       ORDER BY al.created_at DESC
       LIMIT 10`,
    ),
  ]);

  res.json({
    totalClients: Number(stats?.total_clients ?? 0),
    activeClients: Number(stats?.active_clients ?? 0),
    trialClients: Number(stats?.trial_clients ?? 0),
    monthlyRevenue: Number(stats?.monthly_revenue ?? 0),
    newThisMonth: Number(stats?.new_this_month ?? 0),
    recentActivity,
  });
});

// ─── Clients ─────────────────────────────────────────────────────────────────

agencyRouter.get('/clients', requireAgencyAuth, async (req, res) => {
  const { q, status, plan, type, page = '1', limit = '20' } = req.query as Record<string, string>;
  const offset = (Number(page) - 1) * Number(limit);
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (q) {
    params.push(`%${q}%`);
    conditions.push(`(ac.name ILIKE $${params.length} OR ac.email ILIKE $${params.length} OR ac.company ILIKE $${params.length})`);
  }
  if (status) {
    params.push(status);
    conditions.push(`ac.status = $${params.length}`);
  }
  if (plan) {
    params.push(plan);
    conditions.push(`ac.plan = $${params.length}`);
  }
  if (type) {
    params.push(type);
    conditions.push(`ac.type = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [clients, [countRow]] = await Promise.all([
    query<AgencyClientRow & { org_name: string | null; user_count: string }>(
      `SELECT ac.*,
              o.name AS org_name,
              (SELECT COUNT(*) FROM users u WHERE u.organization_id = ac.organization_id) AS user_count
       FROM agency_clients ac
       LEFT JOIN organizations o ON o.id = ac.organization_id
       ${where}
       ORDER BY ac.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, Number(limit), offset],
    ),
    query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM agency_clients ac ${where}`,
      params,
    ),
  ]);

  const total = Number(countRow?.total ?? 0);
  res.set('X-Total-Count', String(total));
  res.json({ clients, total, page: Number(page), limit: Number(limit) });
});

const createClientSchema = z.object({
  name: z.string().min(1),
  company: z.string().optional(),
  email: z.string().email(),
  phone: z.string().optional(),
  country: z.string().optional(),
  plan: z.enum(['free', 'starter', 'pro', 'enterprise']).default('starter'),
  planId: z.string().uuid().optional(),
  status: z.enum(['active', 'trial', 'suspended', 'cancelled']).default('active'),
  type: z.enum(['own', 'client']).default('client'),
  monthlyValue: z.number().optional().default(0),
  trialEndsAt: z.string().optional(),
  notes: z.string().optional(),
});

agencyRouter.post('/clients', requireAgencyAuth, async (req, res) => {
  const parsed = createClientSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  const d = parsed.data;
  const adminId = req.agencyAuth!.adminId;

  // Provisionar organización + usuario owner
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Crear organización
    const orgResult = await client.query<{ id: string }>(
      'INSERT INTO organizations (name) VALUES ($1) RETURNING id',
      [d.company || d.name],
    );
    const orgId = orgResult.rows[0].id;

    // Generar contraseña temporal
    const tempPassword = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6).toUpperCase();
    const hash = await hashPassword(tempPassword);

    // Crear usuario owner
    const userResult = await client.query<{ id: string }>(
      `INSERT INTO users (organization_id, email, password_hash, name, role)
       VALUES ($1, $2, $3, $4, 'owner') RETURNING id`,
      [orgId, d.email, hash, d.name],
    );

    // Crear registro de cuenta CRM
    const clientResult = await client.query<AgencyClientRow>(
      `INSERT INTO agency_clients
         (organization_id, name, company, email, phone, country, plan, plan_id, status, type, trial_ends_at, monthly_value, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [orgId, d.name, d.company ?? null, d.email, d.phone ?? null, d.country ?? null,
       d.plan, d.planId ?? null, d.status, d.type, d.trialEndsAt ?? null, d.monthlyValue, d.notes ?? null],
    );

    await client.query('COMMIT');

    const newClient = clientResult.rows[0];

    await logActivity(adminId, newClient.id, 'client_created', {
      name: d.name,
      plan: d.plan,
      orgId,
    });

    res.status(201).json({
      client: newClient,
      credentials: {
        email: d.email,
        password: tempPassword,
        organizationId: orgId,
        userId: userResult.rows[0].id,
      },
    });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
});

agencyRouter.get('/clients/:id', requireAgencyAuth, async (req, res) => {
  const id = req.params.id as string;

  const [client, activities] = await Promise.all([
    queryOne<AgencyClientRow & {
      org_name: string | null;
      plan_name: string | null;
      plan_price: string | null;
      plan_max_users: number | null;
    }>(
      `SELECT ac.*,
              o.name  AS org_name,
              p.name  AS plan_name,
              p.price_usd AS plan_price,
              p.max_users AS plan_max_users
       FROM agency_clients ac
       LEFT JOIN organizations o ON o.id = ac.organization_id
       LEFT JOIN plans p ON p.id = ac.plan_id
       WHERE ac.id = $1`,
      [id],
    ),
    query<{ id: string; action: string; details: unknown; created_at: string; admin_name: string | null }>(
      `SELECT al.id, al.action, al.details, al.created_at, aa.name AS admin_name
       FROM agency_activity_log al
       LEFT JOIN agency_admins aa ON aa.id = al.admin_id
       WHERE al.client_id = $1
       ORDER BY al.created_at DESC
       LIMIT 10`,
      [id],
    ),
  ]);

  if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });

  let orgUsers: unknown[] = [];
  if (client.organization_id) {
    orgUsers = await query(
      `SELECT id, name, email, role, created_at FROM users WHERE organization_id = $1 ORDER BY created_at`,
      [client.organization_id],
    );
  }

  res.json({ client, orgUsers, activities });
});

const updateClientSchema = z.object({
  name: z.string().min(1).optional(),
  company: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  country: z.string().optional(),
  plan: z.enum(['free', 'starter', 'pro', 'enterprise']).optional(),
  planId: z.string().uuid().nullable().optional(),
  status: z.enum(['active', 'trial', 'suspended', 'cancelled']).optional(),
  type: z.enum(['own', 'client']).optional(),
  monthlyValue: z.number().optional(),
  trialEndsAt: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

agencyRouter.patch('/clients/:id', requireAgencyAuth, async (req, res) => {
  const id = req.params.id as string;
  const parsed = updateClientSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  const d = parsed.data;
  const fields: string[] = [];
  const params: unknown[] = [];

  const map: Record<string, unknown> = {
    name: d.name,
    company: d.company,
    email: d.email,
    phone: d.phone,
    country: d.country,
    plan: d.plan,
    plan_id: d.planId,
    status: d.status,
    type: d.type,
    monthly_value: d.monthlyValue,
    trial_ends_at: d.trialEndsAt,
    notes: d.notes,
  };

  for (const [col, val] of Object.entries(map)) {
    if (val !== undefined) {
      params.push(val);
      fields.push(`${col} = $${params.length}`);
    }
  }

  if (fields.length === 0) return res.status(400).json({ error: 'Sin campos para actualizar' });

  fields.push('updated_at = now()');
  params.push(id);

  const updated = await queryOne<AgencyClientRow>(
    `UPDATE agency_clients SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params,
  );
  if (!updated) return res.status(404).json({ error: 'Cliente no encontrado' });

  await logActivity(req.agencyAuth!.adminId, id, 'client_updated', d as Record<string, unknown>);
  res.json(updated);
});

agencyRouter.delete('/clients/:id', requireAgencyAuth, async (req, res) => {
  const id = req.params.id as string;
  const updated = await queryOne<AgencyClientRow>(
    `UPDATE agency_clients SET status = 'cancelled', updated_at = now() WHERE id = $1 RETURNING *`,
    [id],
  );
  if (!updated) return res.status(404).json({ error: 'Cliente no encontrado' });
  await logActivity(req.agencyAuth!.adminId, id, 'client_cancelled', {});
  res.json(updated);
});

// ─── Impersonation ───────────────────────────────────────────────────────────

agencyRouter.post('/clients/:id/impersonate', requireAgencyAuth, async (req, res) => {
  const id = req.params.id as string;
  const client = await queryOne<AgencyClientRow>(
    'SELECT * FROM agency_clients WHERE id = $1',
    [id],
  );
  if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });
  if (!client.organization_id) return res.status(400).json({ error: 'Este cliente no tiene CRM provisionado aún' });

  // Busca al agency admin en la tabla users por email para mantener su identidad
  // al entrar al CRM del cliente (solo cambia la org, no el usuario).
  const agencyAdmin = await queryOne<AgencyAdminRow>(
    'SELECT * FROM agency_admins WHERE id = $1',
    [req.agencyAuth!.adminId],
  );
  const adminCrmUser = agencyAdmin
    ? await queryOne<{ id: string; role: string }>(
        'SELECT id, role FROM users WHERE email = $1',
        [agencyAdmin.email],
      )
    : null;

  // Recae en el owner de la org si el admin no tiene cuenta CRM propia
  const fallbackOwner = adminCrmUser ? null : await queryOne<{ id: string; email: string; role: string }>(
    `SELECT id, email, role FROM users
     WHERE organization_id = $1 AND role = 'owner'
     ORDER BY created_at LIMIT 1`,
    [client.organization_id],
  );
  if (!adminCrmUser && !fallbackOwner) {
    return res.status(400).json({ error: 'No se encontró usuario owner para esta organización' });
  }

  const actingUserId = adminCrmUser?.id ?? fallbackOwner!.id;
  const actingRole   = adminCrmUser?.role ?? fallbackOwner!.role;

  const crmToken = jwt.sign(
    {
      userId: actingUserId,
      organizationId: client.organization_id,
      role: actingRole,
      impersonatedByAgency: true,
    },
    env.jwtSecret,
    { expiresIn: '8h' },
  );

  await logActivity(req.agencyAuth!.adminId, id, 'crm_accessed', {
    orgId: client.organization_id,
    adminEmail: agencyAdmin?.email,
  });

  res.json({
    token: crmToken,
    client: {
      id: client.id,
      name: client.name,
      company: client.company,
      email: client.email,
    },
  });
});

// ─── Plans ───────────────────────────────────────────────────────────────────

interface PlanRow {
  id: string; name: string; slug: string; price_usd: string;
  max_users: number; features: Record<string, unknown>;
  is_active: boolean; sort_order: number; created_at: string;
}

agencyRouter.get('/plans', requireAgencyAuth, async (_req, res) => {
  const rows = await query<PlanRow>('SELECT * FROM plans ORDER BY sort_order, created_at');
  res.json({ plans: rows });
});

agencyRouter.post('/plans', requireAgencyAuth, async (req, res) => {
  const { name, slug, priceUsd, maxUsers, features } = req.body ?? {};
  if (!name || !slug) return res.status(400).json({ error: 'name y slug requeridos' });
  const [plan] = await query<PlanRow>(
    `INSERT INTO plans (name, slug, price_usd, max_users, features, sort_order)
     VALUES ($1, $2, $3, $4, $5, (SELECT COALESCE(MAX(sort_order),0)+1 FROM plans))
     RETURNING *`,
    [name, slug, Number(priceUsd ?? 0), Number(maxUsers ?? 0), JSON.stringify(features ?? {})],
  );
  res.status(201).json(plan);
});

agencyRouter.patch('/plans/:id', requireAgencyAuth, async (req, res) => {
  const { name, priceUsd, maxUsers, features, isActive } = req.body ?? {};
  const fields: string[] = [];
  const params: unknown[] = [];
  if (name       !== undefined) { params.push(name);               fields.push(`name=$${params.length}`); }
  if (priceUsd   !== undefined) { params.push(Number(priceUsd));   fields.push(`price_usd=$${params.length}`); }
  if (maxUsers   !== undefined) { params.push(Number(maxUsers));   fields.push(`max_users=$${params.length}`); }
  if (features   !== undefined) { params.push(JSON.stringify(features)); fields.push(`features=$${params.length}`); }
  if (isActive   !== undefined) { params.push(Boolean(isActive));  fields.push(`is_active=$${params.length}`); }
  if (!fields.length) return res.status(400).json({ error: 'Sin campos' });
  params.push(req.params.id);
  const [plan] = await query<PlanRow>(
    `UPDATE plans SET ${fields.join(',')} WHERE id=$${params.length} RETURNING *`, params,
  );
  if (!plan) return res.status(404).json({ error: 'Plan no encontrado' });
  res.json(plan);
});

// ─── Payments ────────────────────────────────────────────────────────────────

interface PaymentRow {
  id: string; client_id: string; amount_usd: string; status: string;
  method: string | null; period_start: string | null; period_end: string | null;
  paid_at: string | null; notes: string | null; created_at: string;
}

agencyRouter.get('/clients/:id/payments', requireAgencyAuth, async (req, res) => {
  const rows = await query<PaymentRow>(
    'SELECT * FROM agency_payments WHERE client_id=$1 ORDER BY created_at DESC',
    [req.params.id],
  );
  res.json({ payments: rows });
});

agencyRouter.post('/clients/:id/payments', requireAgencyAuth, async (req, res) => {
  const { amountUsd, status, method, periodStart, periodEnd, paidAt, notes } = req.body ?? {};
  if (!amountUsd) return res.status(400).json({ error: 'amountUsd requerido' });
  const [payment] = await query<PaymentRow>(
    `INSERT INTO agency_payments (client_id,amount_usd,status,method,period_start,period_end,paid_at,notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [req.params.id, Number(amountUsd), status ?? 'paid', method ?? null,
     periodStart ?? null, periodEnd ?? null, paidAt ?? null, notes ?? null],
  );
  await logActivity(req.agencyAuth!.adminId, req.params.id, 'payment_recorded', { amount: amountUsd, status });
  res.status(201).json(payment);
});

agencyRouter.patch('/clients/:id/payments/:pid', requireAgencyAuth, async (req, res) => {
  const { status, paidAt, notes } = req.body ?? {};
  const fields: string[] = [];
  const params: unknown[] = [];
  if (status !== undefined) { params.push(status);  fields.push(`status=$${params.length}`); }
  if (paidAt !== undefined) { params.push(paidAt);  fields.push(`paid_at=$${params.length}`); }
  if (notes  !== undefined) { params.push(notes);   fields.push(`notes=$${params.length}`); }
  if (!fields.length) return res.status(400).json({ error: 'Sin campos' });
  params.push(req.params.pid);
  const [p] = await query<PaymentRow>(
    `UPDATE agency_payments SET ${fields.join(',')} WHERE id=$${params.length} RETURNING *`, params,
  );
  if (!p) return res.status(404).json({ error: 'Pago no encontrado' });
  res.json(p);
});

agencyRouter.delete('/clients/:id/payments/:pid', requireAgencyAuth, async (req, res) => {
  await query('DELETE FROM agency_payments WHERE id=$1 AND client_id=$2', [req.params.pid, req.params.id]);
  res.status(204).end();
});

// ─── Courtesy ────────────────────────────────────────────────────────────────

agencyRouter.patch('/clients/:id/courtesy', requireAgencyAuth, async (req, res) => {
  const { courtesyExtraUsers, courtesyFullAccess } = req.body ?? {};
  const updated = await queryOne<AgencyClientRow>(
    `UPDATE agency_clients
     SET courtesy_extra_users=$1, courtesy_full_access=$2, updated_at=now()
     WHERE id=$3 RETURNING *`,
    [Number(courtesyExtraUsers ?? 0), Boolean(courtesyFullAccess ?? false), req.params.id],
  );
  if (!updated) return res.status(404).json({ error: 'Cuenta no encontrada' });
  await logActivity(req.agencyAuth!.adminId, req.params.id, 'courtesy_updated',
    { extraUsers: courtesyExtraUsers, fullAccess: courtesyFullAccess });
  res.json(updated);
});

// ─── Provision ───────────────────────────────────────────────────────────────

agencyRouter.post('/clients/:id/provision', requireAgencyAuth, async (req, res) => {
  const id = req.params.id as string;
  const client = await queryOne<AgencyClientRow>('SELECT * FROM agency_clients WHERE id = $1', [id]);
  if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });

  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');

    let orgId = client.organization_id;

    // Crear organización si no existe
    if (!orgId) {
      const orgResult = await dbClient.query<{ id: string }>(
        'INSERT INTO organizations (name) VALUES ($1) RETURNING id',
        [client.company || client.name],
      );
      orgId = orgResult.rows[0].id;
      await dbClient.query(
        'UPDATE agency_clients SET organization_id = $1, updated_at = now() WHERE id = $2',
        [orgId, id],
      );
    }

    // Generar nueva contraseña temporal
    const tempPassword = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6).toUpperCase();
    const hash = await hashPassword(tempPassword);

    // Verificar si ya existe usuario owner
    const existingUser = await dbClient.query<{ id: string; email: string }>(
      `SELECT id, email FROM users WHERE organization_id = $1 AND role = 'owner' LIMIT 1`,
      [orgId],
    );

    let userId: string;
    let userEmail: string;

    if (existingUser.rows.length > 0) {
      // Actualizar contraseña del owner existente
      await dbClient.query(
        'UPDATE users SET password_hash = $1 WHERE id = $2',
        [hash, existingUser.rows[0].id],
      );
      userId = existingUser.rows[0].id;
      userEmail = existingUser.rows[0].email;
    } else {
      // Crear nuevo usuario owner
      const userResult = await dbClient.query<{ id: string }>(
        `INSERT INTO users (organization_id, email, password_hash, name, role)
         VALUES ($1, $2, $3, $4, 'owner') RETURNING id`,
        [orgId, client.email, hash, client.name],
      );
      userId = userResult.rows[0].id;
      userEmail = client.email;
    }

    await dbClient.query('COMMIT');

    await logActivity(req.agencyAuth!.adminId, id, 'crm_provisioned', { orgId });

    res.json({
      organizationId: orgId,
      credentials: { email: userEmail, password: tempPassword, userId },
    });
  } catch (e) {
    await dbClient.query('ROLLBACK');
    throw e;
  } finally {
    dbClient.release();
  }
});
