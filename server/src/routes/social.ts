import { createHmac, timingSafeEqual } from 'node:crypto';
// Integración con Facebook Messenger e Instagram DM via Meta Graph API.
// Requiere META_APP_ID y META_APP_SECRET en .env.

import { Router } from 'express';
import type express from 'express';
import { pool } from '../db.ts';
import { encryptSecret } from '../secrets.ts';
import { requireAdmin } from '../auth/perms.ts';
import { signOAuthState, verifyOAuthState } from '../auth/oauth-state.ts';
import { env } from '../env.ts';
import { broadcast } from '../services/ws-manager.ts';
import { handleIgComment, captureIgPhone, findIgContact } from '../services/ig-comments.ts';
import { upsertSocialConversation } from '../services/social-inbox.ts';
import { describeIgMessage, getIgUsername, getFbName, type IgDmMessage } from '../services/instagram.ts';
import { fireContactCreatedTrigger } from '../services/automation-engine.ts';
import { contactPhoneMatch, lockPhone, phoneMatchKey, withTransaction } from '../phone.ts';

export const socialRouter = Router();
export const socialPublicRouter = Router(); // callback OAuth (sin auth)
export const metaWebhookRouter = Router();

// Refresca tokens de Instagram que vencen en menos de 40 días.
// Instagram permite renovar cualquier token con más de 24h de vida.
export async function refreshInstagramTokens(): Promise<void> {
  try {
    const { rows } = await pool.query<{ id: string; access_token: string }>(
      `SELECT id, access_token FROM social_connections
       WHERE platform = 'instagram' AND status = 'active'
         AND (token_expires_at IS NULL OR token_expires_at < NOW() + INTERVAL '40 days')`,
    );
    for (const row of rows) {
      try {
        const res = await fetch(
          `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${row.access_token}`,
        );
        const json = await res.json() as { access_token?: string; expires_in?: number; error?: unknown };
        if (!json.access_token) { console.error('ig-refresh error', row.id, json.error); continue; }
        const expiresAt = json.expires_in
          ? new Date(Date.now() + json.expires_in * 1000).toISOString()
          : null;
        await pool.query(
          `UPDATE social_connections SET access_token = $1, token_expires_at = $2, updated_at = NOW() WHERE id = $3`,
          [encryptSecret(json.access_token), expiresAt, row.id],
        );
        console.log(`ig-refresh: token renovado para conexión ${row.id}, vence ${expiresAt}`);
      } catch (e) {
        console.error('ig-refresh: error renovando', row.id, e);
      }
    }
  } catch (e) {
    console.error('ig-refresh: error consultando conexiones', e);
  }
}

// META_GRAPH_URL: override solo para los tests (Meta simulado)
const META_BASE = `${process.env.META_GRAPH_URL ?? 'https://graph.facebook.com'}/v19.0`;
const META_APP_ID = process.env.META_APP_ID ?? '';
const META_APP_SECRET = process.env.META_APP_SECRET ?? '';
const IG_APP_ID = process.env.INSTAGRAM_APP_ID ?? '';
const IG_APP_SECRET = process.env.INSTAGRAM_APP_SECRET ?? '';

// Suscribe una cuenta/página a los webhooks de la app y loguea la respuesta de Meta.
async function subscribeApps(url: string, label: string) {
  try {
    const r = await fetch(url, { method: 'POST' });
    const json = await r.json();
    console.log(`[meta-subscribe] ${label}:`, JSON.stringify(json));
  } catch (e) {
    console.error(`[meta-subscribe] ${label} error:`, e);
  }
}

type SocialRow = {
  id: string;
  organization_id: string;
  platform: 'facebook' | 'instagram';
  page_id: string;
  page_name: string;
  page_picture: string | null;
  access_token: string;
  token_expires_at: string | null;
  instagram_business_id: string | null;
  status: string;
  webhook_verify_token: string;
  created_at: string;
};

