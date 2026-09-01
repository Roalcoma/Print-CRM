import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db.ts';
import { logActivity } from '../activity.ts';

export const activityRouter = Router();

// GET /api/activity — feed global del tenant (últimos 100)
// GET /api/activity?entityType=contact&entityId=UUID — últimos 50 del entity
activityRouter.get('/', async (req, res) => {
  const orgId = req.auth!.organizationId;
  const { entityType, entityId } = req.query;

  if (entityType && entityId) {
    const rows = await query(
      `SELECT id, entity_type, entity_id, actor_name, event_type, meta, created_at
       FROM activity_feed
       WHERE organization_id = $1 AND entity_type = $2 AND entity_id = $3::uuid
       ORDER BY created_at DESC
       LIMIT 50`,
      [orgId, entityType, entityId],
    );
    return res.json(rows);
  }

  const rows = await query(
    `SELECT id, entity_type, entity_id, actor_name, event_type, meta, created_at
     FROM activity_feed
     WHERE organization_id = $1
     ORDER BY created_at DESC
     LIMIT 100`,
    [orgId],
  );
  res.json(rows);
});

// POST /api/activity/note — añade nota manual al feed
const noteSchema = z.object({
  entityType: z.enum(['contact', 'opportunity', 'task']),
  entityId: z.string().uuid(),
  body: z.string().min(1),
});

activityRouter.post('/note', async (req, res) => {
  const parsed = noteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  const orgId = req.auth!.organizationId;
  const actorId = req.auth!.userId;
  const actor = await queryOne<{ name: string }>('SELECT name FROM users WHERE id=$1', [actorId]);

  await logActivity({
    orgId,
    entityType: parsed.data.entityType,
    entityId: parsed.data.entityId,
    actorId,
    actorName: actor?.name ?? null,
    eventType: 'note',
    meta: { body_preview: parsed.data.body.slice(0, 100) },
  });

  res.status(201).json({ ok: true });
});
