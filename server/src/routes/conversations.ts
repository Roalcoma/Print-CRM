// CRUD de conversaciones + envío de mensajes vía Evolution API.

import { Router } from 'express';
import { pool } from '../db.ts';
import { EvolutionClient } from '../services/evolution.ts';
import { broadcast } from '../services/ws-manager.ts';
import { sendIgDm } from '../services/instagram.ts';

export const conversationsRouter = Router();

type WASetting = {
  evo_url: string;
  evo_api_key: string;
  instance_name: string;
};

async function getWACfg(orgId: string): Promise<WASetting | null> {
  const res = await pool.query<WASetting>(
    'SELECT evo_url, evo_api_key, instance_name FROM wa_settings WHERE organization_id = $1',
    [orgId],
  );
  return res.rows[0] ?? null;
}

// GET /api/conversations — lista con paginación
conversationsRouter.get('/', async (req, res) => {
  try {
    const orgId = req.auth!.organizationId;
    const { status = 'open', q, limit = '50', offset = '0', unread, starred } = req.query as Record<string, string>;

    let where = `WHERE c.organization_id = $1 AND c.wa_chat_id NOT LIKE '%@g.us' AND c.wa_chat_id NOT LIKE '%@newsletter' AND (c.channel IS NULL OR c.channel IN ('whatsapp','instagram_dm','facebook_dm'))`;
    const vals: unknown[] = [orgId];
    let i = 2;

    if (starred === 'true') {
      where += ` AND c.starred = true`;
    } else if (status !== 'all' && status !== 'recent') {
      where += ` AND c.status = $${i++}`; vals.push(status);
    }
    if (unread === 'true') { where += ` AND c.unread_count > 0`; }
    if (q) { where += ` AND (c.display_name ILIKE $${i} OR c.phone ILIKE $${i})`; vals.push(`%${q}%`); i++; }

    const result = await pool.query(
      `SELECT c.*,
              ct.id   AS contact_id_linked,
              ct.first_name || ' ' || COALESCE(ct.last_name, '') AS contact_full_name
       FROM conversations c
       LEFT JOIN contacts ct ON ct.id = c.contact_id
       ${where}
       ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC
       LIMIT $${i} OFFSET $${i + 1}`,
      [...vals, Number(limit), Number(offset)],
    );

    const total = await pool.query(`SELECT COUNT(*) FROM conversations c ${where}`, vals);
    res.json({ conversations: result.rows, total: Number(total.rows[0].count) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar conversaciones' });
  }
});

// GET /api/conversations/:id/messages
conversationsRouter.get('/:id/messages', async (req, res) => {
  try {
    const orgId = req.auth!.organizationId;
    const { id } = req.params;
    const { limit = '50', before } = req.query as Record<string, string>;

    // Verificar que la conversación pertenece a la org.
    const conv = await pool.query(
      'SELECT id FROM conversations WHERE id = $1 AND organization_id = $2',
      [id, orgId],
    );
    if (!conv.rows[0]) return res.status(404).json({ error: 'Conversación no encontrada' });

    let sql = `SELECT * FROM conv_messages WHERE conversation_id = $1`;
    const vals: unknown[] = [id];
    if (before) { sql += ` AND created_at < $2`; vals.push(before); }
    sql += ` ORDER BY created_at DESC LIMIT $${vals.length + 1}`;
    vals.push(Number(limit));

    const msgs = await pool.query(sql, vals);
    // Marcar como leídos.
    await pool.query(
      `UPDATE conversations SET unread_count = 0 WHERE id = $1`,
      [id],
    );
    res.json(msgs.rows.reverse());
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar mensajes' });
  }
});

// POST /api/conversations/:id/messages — enviar mensaje
conversationsRouter.post('/:id/messages', async (req, res) => {
  try {
    const orgId = req.auth!.organizationId;
    const { id } = req.params;
    const { body, type = 'text', mediaUrl } = req.body as { body?: string; type?: string; mediaUrl?: string };

    const convRes = await pool.query<{ wa_chat_id: string; channel: string; social_account_id: string | null }>(
      'SELECT wa_chat_id, channel, social_account_id FROM conversations WHERE id = $1 AND organization_id = $2',
      [id, orgId],
    );
    if (!convRes.rows[0]) return res.status(404).json({ error: 'Conversación no encontrada' });

    const { wa_chat_id: chatId, channel, social_account_id } = convRes.rows[0];

    let waId: string | null = null;

    if (channel === 'instagram_dm') {
      // Enviar DM vía Instagram Graph API
      if (type !== 'text' || !body) return res.status(400).json({ error: 'Instagram DM solo soporta texto por ahora' });
      if (!social_account_id) return res.status(503).json({ error: 'Cuenta de Instagram no configurada' });

      const scRes = await pool.query<{ access_token: string; instagram_business_id: string }>(
        'SELECT access_token, instagram_business_id FROM social_connections WHERE id = $1',
        [social_account_id],
      );
      if (!scRes.rows[0]) return res.status(503).json({ error: 'Conexión de Instagram no encontrada' });

      const { access_token, instagram_business_id } = scRes.rows[0];
      const recipientId = chatId.replace(/^ig_/, '');
      const result = await sendIgDm(instagram_business_id, access_token, recipientId, body) as { message_id?: string };
      waId = result.message_id ?? null;
    } else {
      // Enviar vía WhatsApp / Evolution API
      const cfg = await getWACfg(orgId);
      if (!cfg) return res.status(503).json({ error: 'WhatsApp no configurado' });

      const client = new EvolutionClient({ url: cfg.evo_url, apiKey: cfg.evo_api_key, instanceName: cfg.instance_name });
      const number = chatId.replace(/@\S+/, '');

      if (type === 'text' && body) {
        const result = await client.sendText(number, body);
        waId = result.key?.id ?? null;
      } else if (type === 'image' && mediaUrl) {
        const result = await client.sendImage(number, mediaUrl, body);
        waId = result.key?.id ?? null;
      } else {
        return res.status(400).json({ error: 'Tipo de mensaje no soportado o faltan datos' });
      }
    }

    const preview = type === 'text' ? (body ?? '').slice(0, 100) : '📷 Imagen';

    // Persistir el mensaje enviado.
    // Si waId es null (Evolution no lo retornó), guardamos sin conflict key.
    // El webhook messages.upsert llegará y hará el UPDATE con el waId real.
    const insertSql = waId
      ? `INSERT INTO conv_messages (conversation_id, organization_id, wa_message_id, direction, msg_type, body, media_url, status)
         VALUES ($1, $2, $3, 'outbound', $4, $5, $6, 'sent')
         ON CONFLICT (wa_message_id) DO NOTHING
         RETURNING id, created_at, wa_message_id`
      : `INSERT INTO conv_messages (conversation_id, organization_id, direction, msg_type, body, media_url, status)
         VALUES ($1, $2, 'outbound', $3, $4, $5, 'sent')
         RETURNING id, created_at, wa_message_id`;
    const insertVals = waId
      ? [id, orgId, waId, type, body ?? null, mediaUrl ?? null]
      : [id, orgId, type, body ?? null, mediaUrl ?? null];

    const msgRes = await pool.query<{ id: string; created_at: string; wa_message_id: string | null }>(
      insertSql, insertVals,
    );

    await pool.query(
      `UPDATE conversations SET last_message_at = NOW(), last_message_preview = $1, updated_at = NOW() WHERE id = $2`,
      [preview, id],
    );

    const newMsg = {
      id: msgRes.rows[0]?.id,
      conversation_id: id,
      direction: 'outbound',
      msg_type: type,
      body: body ?? null,
      media_url: mediaUrl ?? null,
      wa_message_id: msgRes.rows[0]?.wa_message_id ?? null,
      status: 'sent',
      created_at: msgRes.rows[0]?.created_at ?? new Date().toISOString(),
    };

    // NO hacemos broadcast aquí: el webhook messages.upsert de Evolution
    // llega casi de inmediato y sincroniza a otros agentes abiertos.
    // Así evitamos doble inserción y race condition en el dedup.
    res.status(201).json(newMsg);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al enviar mensaje' });
  }
});

// PATCH /api/conversations/:id — cambiar status o vincular contacto
conversationsRouter.patch('/:id', async (req, res) => {
  try {
    const orgId = req.auth!.organizationId;
    const { id } = req.params;
    const { status, contact_id, display_name, starred } = req.body;

    const fields: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (status !== undefined)       { fields.push(`status = $${i++}`);       vals.push(status); }
    if (contact_id !== undefined)   { fields.push(`contact_id = $${i++}`);   vals.push(contact_id); }
    if (display_name !== undefined) { fields.push(`display_name = $${i++}`); vals.push(display_name); }
    if (starred !== undefined)      { fields.push(`starred = $${i++}`);      vals.push(starred); }
    if (!fields.length) return res.status(400).json({ error: 'Nada que actualizar' });

    fields.push(`updated_at = NOW()`);
    vals.push(id, orgId);
    await pool.query(
      `UPDATE conversations SET ${fields.join(', ')} WHERE id = $${i} AND organization_id = $${i + 1}`,
      vals,
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al actualizar conversación' });
  }
});

// GET /api/conversations/:id/timeline — mensajes + eventos CRM del contacto mezclados
conversationsRouter.get('/:id/timeline', async (req, res) => {
  try {
    const orgId = req.auth!.organizationId;
    const { id } = req.params;

    const convRes = await pool.query<{ contact_id: string | null }>(
      'SELECT contact_id FROM conversations WHERE id = $1 AND organization_id = $2',
      [id, orgId],
    );
    if (!convRes.rows[0]) return res.status(404).json({ error: 'Conversación no encontrada' });

    const contactId = convRes.rows[0].contact_id;

    await pool.query('UPDATE conversations SET unread_count = 0 WHERE id = $1', [id]);

    const msgs = await pool.query(
      `SELECT 'message' AS item_type, created_at AS ts, id, direction, msg_type, body, media_url, media_mime, media_filename, sender_name, status, wa_message_id
       FROM conv_messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
      [id],
    );

    const items = msgs.rows.map(r => ({ type: 'message', ts: r.ts, data: r }));

    if (contactId) {
      const appts = await pool.query(
        `SELECT id, title, status, start_at, end_at, meeting_url, created_at
         FROM appointments WHERE contact_id = $1 AND organization_id = $2 ORDER BY created_at`,
        [contactId, orgId],
      );
      for (const a of appts.rows) items.push({ type: 'appointment', ts: a.created_at, data: a });

      const opps = await pool.query(
        `SELECT o.id, o.title, o.status, o.value, o.created_at, s.name AS stage_name, s.color AS stage_color, p.name AS pipeline_name
         FROM opportunities o
         LEFT JOIN pipeline_stages s ON s.id = o.stage_id
         LEFT JOIN pipelines p ON p.id = o.pipeline_id
         WHERE o.contact_id = $1 AND o.organization_id = $2 ORDER BY o.created_at`,
        [contactId, orgId],
      );
      for (const o of opps.rows) items.push({ type: 'opportunity', ts: o.created_at, data: o });
    }

    items.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
    res.json(items);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar timeline' });
  }
});

// DELETE /api/conversations/:id
conversationsRouter.delete('/:id', async (req, res) => {
  try {
    const orgId = req.auth!.organizationId;
    const { id } = req.params;
    await pool.query(
      'DELETE FROM conversations WHERE id = $1 AND organization_id = $2',
      [id, orgId],
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al eliminar conversación' });
  }
});

// GET /api/conversations/:id/contact — contacto + oportunidades + citas
conversationsRouter.get('/:id/contact', async (req, res) => {
  try {
    const orgId = req.auth!.organizationId;
    const { id } = req.params;

    const convRes = await pool.query<{ contact_id: string | null; phone: string | null; display_name: string }>(
      'SELECT contact_id, phone, display_name FROM conversations WHERE id = $1 AND organization_id = $2',
      [id, orgId],
    );
    if (!convRes.rows[0]) return res.status(404).json({ error: 'Not found' });

    const contactId = convRes.rows[0].contact_id;
    // Pasamos el teléfono real de la conversación para mostrarlo en el panel
    const convPhone = convRes.rows[0].phone;
    if (!contactId) return res.json({ contact: null, opportunities: [], appointments: [], conv_phone: convPhone });

    const [cRes, oRes, aRes] = await Promise.all([
      pool.query('SELECT * FROM contacts WHERE id = $1 AND organization_id = $2', [contactId, orgId]),
      pool.query(
        `SELECT o.*, s.name AS stage_name, s.color AS stage_color, p.name AS pipeline_name
         FROM opportunities o
         LEFT JOIN pipeline_stages s ON s.id = o.stage_id
         LEFT JOIN pipelines p ON p.id = o.pipeline_id
         WHERE o.contact_id = $1 AND o.organization_id = $2 ORDER BY o.created_at DESC`,
        [contactId, orgId],
      ),
      pool.query(
        `SELECT * FROM appointments WHERE contact_id = $1 AND organization_id = $2 ORDER BY start_at DESC LIMIT 5`,
        [contactId, orgId],
      ),
    ]);

    res.json({
      contact: cRes.rows[0] ?? null,
      opportunities: oRes.rows,
      appointments: aRes.rows,
      conv_phone: convPhone,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar contacto' });
  }
});

// POST /api/conversations — crear conversación manualmente (para iniciar chat nuevo)
conversationsRouter.post('/', async (req, res) => {
  try {
    const orgId = req.auth!.organizationId;
    const { phone, display_name, contact_id } = req.body as { phone: string; display_name?: string; contact_id?: string };
    if (!phone) return res.status(400).json({ error: 'Falta el número de teléfono' });

    // Formato chatId de WA: código de país + número + @s.whatsapp.net (sin +)
    // Evolution API siempre entrega JIDs con @s.whatsapp.net; usar @c.us causaría duplicados.
    const waPhone = phone.replace(/\D/g, '');
    const chatId = `${waPhone}@s.whatsapp.net`;

    // Si ya existe, vincular el contacto solo si no tenía uno asignado
    const result = await pool.query<{ id: string }>(
      `INSERT INTO conversations (organization_id, wa_chat_id, display_name, phone, contact_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (organization_id, wa_chat_id) DO UPDATE
         SET updated_at = NOW(),
             contact_id = COALESCE(conversations.contact_id, EXCLUDED.contact_id)
       RETURNING id`,
      [orgId, chatId, display_name ?? phone, waPhone, contact_id ?? null],
    );
    res.status(201).json({ id: result.rows[0].id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al crear conversación' });
  }
});
