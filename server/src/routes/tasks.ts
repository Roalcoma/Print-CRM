import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db.ts';

export const tasksRouter = Router();

// Trae asignado y oportunidad vinculada.
const BASE_SELECT = `
  SELECT t.*, u.name AS assignee_name, o.title AS opportunity_title
  FROM tasks t
  LEFT JOIN users u ON u.id = t.assignee_id
  LEFT JOIN opportunities o ON o.id = t.opportunity_id`;

// ── Listado con filtros (status, assigneeId, opportunityId) ───────────────────
tasksRouter.get('/', async (req, res) => {
  const where = ['t.organization_id = $1'];
  const params: unknown[] = [req.auth!.organizationId];
  const { status, assigneeId, opportunityId } = req.query;
  if (status === 'pending' || status === 'done') { params.push(status); where.push(`t.status = $${params.length}`); }
  if (typeof assigneeId === 'string') { params.push(assigneeId); where.push(`t.assignee_id = $${params.length}`); }
  if (typeof opportunityId === 'string') { params.push(opportunityId); where.push(`t.opportunity_id = $${params.length}`); }

  // Pendientes primero, luego por vencimiento (los sin fecha al final).
  const rows = await query(
    `${BASE_SELECT} WHERE ${where.join(' AND ')}
     ORDER BY (t.status = 'done'), t.due_at ASC NULLS LAST, t.created_at DESC`,
    params,
  );
  res.json(rows);
});

const taskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  assignee_id: z.string().uuid().optional().nullable(),
  opportunity_id: z.string().uuid().optional().nullable(),
  due_at: z.string().datetime({ offset: true }).optional().nullable(),
  status: z.enum(['pending', 'done']).optional(),
});

tasksRouter.post('/', async (req, res) => {
  const parsed = taskSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  const t = parsed.data;
  const [row] = await query<{ id: string }>(
    `INSERT INTO tasks (organization_id, title, description, assignee_id, opportunity_id, due_at, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [req.auth!.organizationId, t.title, t.description ?? null, t.assignee_id ?? null, t.opportunity_id ?? null,
     t.due_at ?? null, t.status ?? 'pending', req.auth!.userId],
  );
  res.status(201).json(await queryOne(`${BASE_SELECT} WHERE t.id = $1`, [row.id]));
});

const updateSchema = taskSchema.partial();
const COLS = ['title', 'description', 'assignee_id', 'opportunity_id', 'due_at', 'status'] as const;

tasksRouter.patch('/:id', async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  const data = parsed.data as Record<string, unknown>;
  const cols = COLS.filter(c => c in data);
  if (cols.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });

  const sets = cols.map((c, i) => `${c} = $${i + 1}`);
  const values: unknown[] = cols.map(c => data[c]);
  // Marca/limpia completed_at al cambiar el estado.
  if ('status' in data) sets.push(`completed_at = ${data.status === 'done' ? 'now()' : 'NULL'}`);

  const [row] = await query<{ id: string }>(
    `UPDATE tasks SET ${sets.join(', ')}, updated_at = now()
     WHERE id = $${values.length + 1} AND organization_id = $${values.length + 2} RETURNING id`,
    [...values, req.params.id, req.auth!.organizationId],
  );
  if (!row) return res.status(404).json({ error: 'Tarea no encontrada' });
  res.json(await queryOne(`${BASE_SELECT} WHERE t.id = $1`, [row.id]));
});

tasksRouter.delete('/:id', async (req, res) => {
  const row = await queryOne('DELETE FROM tasks WHERE id=$1 AND organization_id=$2 RETURNING id', [req.params.id, req.auth!.organizationId]);
  if (!row) return res.status(404).json({ error: 'Tarea no encontrada' });
  res.status(204).end();
});
