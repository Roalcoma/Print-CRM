import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db.ts';

export const contactsRouter = Router();

const contactSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().optional().nullable(),
  email: z.string().email().optional().or(z.literal('')).nullable(),
  phone: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional().nullable(),
});

// Listar contactos del tenant (con búsqueda simple opcional ?q=).
contactsRouter.get('/', async (req, res) => {
  const orgId = req.auth!.organizationId;
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const rows = q
    ? await query(
        `SELECT * FROM contacts
         WHERE organization_id = $1
           AND (first_name ILIKE $2 OR last_name ILIKE $2 OR email ILIKE $2 OR phone ILIKE $2)
         ORDER BY created_at DESC`,
        [orgId, `%${q}%`],
      )
    : await query('SELECT * FROM contacts WHERE organization_id = $1 ORDER BY created_at DESC', [orgId]);
  res.json(rows);
});

contactsRouter.post('/', async (req, res) => {
  const parsed = contactSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  const c = parsed.data;
  const [row] = await query(
    `INSERT INTO contacts (organization_id, first_name, last_name, email, phone, tags, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [req.auth!.organizationId, c.first_name, c.last_name ?? null, c.email || null, c.phone ?? null, c.tags ?? [], c.notes ?? null],
  );
  res.status(201).json(row);
});

contactsRouter.put('/:id', async (req, res) => {
  const parsed = contactSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  const c = parsed.data;
  const [row] = await query(
    `UPDATE contacts SET first_name=$1, last_name=$2, email=$3, phone=$4, tags=$5, notes=$6, updated_at=now()
     WHERE id=$7 AND organization_id=$8 RETURNING *`,
    [c.first_name, c.last_name ?? null, c.email || null, c.phone ?? null, c.tags ?? [], c.notes ?? null, req.params.id, req.auth!.organizationId],
  );
  if (!row) return res.status(404).json({ error: 'Contacto no encontrado' });
  res.json(row);
});

contactsRouter.delete('/:id', async (req, res) => {
  const row = await queryOne(
    'DELETE FROM contacts WHERE id=$1 AND organization_id=$2 RETURNING id',
    [req.params.id, req.auth!.organizationId],
  );
  if (!row) return res.status(404).json({ error: 'Contacto no encontrado' });
  res.status(204).end();
});
