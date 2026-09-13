import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db.ts';
import { requireAdmin } from '../auth/perms.ts';

export const organizationRouter = Router();

const ORG_COLS = 'id, name, phone, website, business_email, address, city, country, industry, description, timezone, currency, logo_url, created_at';

organizationRouter.get('/', async (req, res) => {
  const org = await queryOne(
    `SELECT ${ORG_COLS} FROM organizations WHERE id = $1`,
    [req.auth!.organizationId],
  );
  if (!org) return res.status(404).json({ error: 'Organización no encontrada' });
  res.json(org);
});

const OrgSchema = z.object({
  name:           z.string().min(1).optional(),
  phone:          z.string().optional().nullable(),
  website:        z.string().optional().nullable(),
  business_email: z.string().email().optional().nullable().or(z.literal('')),
  address:        z.string().optional().nullable(),
  city:           z.string().optional().nullable(),
  country:        z.string().optional().nullable(),
  industry:       z.string().optional().nullable(),
  description:    z.string().optional().nullable(),
  timezone:       z.string().optional().nullable(),
  currency:       z.string().optional().nullable(),
  logo_url:       z.string().optional().nullable(),
});

organizationRouter.patch('/', requireAdmin, async (req, res) => {
  const parsed = OrgSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  const d = parsed.data;

  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  for (const [k, v] of Object.entries(d)) {
    if (v !== undefined) { sets.push(`${k} = $${i++}`); vals.push(v === '' ? null : v); }
  }
  if (!sets.length) return res.status(400).json({ error: 'Nada que actualizar' });
  vals.push(req.auth!.organizationId);

  const [org] = await query(
    `UPDATE organizations SET ${sets.join(', ')} WHERE id = $${i} RETURNING ${ORG_COLS}`,
    vals,
  );
  res.json(org);
});