function safeConnection(r: SocialRow) {
  return {
    id: r.id,
    platform: r.platform,
    page_id: r.page_id,
    page_name: r.page_name,
    page_picture: r.page_picture,
    instagram_business_id: r.instagram_business_id,
    status: r.status,
    token_expires_at: r.token_expires_at,
    created_at: r.created_at,
  };
}

// GET /social/connections — lista de conexiones activas
socialRouter.get('/connections', requireAdmin, async (req, res) => {
  try {
    const orgId = req.auth!.organizationId;
    const rows = await pool.query<SocialRow>(
      `SELECT * FROM social_connections WHERE organization_id = $1 AND status != 'disconnected' ORDER BY platform, created_at`,
      [orgId],
    );
    res.json({ connections: rows.rows.map(safeConnection) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar conexiones' });
  }
});

// GET /social/facebook/auth-url — URL OAuth de Meta
socialRouter.get('/facebook/auth-url', requireAdmin, async (req, res) => {
  if (!META_APP_ID || !META_APP_SECRET) {
    return res.status(503).json({ error: 'Integración con Meta no configurada. Añade META_APP_ID y META_APP_SECRET al .env del servidor.' });
  }
  const orgId = req.auth!.organizationId;
  const redirectUri = `${env.publicUrl}/api/social/facebook/callback`;
  // Solo lo que usa el CRM con páginas de Facebook (Messenger y comentarios); Instagram va por su propio login.
  // Lead Ads (leads_retrieval, pages_manage_ads) queda para cuando haga falta: exige su propio caso de uso en Meta.
  const scopes = [
    'pages_show_list',
    'pages_manage_metadata',   // suscribir la página al webhook
    'pages_read_engagement',
    'pages_read_user_content', // comentarios de la gente en las publicaciones
    'pages_messaging',         // Messenger y respuesta privada a comentarios
    'public_profile',
  ].join(',');

  const url = new URL('https://www.facebook.com/v19.0/dialog/oauth');
  url.searchParams.set('client_id', META_APP_ID);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', scopes);
  url.searchParams.set('state', signOAuthState({ userId: req.auth!.userId, orgId, provider: 'facebook' }));
  url.searchParams.set('response_type', 'code');

  res.json({ url: url.toString() });
});

// GET /social/instagram/auth-url — URL OAuth de Instagram Business Login
socialRouter.get('/instagram/auth-url', requireAdmin, async (req, res) => {
  if (!IG_APP_ID || !IG_APP_SECRET) {
    return res.status(503).json({ error: 'Integración con Instagram no configurada. Añade INSTAGRAM_APP_ID y INSTAGRAM_APP_SECRET al .env.' });
  }
  const orgId = req.auth!.organizationId;
  const redirectUri = `${env.publicUrl}/api/social/instagram/callback`;
  const scopes = [
    'instagram_business_basic',
    'instagram_business_manage_messages',
    'instagram_business_manage_comments',
  ].join(',');

  const url = new URL('https://www.instagram.com/oauth/authorize');
  url.searchParams.set('client_id', IG_APP_ID);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', scopes);
  url.searchParams.set('state', signOAuthState({ userId: req.auth!.userId, orgId, provider: 'instagram' }));
  url.searchParams.set('response_type', 'code');

  res.json({ url: url.toString() });
});

// GET /social/instagram/callback — callback OAuth de Instagram (público)
socialPublicRouter.get('/instagram/callback', async (req, res) => {
  const { code, state, error } = req.query as Record<string, string>;
  const frontendBase = process.env.FRONTEND_URL ?? env.publicUrl;
  if (error || !code || !state) {
    return res.redirect(`${frontendBase}/settings/social?error=oauth_denied`);
  }
  // state = JWT firmado (orgId, proveedor); un orgId plano o manipulado se rechaza
  const st = verifyOAuthState(state, 'instagram');
  if (!st) return res.redirect(`${frontendBase}/settings/social?error=oauth_state`);
  const orgId = st.orgId;

  try {
    const redirectUri = `${env.publicUrl}/api/social/instagram/callback`;

    // 1. Short-lived token
    const tokenRes = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: IG_APP_ID,
        client_secret: IG_APP_SECRET,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code,
      }),
    });
    const tokenJson = await tokenRes.json() as { access_token?: string; user_id?: number; error_message?: string };
    if (!tokenJson.access_token) {
      console.error('Instagram token error:', tokenJson);
      return res.redirect(`${frontendBase}/settings/social?error=token_failed`);
    }

    // 2. Long-lived token (~60 días)
    const llRes = await fetch(
      `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${IG_APP_SECRET}&access_token=${tokenJson.access_token}`,
    );
    const llJson = await llRes.json() as { access_token?: string; expires_in?: number };
    const longToken = llJson.access_token ?? tokenJson.access_token;
    const expiresAt = llJson.expires_in
      ? new Date(Date.now() + llJson.expires_in * 1000).toISOString()
      : null;

    // 3. Info de la cuenta — user_id devuelve el IGSID (17841...) que usa el webhook en entry.id
    const meRes = await fetch(
      `https://graph.instagram.com/v19.0/me?fields=id,user_id,name,username,profile_picture_url&access_token=${longToken}`,
    );
    const meJson = await meRes.json() as { id?: string; user_id?: string; name?: string; username?: string; profile_picture_url?: string };
    // Preferir user_id (IGSID) porque es el ID que envía Meta en entry.id del webhook
    const igId = meJson.user_id ?? meJson.id ?? String(tokenJson.user_id);
    const igName = meJson.name ?? meJson.username ?? 'Instagram';

    await pool.query(
      `INSERT INTO social_connections
         (organization_id, platform, page_id, page_name, page_picture, access_token, token_expires_at, instagram_business_id, status, username)
       VALUES ($1, 'instagram', $2, $3, $4, $5, $6, $7, 'active', $8)
       ON CONFLICT (organization_id, platform, page_id) DO UPDATE SET
         username = EXCLUDED.username,
         page_name = EXCLUDED.page_name,
         page_picture = EXCLUDED.page_picture,
         access_token = EXCLUDED.access_token,
         token_expires_at = EXCLUDED.token_expires_at,
         status = 'active',
         updated_at = NOW()`,
      [orgId, igId, igName, meJson.profile_picture_url ?? null, encryptSecret(longToken), expiresAt, igId, meJson.username ?? null],
    );

    // Suscribir la cuenta al webhook de Meta para recibir DMs y comentarios
    await subscribeApps(
      `https://graph.instagram.com/v21.0/me/subscribed_apps?subscribed_fields=messages%2Ccomments&access_token=${longToken}`,
      `instagram ${igId}`,
    );

    res.redirect(`${frontendBase}/settings/social?connected=instagram`);
  } catch (e) {
    console.error('Instagram OAuth callback error:', e);
    res.redirect(`${frontendBase}/settings/social?error=server_error`);
  }
});

