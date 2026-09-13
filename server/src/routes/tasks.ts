import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db.ts';
import { logActivity } from '../activity.ts';
import { audit } from '../audit.ts';

export const tasksRouter = Router();

const STATUSES   = ['pending', 'in_progress', 'done', 'cancelled'] as const;
const PRIORITIES = ['high', 'medium', 'low'] as const;
const REMINDERS  = ['15min', '30min', '1h', '2h', '1d', '2d', '1w'] as const;

// Responsables (M2M) y oportunidad vinculada, embebidos.
const BASE_SELECT = `
  SELECT t.*, o.title AS opportunity_title,
         (SELECT coalesce(json_agg(json_build_object('id', au.id, 'name', au.name) ORDER BY au.name), '[]')
          FROM task_assignees ta JOIN users au ON au.id = ta.user_id
          WHERE ta.task_id = t.id) AS assignees
  FROM tasks t
  LEFT JOIN opportunities o ON o.id = t.opportunity_id`;

// Reemplaza el set de responsables (valida que sean de la organización).
async function syncAssignees(taskId: string, userIds: string[], orgId: string) {
  await query('DELETE FROM task_assignees WHERE task_id = $1', [taskId]);
  if (userIds.length === 0) return;
  const valid = await query<{ id: string }>(
    'SELECT id FROM users WHERE organization_id = $1 AND id = ANY($2::uuid[])', [orgId, userIds],
  );
  if (valid.length === 0) return;
  const placeholders = valid.map((_, i) => `($1, $${i + 2})`).join(', ');
  await query(`INSERT INTO task_assignees (task_id, user_id) VALUES ${placeholders}`, [taskId, ...valid.map(v => v.id)]);
}

// ── Stats (Hoy / Atrasadas / Pendientes / Completadas) ────────────────────────
tasksRouter.get('/stats', async (req, res) => {
  const orgId = req.auth!.organizationId;
  const [row] = await query<{
    today: string; overdue: string; pending: string; done: string; total: string;
  }>(`
    SELECT
      count(*) FILTER (WHERE due_at::date = CURRENT_DATE AND status NOT IN ('done','cancelled'))  AS today,
      count(*) FILTER (WHERE due_at < now()            AND status NOT IN ('done','cancelled'))  AS overdue,
      count(*) FILTER (WHERE status NOT IN ('done','cancelled'))                                AS pending,
      count(*) FILTER (WHERE status = 'done')                                                  AS done,
      count(*)                                                                                  AS total
    FROM tasks WHERE organization_id = $1`, [orgId]);
  const done  = Number(row.done);
  const total = Number(row.total);
  res.json({
    today:   Number(row.today),
    overdue: Number(row.overdue),
    pending: Number(row.pending),
    done,
    total,
    done_pct: total > 0 ? Math.round((done / total) * 100) : 0,
  });
});

// ── Listado con filtros ────────────────────────────────────────────────────────
tasksRouter.get('/', async (req, res) => {
  const where = ['t.organization_id = $1'];
  const params: unknown[] = [req.auth!.organizationId];
  const { status, assigneeId, opportunityId, month, year } = req.query;
  if (typeof status === 'string' && (STATUSES as readonly string[]).includes(status)) { params.push(status); where.push(`t.status = $${params.length}`); }
  if (typeof assigneeId === 'string') { params.push(assigneeId); where.push(`EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.user_id = $${params.length})`); }
  if (typeof opportunityId === 'string') { params.push(opportunityId); where.push(`t.opportunity_id = $${params.length}`); }
  if (month && year) {
    const m = Number(month); const y = Number(year);
    const start = new Date(y, m - 1, 1); const end = new Date(y, m, 1);
    params.push(start, end);
    where.push(`t.due_at >= $${params.length - 1} AND t.due_at < $${params.length}`);
  }

  const rows = await query(
    `${BASE_SELECT} WHERE ${where.join(' AND ')}
     ORDER BY t.due_at ASC NULLS LAST, t.created_at DESC`,
    params,
  );
  res.json(rows);
});

const taskSchema = z.object({
  title:          z.string().min(1),
  description:    z.string().optional().nullable(),
  assignee_ids:   z.array(z.string().uuid()).optional(),
  opportunity_id: z.string().uuid().optional().nullable(),
  due_at:         z.string().datetime({ offset: true }).optional().nullable(),
  status:         z.enum(STATUSES).optional(),
  task_type:      z.string().optional().nullable(),
  priority:       z.enum(PRIORITIES).optional(),
  reminder:       z.enum(REMINDERS).optional().nullable(),
});

