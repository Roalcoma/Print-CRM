import type { Request } from 'express';
import { query } from './db.ts';

export type AuditAction =
  | 'login'
  | 'contact.created' | 'contact.updated' | 'contact.deleted'
  | 'opportunity.created' | 'opportunity.updated' | 'opportunity.stage_changed' | 'opportunity.deleted'
  | 'task.created' | 'task.updated' | 'task.status_changed' | 'task.deleted'
  | 'user.created' | 'user.updated' | 'user.deleted'
  | 'pipeline.created' | 'pipeline.updated' | 'pipeline.deleted';

interface AuditParams {
  req: Request;
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  entityName?: string;
  details?: Record<string, unknown>;
}

export async function audit({ req, action, entityType, entityId, entityName, details }: AuditParams) {
  const organizationId = req.auth?.organizationId;
  const userId         = req.auth?.userId;
  if (!organizationId) return;

  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
    ?? req.socket?.remoteAddress
    ?? null;

  await query(
    `INSERT INTO crm_audit_log
       (organization_id, user_id, user_name, action, entity_type, entity_id, entity_name, details, ip)
     VALUES ($1, $2,
       (SELECT name FROM users WHERE id = $2 LIMIT 1),
       $3, $4, $5, $6, $7, $8)`,
    [organizationId, userId ?? null, action,
     entityType ?? null, entityId ?? null, entityName ?? null,
     details ? JSON.stringify(details) : null, ip],
  ).catch(() => { /* audit nunca rompe el flujo principal */ });
}