// GET /social/facebook/callback — OAuth callback público (sin JWT, autenticado via state firmado)
socialPublicRouter.get('/facebook/callback', async (req, res) => {
  const { code, state, error } = req.query as Record<string, string>;

  const frontendBase = process.env.FRONTEND_URL ?? env.publicUrl;
  if (error || !code || !state) {
    return res.redirect(`${frontendBase}/settings/social?error=oauth_denied`);
  }
  // state = JWT firmado (orgId, proveedor); un orgId plano o manipulado se rechaza
  const st = verifyOAuthState(state, 'facebook');
  if (!st) return res.redirect(`${frontendBase}/settings/social?error=oauth_state`);
  const orgId = st.orgId;

  try {
    const redirectUri = `${env.publicUrl}/api/social/facebook/callback`;

    // 1. Short-lived token
    const tokenRes = await fetch(
      `${META_BASE}/oauth/access_token?client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`,
    );
    const tokenJson = await tokenRes.json() as { access_token?: string; error?: { message: string } };
    if (!tokenJson.access_token) {
      console.error('Meta token error:', tokenJson);
      return res.redirect(`${frontendBase}/settings/social?error=token_failed`);
    }

    // 2. Long-lived token (~60 días)
    const llRes = await fetch(
      `${META_BASE}/oauth/access_token?grant_type=fb_exchange_token&client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&fb_exchange_token=${tokenJson.access_token}`,
    );
    const llJson = await llRes.json() as { access_token?: string; expires_in?: number };
    const longToken = llJson.access_token ?? tokenJson.access_token;
    const expiresAt = llJson.expires_in
      ? new Date(Date.now() + llJson.expires_in * 1000).toISOString()
      : null;

    // 3. Listar páginas del usuario
    const pagesRes = await fetch(
      `${META_BASE}/me/accounts?access_token=${longToken}&fields=id,name,picture,access_token`,
    );
    const pagesJson = await pagesRes.json() as {
      data?: Array<{
        id: string;
        name: string;
        picture?: { data?: { url?: string } };
        access_token: string;
        instagram_business_account?: { id: string };
      }>;
    };

    const pages = pagesJson.data ?? [];
    for (const page of pages) {
      const pageToken = page.access_token ?? longToken;
      const picture = page.picture?.data?.url ?? null;

      // Guardar como Facebook page
      await pool.query(
        `INSERT INTO social_connections
           (organization_id, platform, page_id, page_name, page_picture, access_token, token_expires_at, status)
         VALUES ($1, 'facebook', $2, $3, $4, $5, $6, 'active')
         ON CONFLICT (organization_id, platform, page_id) DO UPDATE SET
           page_name = EXCLUDED.page_name,
           page_picture = EXCLUDED.page_picture,
           access_token = EXCLUDED.access_token,
           token_expires_at = EXCLUDED.token_expires_at,
           status = 'active',
           updated_at = NOW()`,
        // El token de página obtenido de un token de usuario de larga duración no caduca
        [orgId, page.id, page.name, picture, encryptSecret(pageToken), null],
      );

      // Suscribir la página: Messenger y comentarios (feed). Instagram se conecta aparte con su propio login.
      await subscribeApps(
        `${META_BASE}/${page.id}/subscribed_apps?subscribed_fields=messages%2Cfeed&access_token=${pageToken}`,
        `page ${page.id}`,
      );

    }

    res.redirect(`${frontendBase}/settings/social?connected=facebook`);
  } catch (e) {
    console.error('Meta OAuth callback error:', e);
    res.redirect(`${frontendBase}/settings/social?error=server_error`);
  }
});