tasksRouter.post('/', async (req, res) => {
  const parsed = taskSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  const t = parsed.data;
  const orgId = req.auth!.organizationId;
  const actorId = req.auth!.userId;
  const [row] = await query<{ id: string }>(
    `INSERT INTO tasks (organization_id, title, description, opportunity_id, due_at, status, task_type, priority, reminder, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [orgId, t.title, t.description ?? null, t.opportunity_id ?? null,
     t.due_at ?? null, t.status ?? 'pending', t.task_type ?? null,
     t.priority ?? 'medium', t.reminder ?? null, actorId],
  );
  if (t.assignee_ids) await syncAssignees(row.id, t.assignee_ids, orgId);
  const actor = await queryOne<{ name: string }>('SELECT name FROM users WHERE id=$1', [actorId]);
  logActivity({
    orgId, entityType: 'task', entityId: row.id, actorId, actorName: actor?.name ?? null,
    eventType: 'task_created', meta: { title: t.title, priority: t.priority ?? 'medium' },
  }).catch(console.error);
  audit({ req, action: 'task.created', entityType: 'task', entityId: row.id, entityName: t.title });
  res.status(201).json(await queryOne(`${BASE_SELECT} WHERE t.id = $1`, [row.id]));
});

const updateSchema = taskSchema.partial();
const COLS = ['title', 'description', 'opportunity_id', 'due_at', 'status', 'task_type', 'priority', 'reminder'] as const;

tasksRouter.patch('/:id', async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  const data = parsed.data as Record<string, unknown>;
  const orgId = req.auth!.organizationId;
  const actorId = req.auth!.userId;

  const existing = await queryOne<{ id: string; title: string; status: string }>('SELECT id, title, status FROM tasks WHERE id=$1 AND organization_id=$2', [req.params.id, orgId]);
  if (!existing) return res.status(404).json({ error: 'Tarea no encontrada' });

  if ('assignee_ids' in data) await syncAssignees(req.params.id, data.assignee_ids as string[], orgId);

  const cols = COLS.filter(c => c in data);
  const sets = cols.map((c, i) => `${c} = $${i + 1}`);
  const values: unknown[] = cols.map(c => data[c]);
  if ('status' in data) sets.push(`completed_at = ${data.status === 'done' ? 'now()' : 'NULL'}`);

  if (sets.length > 0) {
    await query(
      `UPDATE tasks SET ${sets.join(', ')}, updated_at = now() WHERE id = $${values.length + 1} AND organization_id = $${values.length + 2}`,
      [...values, req.params.id, orgId],
    );
  }

  // Registrar actividad si cambió el status
  if ('status' in data && data.status !== existing.status) {
    const actor = await queryOne<{ name: string }>('SELECT name FROM users WHERE id=$1', [actorId]);
    const title = (data.title as string | undefined) ?? existing.title;
    if (data.status === 'done') {
      logActivity({
        orgId, entityType: 'task', entityId: req.params.id, actorId, actorName: actor?.name ?? null,
        eventType: 'task_completed', meta: { title },
      }).catch(console.error);
      audit({ req, action: 'task.status_changed', entityType: 'task', entityId: req.params.id, entityName: title, details: { from: existing.status, to: 'done' } });
    } else {
      logActivity({
        orgId, entityType: 'task', entityId: req.params.id, actorId, actorName: actor?.name ?? null,
        eventType: 'task_status_changed', meta: { from: existing.status, to: data.status as string, title },
      }).catch(console.error);
      audit({ req, action: 'task.status_changed', entityType: 'task', entityId: req.params.id, entityName: title, details: { from: existing.status, to: data.status } });
    }
  } else if (cols.filter(c => c !== 'status').length > 0) {
    audit({ req, action: 'task.updated', entityType: 'task', entityId: req.params.id, entityName: existing.title });
  }

  res.json(await queryOne(`${BASE_SELECT} WHERE t.id = $1`, [req.params.id]));
});

tasksRouter.delete('/:id', async (req, res) => {
  const row = await queryOne<{ id: string; title: string }>('DELETE FROM tasks WHERE id=$1 AND organization_id=$2 RETURNING id, title', [req.params.id, req.auth!.organizationId]);
  if (!row) return res.status(404).json({ error: 'Tarea no encontrada' });
  audit({ req, action: 'task.deleted', entityType: 'task', entityId: req.params.id, entityName: row.title });
  res.status(204).end();
});
