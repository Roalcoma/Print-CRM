// Endpoint que recibe webhooks de Evolution API.
// Formato: { event, instance, data: { ... } }

import { Router } from 'express';
import { pool } from '../db.ts';
import { broadcast } from '../services/ws-manager.ts';

export const waWebhookRouter = Router();

// POST /api/wa/webhook/:secret
waWebhookRouter.post('/:secret', async (req, res) => {
  const { secret } = req.params;

  const settingsRes = await pool.query(
    'SELECT organization_id FROM wa_settings WHERE webhook_secret = $1',
    [secret],
  );
  if (!settingsRes.rows[0]) return res.status(404).json({ error: 'Secret no encontrado' });

  const orgId: string = settingsRes.rows[0].organization_id;
  res.json({ ok: true }); // responder rápido a Evolution

  try {
    const { event, data } = req.body as { event: string; instance: string; data: unknown };

    // ── Estado de conexión ──────────────────────────────────────────────────
    if (event === 'connection.update') {
      const d = data as { state?: string; statusReason?: number };
      const stateMap: Record<string, string> = { open: 'connected', close: 'disconnected', connecting: 'connecting' };
      const mapped = stateMap[d.state ?? ''] ?? 'disconnected';
      await pool.query(
        `UPDATE wa_settings SET session_status = $1, updated_at = NOW() WHERE organization_id = $2`,
        [mapped, orgId],
      );
      broadcast(orgId, 'wa:status', { status: mapped, raw: d.state });
      return;
    }

    // ── Mensaje nuevo o enviado ─────────────────────────────────────────────
    if (event === 'messages.upsert') {
      const msg = data as EvoMessage;
      const chatId = msg.key.fromMe ? msg.key.remoteJid : msg.key.remoteJid;

      // Ignorar grupos y newsletters
      if (chatId.endsWith('@g.us') || chatId.endsWith('@newsletter')) return;

      const direction = msg.key.fromMe ? 'outbound' : 'inbound';
      const waId = msg.key.id;
      const phone = phoneFromJid(chatId);
      const senderName = msg.pushName?.trim() || undefined;
      const displayName = senderName ?? phone;
      const timestamp = new Date((msg.messageTimestamp ?? Date.now() / 1000) * 1000);

      const { msgType, body, mediaUrl, mediaMime, mediaFilename } = parseMessage(msg);

      const convRes = await pool.query<{ id: string; is_new: boolean }>(
        `INSERT INTO conversations (organization_id, wa_chat_id, display_name, phone, last_message_at, last_message_preview, unread_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (organization_id, wa_chat_id) DO UPDATE SET
           last_message_at      = EXCLUDED.last_message_at,
           last_message_preview = EXCLUDED.last_message_preview,
           unread_count         = conversations.unread_count + EXCLUDED.unread_count,
           display_name         = COALESCE($8::text, conversations.display_name),
           updated_at           = NOW()
         RETURNING id, (xmax = 0) AS is_new`,
        [orgId, chatId, displayName, phone, timestamp, previewText(msgType, body),
         direction === 'inbound' ? 1 : 0, senderName ?? null],
      );
      const convId = convRes.rows[0].id;
      const isNewConversation = convRes.rows[0].is_new === true;

      let contactId: string | null = null;
      if (direction === 'inbound' && senderName) {
        contactId = await linkContact(orgId, convId, phone, senderName);
      }

      // Flujo automático solo en mensajes entrantes de conversaciones nuevas
      if (isNewConversation && direction === 'inbound') {
        const ruleRes = await pool.query<{ enabled: boolean }>(
          `SELECT enabled FROM automation_rules
           WHERE organization_id = $1 AND trigger_type = 'whatsapp_new_message'
           LIMIT 1`,
          [orgId],
        );
        if (ruleRes.rows[0]?.enabled) {
          // Actualizar contador de ejecuciones
          pool.query(
            `UPDATE automation_rules SET run_count = run_count + 1, last_run_at = NOW()
             WHERE organization_id = $1 AND trigger_type = 'whatsapp_new_message'`,
            [orgId],
          ).catch(() => {});
          createLeadFlow(orgId, contactId, displayName).catch(e => console.error('createLeadFlow:', e));
        }
      }

      // Para outbound: intentar hacer UPDATE de un mensaje pendiente sin wa_message_id
      let finalMsgId: string | undefined;
      let finalMsgCreatedAt: string | undefined;

      if (direction === 'outbound') {
        const upd = await pool.query<{ id: string; created_at: string }>(
          `UPDATE conv_messages SET wa_message_id = $1, status = 'sent'
           WHERE id = (
             SELECT id FROM conv_messages
             WHERE conversation_id = $2 AND direction = 'outbound'
             AND body IS NOT DISTINCT FROM $3
             AND wa_message_id IS NULL
             AND created_at > NOW() - INTERVAL '3 minutes'
             ORDER BY created_at DESC LIMIT 1
           )
           RETURNING id, created_at`,
          [waId, convId, body ?? null],
        );
        if (upd.rows[0]) { finalMsgId = upd.rows[0].id; finalMsgCreatedAt = upd.rows[0].created_at; }
      }

      if (!finalMsgId) {
        const msgRes = await pool.query<{ id: string; created_at: string }>(
          `INSERT INTO conv_messages (conversation_id, organization_id, wa_message_id, direction, msg_type, body, media_url, media_mime, media_filename, sender_name)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (wa_message_id) DO NOTHING
           RETURNING id, created_at`,
          [convId, orgId, waId, direction, msgType, body ?? null,
           mediaUrl ?? null, mediaMime ?? null, mediaFilename ?? null, senderName ?? null],
        );
        if (!msgRes.rows[0]) return;
        finalMsgId = msgRes.rows[0].id;
        finalMsgCreatedAt = msgRes.rows[0].created_at;
      }

      broadcast(orgId, 'message:new', {
        conversationId: convId,
        message: {
          id: finalMsgId, conversation_id: convId, wa_message_id: waId,
          direction, msg_type: msgType, body: body ?? null,
          media_url: mediaUrl ?? null, media_mime: mediaMime ?? null,
          sender_name: senderName ?? null,
          status: direction === 'outbound' ? 'sent' : 'received',
          created_at: finalMsgCreatedAt,
        },
      });
      const convFull = await pool.query('SELECT * FROM conversations WHERE id = $1', [convId]);
      broadcast(orgId, 'conversation:update', convFull.rows[0]);
    }

    // ── Actualización de estado de mensaje (ACK) ────────────────────────────
    if (event === 'messages.update') {
      const updates = Array.isArray(data) ? data : [data];
      for (const u of updates as EvoUpdate[]) {
        const waId = u.key?.id;
        const rawStatus = u.update?.status ?? '';
        const statusMap: Record<string, string> = {
          SERVER_ACK: 'sent', DELIVERY_ACK: 'delivered', READ: 'read', PLAYED: 'read',
        };
        const status = statusMap[rawStatus] ?? 'sent';
        if (!waId) continue;
        await pool.query(
          `UPDATE conv_messages SET status = $1 WHERE wa_message_id = $2 AND organization_id = $3`,
          [status, waId, orgId],
        );
        broadcast(orgId, 'message:ack', { waMessageId: waId, status });
      }
    }
  } catch (e) {
    console.error('wa-webhook error:', e);
  }
});