// DELETE /social/connections/:id — desconectar
socialRouter.delete('/connections/:id', requireAdmin, async (req, res) => {
  try {
    const orgId = req.auth!.organizationId;
    const { id } = req.params;

    const row = await pool.query<SocialRow>(
      `SELECT * FROM social_connections WHERE id = $1 AND organization_id = $2`,
      [id, orgId],
    );
    if (!row.rows[0]) return res.status(404).json({ error: 'Conexión no encontrada' });

    // Opcionalmente revocar token con Meta
    if (row.rows[0].access_token && META_APP_ID) {
      fetch(`${META_BASE}/me/permissions?access_token=${row.rows[0].access_token}`, { method: 'DELETE' }).catch(() => {});
    }

    await pool.query(
      // El token se borra al desconectar (política de privacidad y requisitos de Meta)
      `UPDATE social_connections SET status = 'disconnected', access_token = '', updated_at = NOW() WHERE id = $1`,
      [id],
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al desconectar' });
  }
});

// ─── Meta Webhook (sin auth, verificado por verify_token) ──────────────────

// GET /api/meta/webhook — verificación de webhook por Meta
metaWebhookRouter.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'] as string;
  const challenge = req.query['hub.challenge'];

  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN ?? '';
  if (mode === 'subscribe' && verifyToken && token === verifyToken) {
    return res.status(200).send(challenge);
  }
  res.status(403).end();
});

