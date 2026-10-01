// Endpoint que recibe webhooks de Evolution API.
// Formato: { event, instance, data: { ... } }

import { Router } from 'express';
import { pool } from '../db.ts';
import { broadcast } from '../services/ws-manager.ts';
import { handleIncomingWaMessage, fireWaNewMessageTrigger, fireContactCreatedTrigger } from '../services/automation-engine.ts';

export const waWebhookRouter = Router();

// POST /api/wa/webhook/:secret
waWebhookRouter.post('/:secret', async (req, res) => {
  const { secret } = req.params;

  const settingsRes = await pool.query(
    'SELECT id, organization_id FROM wa_settings WHERE webhook_secret = $1',
    [secret],
  );
  if (!settingsRes.rows[0]) return res.status(404).json({ error: 'Secret no encontrado' });

  const instanceId: string = settingsRes.rows[0].id;
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
        `UPDATE wa_settings SET session_status = $1, updated_at = NOW() WHERE id = $2`,
        [mapped, instanceId],
      );
      broadcast(orgId, 'wa:status', { status: mapped, instanceId, raw: d.state });
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
      // En mensajes propios (fromMe) pushName es el nombre de la cuenta del negocio: no sirve para nombrar el chat
      const senderName = direction === 'inbound' ? msg.pushName?.trim() || undefined : undefined;
      const displayName = senderName ?? phone;
      const timestamp = new Date((msg.messageTimestamp ?? Date.now() / 1000) * 1000);

      const { msgType, body, mediaUrl, mediaMime, mediaFilename } = parseMessage(msg);
      const adRef = direction === 'inbound' ? extractAdRef(msg) : null;

      // Idempotencia: Evolution puede reenviar el mismo evento (reintentos, reconexiones). Primero se
      // guarda el mensaje (ON CONFLICT por wa_message_id) y SOLO si es nuevo se tocan los contadores de
      // la conversación, el contacto, los eventos y el motor de automatizaciones. Todo en una transacción:
      // el upsert de la conversación bloquea su fila, así dos copias simultáneas del evento se serializan.
      let convId: string;
      let isNewConversation: boolean;
      let finalMsgId: string | undefined;
      let finalMsgCreatedAt: string | undefined;
      const tx = await pool.connect();
      try {
        await tx.query('BEGIN');
        // Crear la conversación (sin contadores todavía) o bloquear la existente sin cambiarla
        const convRes = await tx.query<{ id: string; is_new: boolean }>(
          `INSERT INTO conversations (organization_id, wa_chat_id, display_name, phone, last_message_at, last_message_preview, unread_count)
           VALUES ($1, $2, $3, $4, $5, $6, 0)
           ON CONFLICT (organization_id, wa_chat_id) DO UPDATE SET updated_at = conversations.updated_at
           RETURNING id, (xmax = 0) AS is_new`,
          [orgId, chatId, displayName, phone, timestamp, previewText(msgType, body)],
        );
        convId = convRes.rows[0].id;
        isNewConversation = convRes.rows[0].is_new === true;

        // Para outbound: intentar hacer UPDATE de un mensaje pendiente sin wa_message_id
        // (solo si este wa_message_id no está ya guardado: un eco repetido no debe adoptar otro pendiente)
        if (direction === 'outbound') {
          const upd = await tx.query<{ id: string; created_at: string }>(
            `UPDATE conv_messages SET wa_message_id = $1, status = 'sent'
             WHERE id = (
               SELECT id FROM conv_messages
               WHERE conversation_id = $2 AND direction = 'outbound'
               AND body IS NOT DISTINCT FROM $3
               AND wa_message_id IS NULL
               AND created_at > NOW() - INTERVAL '3 minutes'
               ORDER BY created_at DESC LIMIT 1
             )
             AND NOT EXISTS (SELECT 1 FROM conv_messages WHERE wa_message_id = $1)
             RETURNING id, created_at`,
            [waId, convId, body ?? null],
          );
          if (upd.rows[0]) { finalMsgId = upd.rows[0].id; finalMsgCreatedAt = upd.rows[0].created_at; }
        }

        if (!finalMsgId) {
          const msgRes = await tx.query<{ id: string; created_at: string }>(
            `INSERT INTO conv_messages (conversation_id, organization_id, wa_message_id, direction, msg_type, body, media_url, media_mime, media_filename, sender_name, ad_ref)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             ON CONFLICT (wa_message_id) DO NOTHING
             RETURNING id, created_at`,
            [convId, orgId, waId, direction, msgType, body ?? null,
             mediaUrl ?? null, mediaMime ?? null, mediaFilename ?? null, senderName ?? null, adRef],
          );
          if (msgRes.rows[0]) { finalMsgId = msgRes.rows[0].id; finalMsgCreatedAt = msgRes.rows[0].created_at; }
        }

        // Mensaje ya procesado (evento duplicado): no se cuenta ni se dispara nada
        if (!finalMsgId) { await tx.query('ROLLBACK'); return; }

        await tx.query(
          `UPDATE conversations SET
             last_message_at      = $2,
             last_message_preview = $3,
             unread_count         = unread_count + $4,
             display_name         = COALESCE($5::text, display_name),
             updated_at           = NOW()
           WHERE id = $1`,
          [convId, timestamp, previewText(msgType, body), direction === 'inbound' ? 1 : 0, senderName ?? null],
        );
        await tx.query('COMMIT');
      } catch (e) {
        await tx.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        tx.release();
      }

      let contactId: string | null = null;
      if (direction === 'inbound') {
        // Si no hay nombre, usar el teléfono como nombre para contactos desconocidos
        contactId = await linkContact(orgId, convId, phone, senderName || phone || displayName);
        // Primer anuncio del que vino el contacto (no se pisa con clics posteriores)
        if (contactId && adRef) {
          await pool.query(`UPDATE contacts SET ad_source = $1 WHERE id = $2 AND ad_source IS NULL`, [adRef, contactId]);
        }

        // Motor de automatizaciones: reanudar un run que espera respuesta de este número. Se espera
        // a que tome el run antes de disparar "nuevo mensaje": así un flujo recién iniciado que llegue a
        // wait_for_reply no se reanuda con este mismo mensaje (nunca lanza: registra sus errores).
        await handleIncomingWaMessage(orgId, chatId, body ?? '');

        // Disparar automatizaciones de nuevo mensaje WA
        if (isNewConversation) {
          fireWaNewMessageTrigger(orgId, contactId).catch(e => console.error('fireWaNewMessageTrigger:', e));
        }
      }

      broadcast(orgId, 'message:new', {
        conversationId: convId,
        message: {
          id: finalMsgId, conversation_id: convId, wa_message_id: waId,
          direction, msg_type: msgType, body: body ?? null,
          media_url: mediaUrl ?? null, media_mime: mediaMime ?? null,
          sender_name: senderName ?? null, ad_ref: adRef,
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
  contextInfo?: Record<string, unknown>;
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

export type AdRef = {
  title: string | null; body: string | null; source_app: string | null; source_type: string | null;
  source_url: string | null; source_id: string | null; media_url: string | null;
  thumbnail: string | null; ctwa_clid: string | null; greeting: string | null;
};

// Datos del anuncio click-to-WhatsApp (externalAdReply) que trae el primer mensaje del lead.
export function extractAdRef(msg: { message?: Record<string, unknown>; contextInfo?: Record<string, unknown> }): AdRef | null {
  const inner = Object.values(msg.message ?? {}).find(
    v => v && typeof v === 'object' && 'contextInfo' in (v as object),
  ) as { contextInfo?: Record<string, unknown> } | undefined;
  const ctx = msg.contextInfo ?? inner?.contextInfo;
  const ad = ctx?.externalAdReply as Record<string, unknown> | undefined;
  if (!ad) return null;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);
  const thumb = str(ad.thumbnail);
  return {
    title:       str(ad.title),
    body:        str(ad.body),
    source_app:  str(ad.sourceApp),
    source_type: str(ad.sourceType),
    source_url:  str(ad.sourceUrl),
    source_id:   str(ad.sourceId),
    media_url:   str(ad.mediaUrl),
    // Miniatura embebida (base64): las URLs de fbcdn caducan en días
    thumbnail:   thumb && thumb.length < 200_000 ? `data:image/jpeg;base64,${thumb}` : null,
    ctwa_clid:   str(ad.ctwaClid),
    greeting:    str(ad.greetingMessageBody),
  };
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
        fireContactCreatedTrigger(orgId, contactId).catch(console.error);
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
        fireContactCreatedTrigger(orgId, contactId).catch(console.error);
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