// ── Tipos internos ──────────────────────────────────────────────────────────

interface EvoMessage {
  key: { remoteJid: string; fromMe: boolean; id: string };
  pushName?: string;
  messageTimestamp?: number;
  messageType?: string;
  message?: Record<string, unknown>;
}

interface EvoUpdate {
  key?: { remoteJid: string; fromMe: boolean; id: string };
  update?: { status?: string };
}

// ── Utilidades ──────────────────────────────────────────────────────────────

function phoneFromJid(jid: string): string {
  if (jid.endsWith('@s.whatsapp.net')) return jid.replace('@s.whatsapp.net', '');
  if (jid.endsWith('@c.us'))          return jid.replace('@c.us', '');
  return '';
}

type ParsedMsg = { msgType: string; body: string | null; mediaUrl: string | null; mediaMime: string | null; mediaFilename: string | null };

function parseMessage(msg: EvoMessage): ParsedMsg {
  const m = msg.message ?? {};
  const type = msg.messageType ?? 'conversation';

  // Texto simple
  if (type === 'conversation' || type === 'text') {
    return { msgType: 'text', body: (m.conversation as string) ?? null, mediaUrl: null, mediaMime: null, mediaFilename: null };
  }
  if (type === 'extendedTextMessage') {
    const ext = m.extendedTextMessage as Record<string, unknown> | undefined;
    return { msgType: 'text', body: (ext?.text as string) ?? null, mediaUrl: null, mediaMime: null, mediaFilename: null };
  }

  // Imagen
  if (type === 'imageMessage') {
    const img = m.imageMessage as Record<string, unknown> | undefined;
    return { msgType: 'image', body: (img?.caption as string) ?? null, mediaUrl: null, mediaMime: (img?.mimetype as string) ?? 'image/jpeg', mediaFilename: null };
  }
  // Video
  if (type === 'videoMessage') {
    const vid = m.videoMessage as Record<string, unknown> | undefined;
    return { msgType: 'video', body: (vid?.caption as string) ?? null, mediaUrl: null, mediaMime: (vid?.mimetype as string) ?? 'video/mp4', mediaFilename: null };
  }
  // Audio / PTT
  if (type === 'audioMessage' || type === 'pttMessage') {
    const aud = (m.audioMessage ?? m.pttMessage) as Record<string, unknown> | undefined;
    return { msgType: type === 'pttMessage' ? 'ptt' : 'audio', body: null, mediaUrl: null, mediaMime: (aud?.mimetype as string) ?? 'audio/ogg', mediaFilename: null };
  }
  // Documento
  if (type === 'documentMessage') {
    const doc = m.documentMessage as Record<string, unknown> | undefined;
    return { msgType: 'document', body: (doc?.caption as string) ?? null, mediaUrl: null, mediaMime: (doc?.mimetype as string) ?? null, mediaFilename: (doc?.fileName as string) ?? null };
  }
  // Sticker
  if (type === 'stickerMessage') {
    return { msgType: 'sticker', body: null, mediaUrl: null, mediaMime: 'image/webp', mediaFilename: null };
  }

  return { msgType: type, body: null, mediaUrl: null, mediaMime: null, mediaFilename: null };
}