// POST /api/meta/webhook — recepción de mensajes y comentarios
metaWebhookRouter.post('/webhook', verifyMetaSignature, async (req, res) => {
  res.json({ ok: true }); // responder rápido a Meta

  try {
    const body = req.body as MetaWebhookBody;
    console.log(`[meta-webhook] object=${body.object} entries=${body.entry?.length ?? 0}`);
    if (body.object !== 'page' && body.object !== 'instagram') return;

    for (const entry of body.entry ?? []) {
      const pageId = entry.id;
      const kinds = [
        ...(entry.messaging ?? []).map(m => m.message ? (m.message.is_echo ? 'echo' : 'message') : Object.keys(m).filter(k => !['sender', 'recipient', 'timestamp'].includes(k)).join('+')),
        ...(entry.changes ?? []).map(c => c.field),
      ];
      console.log(`[meta-webhook] entry.id=${pageId} eventos=${kinds.join(',') || 'ninguno'}`);

      const connRes = await pool.query<{ id: string; organization_id: string; platform: string; access_token: string; instagram_business_id: string | null; page_id: string }>(
        `SELECT id, organization_id, platform, access_token, instagram_business_id, page_id FROM social_connections
         WHERE (page_id = $1 OR instagram_business_id = $1) AND status = 'active' LIMIT 1`,
        [pageId],
      );
      if (!connRes.rows[0]) {
        console.warn(`[meta-webhook] sin conexión activa para entry.id=${pageId}`);
        continue;
      }
      const conn = connRes.rows[0];
      const orgId = conn.organization_id;

      // ── Mensajes: Messenger (object=page) o Instagram DM (object=instagram) ──
      // Con Instagram Login los DMs llegan en entry.messaging, igual que Messenger.
      const dmChannel = body.object === 'instagram' ? 'instagram_dm' : 'facebook_dm';
      const dmPrefix = body.object === 'instagram' ? 'ig' : 'fb';
      for (const messaging of entry.messaging ?? []) {
        if (!messaging.message) continue;
        // Eco = mensaje enviado por la propia cuenta (bot, CRM o app de Instagram): va como saliente
        const isEcho = Boolean(messaging.message.is_echo);
        const peerId = (isEcho ? messaging.recipient?.id : messaging.sender?.id) ?? '';
        if (!peerId || peerId === pageId || peerId === conn.instagram_business_id) continue;

        // Fotos, reels, publicaciones compartidas o menciones llegan sin texto: se describen
        const text = describeIgMessage(messaging.message);
        const mid = messaging.message.mid ?? peerId + '_' + messaging.timestamp;

        // Si viene de alguien que comentó, se vincula a su contacto y muestra su nombre;
        // si no, se pide su usuario a Instagram (solo la primera vez)
        const igContact = dmChannel === 'instagram_dm' ? await findIgContact(orgId, peerId) : null;
        const displayName = igContact
          ? [igContact.first_name, igContact.last_name].filter(Boolean).join(' ') || peerId
          : await socialDisplayName(orgId, dmChannel, conn.access_token, peerId);
        await upsertSocialConversation({
          orgId, socialAccountId: conn.id, channel: dmChannel, chatId: `${dmPrefix}_${peerId}`,
          displayName, text, mid, direction: isEcho ? 'outbound' : 'inbound', contactId: igContact?.id,
        });
        if (!isEcho && dmChannel === 'instagram_dm' && text) {
          captureIgPhone(orgId, peerId, text).catch(e => console.error('captureIgPhone error:', e));
        }
      }

      // ── Changes: mensajes de Instagram DM y comentarios ──────────────────
      for (const change of entry.changes ?? []) {

        // Instagram DM
        if (change.field === 'messages') {
          const msg = change.value as IgMessageChange | undefined;
          if (!msg?.message) continue;
          // Ignorar mensajes enviados por la propia cuenta
          if (msg.sender?.id === pageId || msg.sender?.id === conn.instagram_business_id) continue;

          const senderId = msg.sender?.id ?? '';
          const text = describeIgMessage(msg.message);
          const mid = msg.message.mid ?? senderId + '_' + msg.timestamp;

          const igContact = await findIgContact(orgId, senderId);
          const displayName = igContact
            ? [igContact.first_name, igContact.last_name].filter(Boolean).join(' ') || senderId
            : await socialDisplayName(orgId, 'instagram_dm', conn.access_token, senderId);
          await upsertSocialConversation({
            orgId, socialAccountId: conn.id, channel: 'instagram_dm', chatId: `ig_${senderId}`,
            displayName, text, mid, direction: 'inbound', contactId: igContact?.id,
          });
          if (text) captureIgPhone(orgId, senderId, text).catch(e => console.error('captureIgPhone error:', e));
        }

        // Facebook: comentario nuevo en una publicación de la página → a la bandeja
        if (change.field === 'feed' && body.object === 'page') {
          const v = change.value as FbFeedChange | undefined;
          if (v?.item !== 'comment' || v.verb !== 'add' || !v.comment_id || !v.from?.id) continue;
          if (v.from.id === pageId) continue;   // respuestas de la propia página
          const link = v.post_id ? `\nhttps://www.facebook.com/${v.post_id}` : '';
          await upsertSocialConversation({
            orgId, socialAccountId: conn.id, channel: 'facebook_dm', chatId: `fb_${v.from.id}`,
            displayName: v.from.name || await socialDisplayName(orgId, 'facebook_dm', conn.access_token, v.from.id),
            text: `💬 Comentó en tu publicación: "${v.message ?? ''}"${link}`,
            mid: `fbc_${v.comment_id}`, direction: 'inbound',
          });
          continue;
        }

        // Instagram Comentario en post
        if (change.field === 'comments') {
          const comment = change.value as IgCommentChange | undefined;
          if (!comment?.id) continue;
          // Ignorar respuestas propias
          if (comment.from?.id === pageId || comment.from?.id === conn.instagram_business_id) continue;

          handleIgComment(conn, comment).catch(e => console.error('handleIgComment error:', e));
        }

        // Facebook Lead Ads
        if (change.field === 'leadgen') {
          const leadEvent = change.value as LeadgenChange | undefined;
          if (!leadEvent?.leadgen_id || !leadEvent?.form_id) continue;
          handleLeadgen(orgId, conn.access_token, leadEvent).catch(e => console.error('handleLeadgen error:', e));
        }
      }
    }
  } catch (e) {
    console.error('meta-webhook error:', e);
  }
});


