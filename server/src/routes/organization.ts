import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db.ts';
import { requireAdmin } from '../auth/perms.ts';

export const organizationRouter = Router();

// Perfil de la organización (nombre del negocio).
organizationRouter.get('/', async (req, res) => {
  const org = await queryOne(
    'SELECT id, name, created_at FROM organizations WHERE id = $1',
    [req.auth!.organizationId],
  );
  if (!org) return res.status(404).json({ error: 'Organización no encontrada' });
  res.json(org);
});

organizationRouter.patch('/', requireAdmin, async (req, res) => {
  const parsed = z.object({ name: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  const [org] = await query(
    'UPDATE organizations SET name = $1 WHERE id = $2 RETURNING id, name, created_at',
    [parsed.data.name, req.auth!.organizationId],
  );
  res.json(org);
});