function previewText(msgType: string, body: string | null): string {
  if (body) return body.slice(0, 100);
  const map: Record<string, string> = {
    image: '📷 Imagen', video: '🎥 Video', audio: '🎵 Audio', ptt: '🎤 Nota de voz',
    document: '📄 Documento', sticker: '🔖 Sticker',
  };
  return map[msgType] ?? '📎 Archivo adjunto';
}

async function linkContact(orgId: string, convId: string, phone: string, waName: string): Promise<string | null> {
  try {
    const phoneRe = /^\+?[\d\s\-().]{7,20}$/;
    let effectivePhone = phone;
    if (!effectivePhone && phoneRe.test(waName.trim())) {
      effectivePhone = waName.trim().replace(/\D/g, '');
    }

    let contactId: string | null = null;

    if (effectivePhone) {
      const existing = await pool.query<{ id: string }>(
        `SELECT id FROM contacts WHERE organization_id = $1 AND regexp_replace(phone, '\\D', '', 'g') = $2 LIMIT 1`,
        [orgId, effectivePhone],
      );
      if (existing.rows[0]) {
        contactId = existing.rows[0].id;
      } else {
        const isPhoneName = phoneRe.test(waName.trim());
        const parts = waName.trim().split(/\s+/);
        const firstName = isPhoneName ? waName.trim() : parts[0];
        const lastName  = isPhoneName ? null : (parts.slice(1).join(' ') || null);
        const created = await pool.query<{ id: string }>(
          `INSERT INTO contacts (organization_id, first_name, last_name, phone, tags)
           VALUES ($1, $2, $3, $4, ARRAY['whatsapp']::text[])
           RETURNING id`,
          [orgId, firstName, lastName, effectivePhone],
        );
        contactId = created.rows[0].id;
      }
    } else {
      const convContact = await pool.query<{ contact_id: string | null }>(
        `SELECT contact_id FROM conversations WHERE id = $1`, [convId],
      );
      if (convContact.rows[0]?.contact_id) {
        contactId = convContact.rows[0].contact_id;
      } else {
        const parts = waName.trim().split(/\s+/);
        const created = await pool.query<{ id: string }>(
          `INSERT INTO contacts (organization_id, first_name, last_name, phone, tags)
           VALUES ($1, $2, $3, '', ARRAY['whatsapp']::text[])
           RETURNING id`,
          [orgId, parts[0], parts.slice(1).join(' ') || null],
        );
        contactId = created.rows[0].id;
      }
    }

    await pool.query(
      `UPDATE conversations SET contact_id = COALESCE(contact_id, $1), display_name = $2, updated_at = NOW() WHERE id = $3`,
      [contactId, waName, convId],
    );
    return contactId;
  } catch (e) {
    console.error('linkContact error:', e);
    return null;
  }
}