// Meta firma cada notificación con el secreto de la app (X-Hub-Signature-256). Sin verificarla,
// cualquiera que conozca el id público de una página podía inyectar comentarios, DMs o leads.
// Hay dos apps (Facebook e Instagram Login): vale la firma de cualquiera de sus secretos.
// META_WEBHOOK_ENFORCE_SIGNATURE=true rechaza lo no firmado; si no, solo lo registra (observación).
function verifyMetaSignature(req: express.Request & { rawBody?: Buffer }, res: express.Response, next: express.NextFunction) {
  const secrets: [string, string][] = [
    ['meta', process.env.META_APP_SECRET ?? ''],
    ['instagram', process.env.INSTAGRAM_APP_SECRET ?? ''],
  ].filter(([, s]) => s) as [string, string][];
  if (!secrets.length) return next();
  const sig = req.get('x-hub-signature-256') ?? '';
  const match = req.rawBody && sig.startsWith('sha256=')
    ? secrets.find(([, s]) => {
        const expected = Buffer.from('sha256=' + createHmac('sha256', s).update(req.rawBody!).digest('hex'));
        const got = Buffer.from(sig);
        return got.length === expected.length && timingSafeEqual(got, expected);
      })
    : undefined;
  const enforce = process.env.META_WEBHOOK_ENFORCE_SIGNATURE === 'true';
  if (match) {
    console.log(`[meta-webhook] firma OK (secreto ${match[0]})`);
    return next();
  }
  console.warn(`[meta-webhook] firma inválida o ausente (${enforce ? 'rechazado' : 'modo observación: se procesa igual'})`);
  if (enforce) return res.status(401).end();
  next();
}

