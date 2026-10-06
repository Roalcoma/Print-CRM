// Bandeja de conversaciones de redes sociales (IG DM / FB Messenger).
// La usan el webhook de Meta (mensajes entrantes y ecos de los enviados) y el motor
// de automatizaciones (comentario, respuesta pública y DM del flujo de Instagram).

import { pool } from '../db.ts';
import { broadcast } from './ws-manager.ts';
import { notifyBg, leadAudience, messagePreview } from './notify.ts';

export type SocialMessage = {
  orgId: string;
  socialAccountId: string;
  channel: 'instagram_dm' | 'facebook_dm';
  chatId: string;              // ig_<IGSID> / fb_<PSID>
  displayName: string;
  text: string | null;
  mid: string;                 // id único del mensaje (dedupe)
  direction: 'inbound' | 'outbound';
  contactId?: string | null;
};

export async function upsertSocialConversation(m: SocialMessage): Promise<void> {
  try {
    const convRes = await pool.query<{ id: string; contact_id: string | null }>(
      `INSERT INTO conversations
         (organization_id, wa_chat_id, display_name, channel, social_account_id, contact_id,
          last_message_at, last_message_preview, unread_count)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8)
       ON CONFLICT (organization_id, wa_chat_id) DO UPDATE SET
         contact_id           = COALESCE(conversations.contact_id, EXCLUDED.contact_id),
         display_name         = CASE WHEN conversations.display_name IS NULL OR conversations.display_name ~ '^[0-9]+$'
                                     THEN EXCLUDED.display_name ELSE conversations.display_name END,
         last_message_at      = NOW(),
         last_message_preview = EXCLUDED.last_message_preview,
         unread_count         = conversations.unread_count + EXCLUDED.unread_count,
         status               = 'open',
         updated_at           = NOW()
       RETURNING id, contact_id`,
      [m.orgId, m.chatId, m.displayName, m.channel, m.socialAccountId, m.contactId ?? null,
       m.text?.slice(0, 100) ?? null, m.direction === 'inbound' ? 1 : 0],
    );
    const convId = convRes.rows[0].id;

    const ins = await pool.query(
      `INSERT INTO conv_messages (conversation_id, organization_id, wa_message_id, direction, msg_type, body)
       VALUES ($1, $2, $3, $4, 'text', $5)
       ON CONFLICT (wa_message_id) DO NOTHING
       RETURNING id`,
      [convId, m.orgId, m.mid, m.direction, m.text],
    );

    // Push de mensaje entrante (solo si es nuevo: Meta reintenta los webhooks)
    if (m.direction === 'inbound' && ins.rowCount) {
      const contactId = convRes.rows[0].contact_id ?? m.contactId ?? null;
      leadAudience(m.orgId, contactId).then(audience => notifyBg({
        orgId: m.orgId, audience, type: 'new_message',
        title: m.displayName || (m.channel === 'instagram_dm' ? 'Instagram' : 'Facebook'),
        body: messagePreview('text', m.text),
        data: { conversationId: convId, contactId },
      })).catch(e => console.error('[notify] new_message:', e));
    }

    broadcast(m.orgId, 'message:new', { conversationId: convId });
    const convFull = await pool.query('SELECT * FROM conversations WHERE id = $1', [convId]);
    broadcast(m.orgId, 'conversation:update', convFull.rows[0]);
  } catch (e) {
    console.error('upsertSocialConversation error:', e);
  }
}