// Crea oportunidad, tarea y notificaciones cuando llega un lead nuevo por WhatsApp.
async function createLeadFlow(orgId: string, contactId: string | null, displayName: string): Promise<void> {
  // Primer pipeline de la org
  const pipeRes = await pool.query<{ id: string }>(
    `SELECT id FROM pipelines WHERE organization_id = $1 ORDER BY created_at LIMIT 1`,
    [orgId],
  );
  if (!pipeRes.rows[0]) return;
  const pipelineId = pipeRes.rows[0].id;

  // Primera etapa (por posición)
  const stageRes = await pool.query<{ id: string }>(
    `SELECT id FROM pipeline_stages WHERE pipeline_id = $1 ORDER BY position LIMIT 1`,
    [pipelineId],
  );
  if (!stageRes.rows[0]) return;
  const stageId = stageRes.rows[0].id;

  // Crear oportunidad
  const oppRes = await pool.query<{ id: string }>(
    `INSERT INTO opportunities (organization_id, pipeline_id, stage_id, contact_id, title, source, tags)
     VALUES ($1, $2, $3, $4, $5, 'whatsapp', ARRAY['whatsapp']::text[])
     RETURNING id`,
    [orgId, pipelineId, stageId, contactId, `Lead WhatsApp — ${displayName}`],
  );
  const oppId = oppRes.rows[0].id;

  // Todos los usuarios de la org
  const usersRes = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE organization_id = $1`,
    [orgId],
  );
  const userIds = usersRes.rows.map(u => u.id);
  if (!userIds.length) return;

  // Crear tarea (alta prioridad, vence mañana a las 9am)
  const dueAt = new Date();
  dueAt.setDate(dueAt.getDate() + 1);
  dueAt.setHours(9, 0, 0, 0);

  const taskRes = await pool.query<{ id: string }>(
    `INSERT INTO tasks (organization_id, title, description, status, priority, opportunity_id, due_at)
     VALUES ($1, $2, $3, 'pending', 'high', $4, $5)
     RETURNING id`,
    [orgId,
     `Responder lead de WhatsApp — ${displayName}`,
     `Nuevo lead entrante vía WhatsApp. Contactar a ${displayName} a la brevedad posible.`,
     oppId, dueAt],
  );
  const taskId = taskRes.rows[0].id;

  // Asignar tarea a todos los usuarios
  for (const uid of userIds) {
    await pool.query(
      `INSERT INTO task_assignees (task_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [taskId, uid],
    );
  }

  // Notificación para cada usuario + broadcast WS
  for (const uid of userIds) {
    await pool.query(
      `INSERT INTO notifications (organization_id, user_id, type, title, body, entity_type, entity_id)
       VALUES ($1, $2, 'new_lead', $3, $4, 'opportunity', $5)`,
      [orgId, uid,
       `Nuevo lead de WhatsApp`,
       `${displayName} inició una conversación por WhatsApp.`,
       oppId],
    );
    broadcast(orgId, 'notification:new', { userId: uid });
  }
}