// Nombre a mostrar de un DM sin contacto: el guardado en la conversación o, si solo hay el id
// numérico, el que devuelva Meta (usuario de Instagram / nombre en Messenger). Una consulta por conversación nueva.
async function socialDisplayName(orgId: string, channel: 'instagram_dm' | 'facebook_dm', accessToken: string, peerId: string): Promise<string> {
  const chatId = `${channel === 'instagram_dm' ? 'ig' : 'fb'}_${peerId}`;
  const prev = (await pool.query<{ display_name: string | null }>(
    `SELECT display_name FROM conversations WHERE organization_id = $1 AND wa_chat_id = $2`,
    [orgId, chatId],
  )).rows[0]?.display_name;
  if (prev && !/^\d+$/.test(prev)) return prev;
  const name = channel === 'instagram_dm' ? await getIgUsername(accessToken, peerId) : await getFbName(accessToken, peerId);
  return name ?? peerId;
}

// ─── Tipos Meta Webhook ─────────────────────────────────────────────────────
interface MetaWebhookBody {
  object: string;
  entry?: Array<{
    id: string;
    messaging?: Array<{
      sender?: { id: string };
      recipient?: { id: string };
      message?: IgDmMessage & { mid: string; is_echo?: boolean };
      timestamp?: number;
    }>;
    changes?: Array<{
      field: string;
      value?: IgMessageChange | IgCommentChange | Record<string, unknown>;
    }>;
  }>;
}

interface IgMessageChange {
  sender?: { id: string };
  message?: IgDmMessage & { mid: string };
  timestamp?: number;
}

interface FbFeedChange {
  item?: string;          // 'comment', 'reaction', 'post'…
  verb?: string;          // 'add', 'edited', 'remove'
  comment_id?: string;
  post_id?: string;
  message?: string;
  from?: { id: string; name?: string };
}

interface IgCommentChange {
  id: string;
  text?: string;
  from?: { id: string; username?: string; name?: string };
  media?: { id: string };
  timestamp?: number;
}

interface LeadgenChange {
  leadgen_id: string;
  form_id: string;
  page_id?: string;
  created_time?: number;
}

interface MetaLeadField {
  name: string;
  values: string[];
}

