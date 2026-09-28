// Procesamiento de comentarios de Instagram: por polling (Standard Access) o por webhook
// (requiere Advanced Access). Ambos caminos pasan por handleIgComment, que deduplica.

import { pool } from '../db.ts';
import { igBase } from './instagram.ts';
import { fireIgCommentTrigger } from './automation-engine.ts';
import { broadcast } from './ws-manager.ts';

type Conn = {
  id: string;
  organization_id: string;
  access_token: string;
  instagram_business_id: string | null;
  page_id: string;
};

export type IgComment = {
  id: string;
  text?: string;
  username?: string;
  from?: { id: string; username?: string; name?: string };
  media?: { id: string };
};

// Devuelve true si el comentario era nuevo y se disparó el trigger.
export async function handleIgComment(conn: Conn, c: IgComment, mediaId?: string): Promise<boolean> {
  const ins = await pool.query(
    `INSERT INTO ig_processed_comments (comment_id, connection_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING RETURNING comment_id`,
    [c.id, conn.id],
  );
  if (!ins.rowCount) return false;

  const username = c.from?.username ?? c.username ?? c.from?.name ?? '';
  console.log(`[ig-comments] nuevo comentario ${c.id} de @${username} (org ${conn.organization_id})`);
  await fireIgCommentTrigger(conn.organization_id, {
    commentId: c.id,
    senderId: c.from?.id ?? '',
    senderName: username,
    text: c.text ?? '',
    mediaId: mediaId ?? c.media?.id ?? '',
    accessToken: conn.access_token,
    igUserId: conn.instagram_business_id ?? conn.page_id,
  });
  return true;
}

// La conexión a Meta desde el servidor tiene cortes intermitentes (ETIMEDOUT): un reintento.
const get = async <T>(url: string): Promise<T & { error?: { message: string } }> => {
  try {
    return await (await fetch(url)).json();
  } catch {
    await new Promise(r => setTimeout(r, 3000));
    return (await fetch(url)).json();
  }
};

export async function pollIgComments(): Promise<void> {
  const { rows } = await pool.query<Conn & { comments_polled_at: Date | null }>(
    `SELECT id, organization_id, access_token, instagram_business_id, page_id, comments_polled_at
     FROM social_connections WHERE platform = 'instagram' AND status = 'active'`,
  );

  for (const conn of rows) {
    // Primer poll: fijar la línea base y no disparar sobre comentarios viejos.
    if (!conn.comments_polled_at) {
      await pool.query(`UPDATE social_connections SET comments_polled_at = NOW() WHERE id = $1`, [conn.id]);
      console.log(`[ig-comments] línea base fijada para conexión ${conn.id}`);
      continue;
    }
    try {
      const base = igBase(conn.access_token);
      const t = conn.access_token;
      const owner = conn.instagram_business_id ?? conn.page_id;
      const me = await get<{ username?: string }>(`${base}/${t.startsWith('IG') ? 'me' : owner}?fields=username&access_token=${t}`);
      const media = await get<{ data?: { id: string; timestamp: string }[] }>(
        `${base}/${t.startsWith('IG') ? 'me' : owner}/media?fields=id,timestamp&limit=10&access_token=${t}`,
      );
      if (media.error) { console.error(`[ig-comments] media error conexión ${conn.id}:`, media.error.message); continue; }

      let fired = 0;
      for (const m of media.data ?? []) {
        const comments = await get<{ data?: (IgComment & { timestamp: string })[] }>(
          `${base}/${m.id}/comments?fields=id,text,timestamp,username,from&limit=50&access_token=${t}`,
        );
        if (comments.error) { console.error(`[ig-comments] comments error media ${m.id}:`, comments.error.message); continue; }
        for (const c of comments.data ?? []) {
          if (new Date(c.timestamp) <= conn.comments_polled_at) continue;
          const author = c.from?.username ?? c.username;
          if (author && author === me.username) continue; // respuestas propias
          if (await handleIgComment(conn, c, m.id)) fired++;
        }
      }
      if (fired) console.log(`[ig-comments] conexión ${conn.id}: ${fired} comentario(s) procesado(s)`);
    } catch (e) {
      console.error(`[ig-comments] error en conexión ${conn.id}: ${(e as Error).message} ${(e as Error).cause ?? ''}`);
    }
  }
}

// ── Teléfono dejado por DM ────────────────────────────────────────────────────
// El DM del flujo de comentarios invita a dejar el teléfono si no hay horario que
// sirva. Cuando la respuesta trae un número, se guarda en el contacto, se anota en
// su oportunidad abierta más reciente y se avisa al equipo.

const PHONE_RE = /\+?\d[\d\s().-]{5,18}\d/;

export function extractPhone(text: string): string | null {
  const m = text.match(PHONE_RE);
  if (!m) return null;
  const digits = m[0].replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return null;
  return (m[0].trim().startsWith('+') ? '+' : '') + digits;
}

export async function findIgContact(orgId: string, igsid: string) {
  const { rows } = await pool.query<{ id: string; first_name: string | null; last_name: string | null; phone: string | null }>(
    `SELECT id, first_name, last_name, phone FROM contacts WHERE organization_id = $1 AND ig_sender_id = $2 LIMIT 1`,
    [orgId, igsid],
  );
  return rows[0] ?? null;
}

export async function captureIgPhone(orgId: string, igsid: string, text: string): Promise<void> {
  const phone = extractPhone(text);
  if (!phone) return;
  const contact = await findIgContact(orgId, igsid);
  if (!contact) return;

  if (!contact.phone) {
    await pool.query(`UPDATE contacts SET phone = $1, updated_at = NOW() WHERE id = $2`, [phone, contact.id]);
  }
  const name = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || igsid;

  const opp = await pool.query<{ id: string }>(
    `SELECT id FROM opportunities WHERE organization_id = $1 AND contact_id = $2 AND status = 'open'
     ORDER BY created_at DESC LIMIT 1`,
    [orgId, contact.id],
  );
  if (opp.rows[0]) {
    await pool.query(
      `INSERT INTO opportunity_notes (organization_id, opportunity_id, body, author_name) VALUES ($1, $2, $3, 'Instagram')`,
      [orgId, opp.rows[0].id, `Dejó su teléfono por DM de Instagram: ${phone}`],
    );
  }

  const users = await pool.query<{ id: string }>(`SELECT id FROM users WHERE organization_id = $1`, [orgId]);
  for (const u of users.rows) {
    await pool.query(
      `INSERT INTO notifications (organization_id, user_id, type, title, body, entity_type, entity_id)
       VALUES ($1, $2, 'automation', $3, $4, 'contact', $5)`,
      [orgId, u.id, `${name} dejó su teléfono`, `Por DM de Instagram: ${phone}. Contáctalo lo antes posible.`, contact.id],
    );
    broadcast(orgId, 'notification:new', { userId: u.id });
  }
  console.log(`[ig-comments] teléfono capturado para contacto ${contact.id}`);
}
