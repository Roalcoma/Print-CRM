// Procesamiento de comentarios de Instagram: por polling (Standard Access) o por webhook
// (requiere Advanced Access). Ambos caminos pasan por handleIgComment, que deduplica.

import { pool } from '../db.ts';
import { igBase } from './instagram.ts';
import { fireIgCommentTrigger } from './automation-engine.ts';

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

const get = async <T>(url: string): Promise<T & { error?: { message: string } }> => (await fetch(url)).json();

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
      console.error(`[ig-comments] error en conexión ${conn.id}:`, e);
    }
  }
}
