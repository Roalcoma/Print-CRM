import { query } from './db.ts';

interface ActivityParams {
  orgId: string;
  entityType: 'contact' | 'opportunity' | 'task';
  entityId: string;
  actorId?: string | null;
  actorName?: string | null;
  eventType: string;
  meta?: Record<string, unknown>;
}

export async function logActivity(p: ActivityParams): Promise<void> {
  await query(
    `INSERT INTO activity_feed (organization_id, entity_type, entity_id, actor_id, actor_name, event_type, meta)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [p.orgId, p.entityType, p.entityId, p.actorId ?? null, p.actorName ?? null, p.eventType, JSON.stringify(p.meta ?? {})],
  );
}
