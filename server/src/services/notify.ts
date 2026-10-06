// Punto único para avisar a los usuarios de una organización: campanita (tabla notifications),
// WebSocket (notification:new al destinatario) y push a la app móvil (FCM, services/push.ts).
//
// Destinatarios: miembros de la org según user_organizations (acceso real, multi-org) más
// users.organization_id (org primaria, por compatibilidad). Para avisos de leads y mensajes solo
// los que tienen permiso del módulo (opportunities / conversations); owner/admin siempre.
// Las preferencias (notification_prefs) solo filtran el push; la campanita y el WS no cambian.

import { pool } from '../db.ts';
import { broadcast } from './ws-manager.ts';
import { sendPush } from './push.ts';
import type { ModuleKey } from '../auth/perms.ts';

export type NotifyType =
  | 'new_lead' | 'new_message' | 'appointment_booked' | 'appointment_cancelled'
  | 'task_due' | 'wa_down' | 'system';

export type PrefKey = 'new_lead' | 'new_message' | 'appointment' | 'task' | 'system';
export const PREF_KEYS: PrefKey[] = ['new_lead', 'new_message', 'appointment', 'task', 'system'];

export type Audience = 'all' | 'admins' | { userIds: string[]; includeAdmins?: boolean };

export interface NotifyInput {
  orgId: string;
  audience: Audience;
  type: NotifyType;
  title: string;
  body: string;
  entityType?: string;
  entityId?: string | null;
  // Ids para que la app abra la pantalla correcta (opportunityId, conversationId, contactId, appointmentId)
  data?: Record<string, string | null | undefined>;
  // Tipo guardado en la campanita (por defecto `type`); los avisos antiguos guardan 'system'/'automation'
  bellType?: string;
}

const PREF_BY_TYPE: Record<NotifyType, PrefKey> = {
  new_lead: 'new_lead', new_message: 'new_message',
  appointment_booked: 'appointment', appointment_cancelled: 'appointment',
  task_due: 'task', wa_down: 'system', system: 'system',
};
const CHANNEL_BY_TYPE: Record<NotifyType, string> = {
  new_lead: 'leads', new_message: 'messages',
  appointment_booked: 'agenda', appointment_cancelled: 'agenda', task_due: 'agenda',
  wa_down: 'system', system: 'system',
};
const MODULE_BY_TYPE: Partial<Record<NotifyType, ModuleKey>> = {
  new_lead: 'opportunities', new_message: 'conversations',
};

// Antispam de mensajes: un push por conversación y usuario cada 2 minutos (memoria del proceso)
const MESSAGE_COOLDOWN_MS = 2 * 60_000;
const lastMessagePush = new Map<string, number>();

function takeMessageSlot(userId: string, conversationId: string): boolean {
  const now = Date.now();
  if (lastMessagePush.size > 5000) {
    for (const [k, t] of lastMessagePush) if (now - t >= MESSAGE_COOLDOWN_MS) lastMessagePush.delete(k);
  }
  const key = `${userId}:${conversationId}`;
  const prev = lastMessagePush.get(key);
  if (prev !== undefined && now - prev < MESSAGE_COOLDOWN_MS) return false;
  lastMessagePush.set(key, now);
  return true;
}

// Solo para tests: olvida el antispam
export function resetMessageCooldown() { lastMessagePush.clear(); }

// Miembros de la org que reciben el aviso. org_role: rol en user_organizations (o el de users si
// solo es su org primaria). Para el permiso de módulo se usa además users.role, que es el que
// aplica requireModule (auth/perms.ts).
async function recipients(orgId: string, audience: Audience, mod: ModuleKey | undefined): Promise<string[]> {
  const kind = typeof audience === 'string' ? audience : 'users';
  const userIds = typeof audience === 'object' ? audience.userIds.filter(Boolean) : [];
  const includeAdmins = typeof audience === 'object' && audience.includeAdmins === true;
  const { rows } = await pool.query<{ id: string }>(
    `WITH members AS (
       SELECT u.id, u.role AS user_role, u.permissions,
              COALESCE(uo.role, u.role) AS org_role
       FROM users u
       LEFT JOIN user_organizations uo ON uo.user_id = u.id AND uo.organization_id = $1
       WHERE u.organization_id = $1 OR uo.user_id IS NOT NULL
     )
     SELECT id FROM members
     WHERE ($2::text = 'all'
            OR ($2::text = 'admins' AND org_role IN ('owner','admin'))
            OR ($2::text = 'users' AND (id = ANY($3::uuid[]) OR ($4::boolean AND org_role IN ('owner','admin')))))
       AND ($5::text IS NULL OR org_role IN ('owner','admin') OR user_role IN ('owner','admin')
            OR permissions ? $5)`,
    [orgId, kind, userIds, includeAdmins, mod ?? null],
  );
  return rows.map(r => r.id);
}