async function handleLeadgen(orgId: string, accessToken: string, event: LeadgenChange) {
  // 1. Buscar configuración del formulario
  const configRes = await pool.query<{
    id: string; pipeline_id: string | null; stage_id: string | null;
    field_map: Record<string, string>;
    auto_create_contact: boolean; auto_create_opportunity: boolean;
  }>(
    `SELECT id, pipeline_id, stage_id, field_map, auto_create_contact, auto_create_opportunity
     FROM lead_form_configs
     WHERE organization_id = $1 AND form_id = $2`,
    [orgId, event.form_id],
  );
  if (!configRes.rows[0]) return; // sin configuración → ignorar

  const cfg = configRes.rows[0];

  // Meta puede reenviar el mismo lead: se reclama el leadgen_id una sola vez por organización
  const claim = await pool.query(
    `INSERT INTO processed_leadgens (organization_id, leadgen_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING RETURNING leadgen_id`,
    [orgId, event.leadgen_id],
  );
  if (!claim.rowCount) {
    console.log(`handleLeadgen: lead ${event.leadgen_id} ya procesado para org ${orgId}; se ignora`);
    return;
  }
  // Si no se pudo leer el lead, se libera el reclamo para que un reenvío lo procese
  const release = () => pool.query('DELETE FROM processed_leadgens WHERE organization_id=$1 AND leadgen_id=$2', [orgId, event.leadgen_id]);

  // 2. Obtener datos del lead desde Meta Graph API
  let lead: { id?: string; field_data?: MetaLeadField[]; error?: { message: string } };
  try {
    const leadRes = await fetch(
      `${META_BASE}/${event.leadgen_id}?fields=id,created_time,field_data&access_token=${accessToken}`,
    );
    lead = await leadRes.json() as typeof lead;
  } catch (e) {
    await release();
    throw e;
  }
  if (lead.error || !lead.field_data) {
    console.error('handleLeadgen: error obteniendo lead', lead.error);
    await release();
    return;
  }

  // 3. Mapear campos del formulario a campos del CRM
  // field_map: { "nombre_campo_form": "campo_crm" }  ej: {"full_name":"name","phone_number":"phone"}
  const fieldMap = cfg.field_map as Record<string, string>;
  const extracted: Record<string, string> = {};
  for (const field of lead.field_data) {
    const crmKey = fieldMap[field.name];
    if (crmKey) extracted[crmKey] = field.values?.[0] ?? '';
  }

  const firstName = extracted['name'] || 'Lead desde anuncio';
  const contactPhone = extracted['phone'] || null;
  const contactEmail = extracted['email'] || null;

  // 4. Buscar contacto existente por teléfono o email, o crear uno nuevo
  let contactId: string | null = null;
  if (cfg.auto_create_contact) {
    // Intentar encontrar contacto existente. Sin teléfono ni email no hay con qué
    // compararlo (la condición coincidiría con cualquier contacto): se crea uno nuevo.
    // Teléfono con la comparación tolerante de phone.ts; candado por teléfono contra altas simultáneas.
    const phoneKey = phoneMatchKey(contactPhone);
    const found = await withTransaction(pool, async tx => {
      await lockPhone(tx, orgId, contactPhone);
      const existing = (phoneKey || contactEmail)
        ? await tx.query<{ id: string }>(
            `SELECT id FROM contacts WHERE organization_id = $1
             AND ($2::text IS NULL OR ${contactPhoneMatch('$2')})
             AND ($3::text IS NULL OR lower(email) = lower($3))
             ORDER BY created_at LIMIT 1`,
            [orgId, phoneKey, contactEmail],
          )
        : { rows: [] as { id: string }[] };
      if (existing.rows[0]) return { id: existing.rows[0].id, created: false };
      const newContact = await tx.query<{ id: string }>(
        `INSERT INTO contacts (organization_id, first_name, phone, email, source)
         VALUES ($1, $2, $3, $4, 'facebook_lead_ad')
         RETURNING id`,
        [orgId, firstName, contactPhone, contactEmail],
      );
      return { id: newContact.rows[0]?.id ?? null, created: true };
    });
    contactId = found.id;
    if (found.created) fireContactCreatedTrigger(orgId, contactId).catch(console.error);
  }

  // 5. Crear oportunidad en el pipeline configurado
  if (cfg.auto_create_opportunity && cfg.pipeline_id && cfg.stage_id) {
    await pool.query<{ id: string }>(
      `INSERT INTO opportunities (organization_id, title, pipeline_id, stage_id, contact_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [orgId, `Lead: ${firstName}`, cfg.pipeline_id, cfg.stage_id, contactId],
    ).then(r => broadcast(orgId, 'opportunity:new', { id: r.rows[0].id }))
     .catch(e => console.error('handleLeadgen: error creando oportunidad', e));
  }

  console.log(`handleLeadgen: lead ${event.leadgen_id} procesado para org ${orgId} → contacto ${contactId}`);
}
