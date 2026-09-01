import { Router } from 'express';
import { query } from '../db.ts';

export const dashboardRouter = Router();

dashboardRouter.get('/summary', async (req, res) => {
  const orgId = req.auth!.organizationId;

  const [
    contactsRows,
    oppsRows,
    tasksRows,
    stageRows,
    recentOppsRows,
    tasksTodayRows,
    oppsByStatusRows,
  ] = await Promise.all([
    // contacts count
    query<{ n: string }>(
      'SELECT count(*) AS n FROM contacts WHERE organization_id = $1',
      [orgId],
    ),
    // open opportunities + pipeline value
    query<{ open_opps: string; pipeline_value: string }>(
      `SELECT count(*) FILTER (WHERE status='open') AS open_opps,
              coalesce(sum(value) FILTER (WHERE status='open'), 0) AS pipeline_value
       FROM opportunities WHERE organization_id = $1`,
      [orgId],
    ),
    // tasks stats
    query<{ today: string; overdue: string }>(
      `SELECT
         count(*) FILTER (WHERE due_at::date = CURRENT_DATE AND status NOT IN ('done','cancelled')) AS today,
         count(*) FILTER (WHERE due_at < now()            AND status NOT IN ('done','cancelled')) AS overdue
       FROM tasks WHERE organization_id = $1`,
      [orgId],
    ),
    // pipeline by stage (with total_count including all statuses)
    query<{ stage_name: string; position: number; count: string; value: string; total_count: string }>(
      `SELECT s.name AS stage_name, s.position,
              count(o.id) FILTER (WHERE o.status = 'open') AS count,
              coalesce(sum(o.value) FILTER (WHERE o.status = 'open'), 0) AS value,
              count(o.id) AS total_count
       FROM pipeline_stages s
       JOIN pipelines p ON p.id = s.pipeline_id AND p.organization_id = $1
       LEFT JOIN opportunities o ON o.stage_id = s.id
       GROUP BY s.id, s.name, s.position
       ORDER BY s.position`,
      [orgId],
    ),
    // recent opportunities (last 6)
    query<{ id: string; title: string; value: string; status: string; stage_name: string; created_at: string }>(
      `SELECT o.id, o.title, o.value, o.status, s.name AS stage_name, o.created_at
       FROM opportunities o
       JOIN pipeline_stages s ON s.id = o.stage_id
       WHERE o.organization_id = $1
       ORDER BY o.created_at DESC
       LIMIT 6`,
      [orgId],
    ),
    // tasks due today
    query<{ id: string; title: string; priority: string; status: string; due_at: string }>(
      `SELECT id, title, priority, status, due_at
       FROM tasks
       WHERE organization_id = $1
         AND due_at::date = CURRENT_DATE
         AND status NOT IN ('done', 'cancelled')
       ORDER BY due_at
       LIMIT 8`,
      [orgId],
    ),
    // opportunities by status (open/won/lost)
    query<{ status: string; count: string; value: string }>(
      `SELECT
         status,
         count(*) AS count,
         coalesce(sum(value), 0) AS value
       FROM opportunities
       WHERE organization_id = $1
       GROUP BY status`,
      [orgId],
    ),
  ]);

  const opps = oppsRows[0];
  const tasks = tasksRows[0];

  // Build opps_by_status object
  const opps_by_status: Record<string, { count: number; value: number }> = {
    open: { count: 0, value: 0 },
    won:  { count: 0, value: 0 },
    lost: { count: 0, value: 0 },
  };
  for (const row of oppsByStatusRows) {
    if (row.status === 'open' || row.status === 'won' || row.status === 'lost') {
      opps_by_status[row.status] = {
        count: Number(row.count),
        value: Number(row.value),
      };
    }
  }

  const total_opps = opps_by_status.open.count + opps_by_status.won.count + opps_by_status.lost.count;
  const won_value = opps_by_status.won.value;
  const conversion_rate = total_opps > 0
    ? Math.round((opps_by_status.won.count / total_opps) * 1000) / 10
    : 0;

  res.json({
    contacts:        Number(contactsRows[0].n),
    open_opps:       Number(opps.open_opps),
    pipeline_value:  Number(opps.pipeline_value),
    tasks_today:     Number(tasks.today),
    tasks_overdue:   Number(tasks.overdue),
    opps_by_status,
    total_opps,
    won_value,
    conversion_rate,
    pipeline_by_stage: stageRows.map(s => ({
      stage_name:  s.stage_name,
      count:       Number(s.count),
      value:       Number(s.value),
      total_count: Number(s.total_count),
    })),
    recent_opps:     recentOppsRows,
    tasks_due_today: tasksTodayRows,
  });
});
