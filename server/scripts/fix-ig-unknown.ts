// Arreglo único: conversaciones de Instagram que quedaron como "Desconocido / Sin mensajes"
// (DMs con foto, reel o publicación compartida, que antes se guardaban sin texto).
//   1. Pide a Instagram el usuario de cada conversación con solo el id numérico.
//   2. Marca los mensajes vacíos como adjunto (el contenido original no se guardó).
// Uso (en el contenedor): tsx scripts/fix-ig-unknown.ts   ·   DRY_RUN=true para solo mostrar.
import { pool } from '../src/db.ts';
import { getIgUsername } from '../src/services/instagram.ts';

const DRY = process.env.DRY_RUN === 'true';
const EMPTY = '📎 Adjunto (foto, video o publicación; ábrelo en Instagram)';

const { rows: convs } = await pool.query<{ id: string; wa_chat_id: string; account_id: string }>(
  `SELECT c.id, c.wa_chat_id, c.social_account_id AS account_id FROM conversations c
   WHERE c.channel = 'instagram_dm' AND c.contact_id IS NULL
     AND (c.display_name IS NULL OR c.display_name ~ '^[0-9]+$') AND c.social_account_id IS NOT NULL`,
);
const tokens = new Map<string, string>();
let named = 0;
for (const c of convs) {
  if (!tokens.has(c.account_id)) {
    const t = (await pool.query<{ access_token: string }>('SELECT access_token FROM social_connections WHERE id = $1', [c.account_id])).rows[0];
    tokens.set(c.account_id, t?.access_token ?? '');
  }
  const token = tokens.get(c.account_id);
  if (!token) continue;
  const user = await getIgUsername(token, c.wa_chat_id.replace(/^ig_/, ''));
  console.log(`${c.wa_chat_id} → ${user ?? '(sin usuario)'}`);
  if (user && !DRY) { await pool.query('UPDATE conversations SET display_name = $1 WHERE id = $2', [user, c.id]); named++; }
}

const msgs = DRY
  ? await pool.query(`SELECT count(*)::int AS n FROM conv_messages m JOIN conversations c ON c.id = m.conversation_id
                      WHERE c.channel = 'instagram_dm' AND coalesce(m.body, '') = ''`)
  : await pool.query(`UPDATE conv_messages m SET body = $1 FROM conversations c
                      WHERE c.id = m.conversation_id AND c.channel = 'instagram_dm' AND coalesce(m.body, '') = ''`, [EMPTY]);
const previews = DRY ? { rowCount: 0 } : await pool.query(
  `UPDATE conversations SET last_message_preview = left($1, 100)
   WHERE channel = 'instagram_dm' AND coalesce(last_message_preview, '') = ''`, [EMPTY]);
console.log(`${DRY ? '[prueba] ' : ''}conversaciones: ${convs.length}, con usuario: ${named}, mensajes vacíos: ${DRY ? msgs.rows[0].n : msgs.rowCount}, vistas previas: ${previews.rowCount}`);
await pool.end();