// Texto del push para un mensaje: el cuerpo (máx. 120) o una etiqueta según el tipo de medio
const MEDIA_LABEL: Record<string, string> = {
  image: '📷 Foto', video: '🎥 Video', audio: '🎤 Audio', ptt: '🎤 Audio',
  document: '📄 Documento', sticker: '🔖 Sticker',
};
export function messagePreview(msgType: string, body: string | null | undefined): string {
  const text = (body ?? '').trim();
  if (text) return text.length > 120 ? `${text.slice(0, 119)}…` : text;
  return MEDIA_LABEL[msgType] ?? '📎 Archivo adjunto';
}

export async function notify(n: NotifyInput): Promise<void> {
  const users = await recipients(n.orgId, n.audience, MODULE_BY_TYPE[n.type]);
  if (!users.length) return;

  const data: Record<string, string> = { type: n.type, orgId: n.orgId };
  for (const [k, v] of Object.entries(n.data ?? {})) if (v) data[k] = String(v);

  // Mensajes: sin fila en la campanita (se llenaría) y con antispam por conversación
  let targets = users;
  if (n.type === 'new_message') {
    const conv = data.conversationId ?? '';
    targets = users.filter(u => takeMessageSlot(u, conv));
    if (!targets.length) return;
  } else {
    await pool.query(
      `INSERT INTO notifications (organization_id, user_id, type, title, body, entity_type, entity_id)
       SELECT $1, u, $3, $4, $5, $6, $7 FROM unnest($2::uuid[]) AS u`,
      [n.orgId, users, n.bellType ?? n.type, n.title, n.body, n.entityType ?? null, n.entityId ?? null],
    );
  }
  for (const u of targets) broadcast(n.orgId, 'notification:new', { userId: u, type: n.type, title: n.title, body: n.body, data });

  // Push a los dispositivos de los que no lo desactivaron para esta org
  const { rows } = await pool.query<{ token: string }>(
    `SELECT t.token FROM push_tokens t
     LEFT JOIN notification_prefs p ON p.user_id = t.user_id AND p.organization_id = $2
     WHERE t.user_id = ANY($1::uuid[])
       AND COALESCE((p.prefs ->> $3)::boolean, true)`,
    [targets, n.orgId, PREF_BY_TYPE[n.type]],
  );
  sendPush(rows.map(r => r.token), {
    title: n.title, body: n.body, data,
    channelId: CHANNEL_BY_TYPE[n.type],
    highPriority: n.type === 'new_lead' || n.type === 'new_message',
  });
}

// Versión "dispara y olvida" para caminos donde un fallo del aviso no debe afectar al llamador
export function notifyBg(n: NotifyInput): void {
  notify(n).catch(e => console.error(`[notify] ${n.type}:`, e));
}

// Audiencia de un lead/mensaje: el responsable de la oportunidad abierta del contacto + admins;
// sin responsable, todos (con permiso del módulo).
export async function leadAudience(orgId: string, contactId: string | null | undefined, opportunityId?: string | null): Promise<Audience> {
  if (!contactId && !opportunityId) return 'all';
  const { rows } = await pool.query<{ owner_id: string | null }>(
    opportunityId
      ? `SELECT owner_id FROM opportunities WHERE id = $2 AND organization_id = $1`
      : `SELECT owner_id FROM opportunities WHERE organization_id = $1 AND contact_id = $2 AND status = 'open'
         ORDER BY (owner_id IS NULL), created_at DESC LIMIT 1`,
    [orgId, opportunityId ?? contactId],
  );
  const owner = rows[0]?.owner_id;
  return owner ? { userIds: [owner], includeAdmins: true } : 'all';
}

// Oportunidad creada sola (automatización create_opportunity, formulario de anuncios de Facebook):
// aviso "Nuevo lead" en la campanita y push con prioridad alta. No bloquea ni lanza.
export function notifyNewLead(orgId: string, opportunityId: string, contactId: string | null, title: string, source?: string | null): void {
  leadAudience(orgId, contactId, opportunityId)
    .then(audience => notify({
      orgId, audience, type: 'new_lead',
      title: 'Nuevo lead',
      body: source ? `${title} · ${source}` : title,
      entityType: 'opportunity', entityId: opportunityId,
      data: { opportunityId, contactId },
    }))
    .catch(e => console.error('[notify] new_lead:', e));
}
