// Integración con Facebook Messenger e Instagram DM via Meta Graph API.
// Requiere META_APP_ID y META_APP_SECRET en .env.

import { Router } from 'express';
import { pool } from '../db.ts';
import { requireAdmin } from '../auth/perms.ts';
import { env } from '../env.ts';
import { broadcast } from '../services/ws-manager.ts';

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
          [json.access_token, expiresAt, row.id],
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

const META_BASE = 'https://graph.facebook.com/v19.0';
const META_APP_ID = process.env.META_APP_ID ?? '';
const META_APP_SECRET = process.env.META_APP_SECRET ?? '';
const IG_APP_ID = process.env.INSTAGRAM_APP_ID ?? '';
const IG_APP_SECRET = process.env.INSTAGRAM_APP_SECRET ?? '';

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
  const scopes = [
    'pages_show_list',
    'pages_messaging',
    'instagram_business_basic',
    'instagram_business_manage_messages',
    'instagram_business_manage_comments',
    'public_profile',
  ].join(',');

  const url = new URL('https://www.facebook.com/v19.0/dialog/oauth');
  url.searchParams.set('client_id', META_APP_ID);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', scopes);
  url.searchParams.set('state', orgId);
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
    'instagram_business_content_publish',
  ].join(',');

  const url = new URL('https://www.instagram.com/oauth/authorize');
  url.searchParams.set('client_id', IG_APP_ID);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', scopes);
  url.searchParams.set('state', orgId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('force_reauth', 'true');

  res.json({ url: url.toString() });
});

// GET /social/instagram/callback — callback OAuth de Instagram (público)
socialPublicRouter.get('/instagram/callback', async (req, res) => {
  const { code, state: orgId, error } = req.query as Record<string, string>;
  const frontendBase = process.env.FRONTEND_URL ?? env.publicUrl;
  if (error || !code || !orgId) {
    return res.redirect(`${frontendBase}/settings/social?error=oauth_denied`);
  }

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

    // 3. Info de la cuenta
    const meRes = await fetch(
      `https://graph.instagram.com/v19.0/me?fields=id,name,username,profile_picture_url&access_token=${longToken}`,
    );
    const meJson = await meRes.json() as { id?: string; name?: string; username?: string; profile_picture_url?: string };
    const igId = meJson.id ?? String(tokenJson.user_id);
    const igName = meJson.name ?? meJson.username ?? 'Instagram';

    await pool.query(
      `INSERT INTO social_connections
         (organization_id, platform, page_id, page_name, page_picture, access_token, token_expires_at, instagram_business_id, status)
       VALUES ($1, 'instagram', $2, $3, $4, $5, $6, $7, 'active')
       ON CONFLICT (organization_id, platform, page_id) DO UPDATE SET
         page_name = EXCLUDED.page_name,
         page_picture = EXCLUDED.page_picture,
         access_token = EXCLUDED.access_token,
         token_expires_at = EXCLUDED.token_expires_at,
         status = 'active',
         updated_at = NOW()`,
      [orgId, igId, igName, meJson.profile_picture_url ?? null, longToken, expiresAt, igId],
    );

    res.redirect(`${frontendBase}/settings/social?connected=instagram`);
  } catch (e) {
    console.error('Instagram OAuth callback error:', e);
    res.redirect(`${frontendBase}/settings/social?error=server_error`);
  }
});

// GET /social/facebook/callback — OAuth callback público (sin JWT, autenticado via state=orgId)
socialPublicRouter.get('/facebook/callback', async (req, res) => {
  const { code, state: orgId, error } = req.query as Record<string, string>;

  const frontendBase = process.env.FRONTEND_URL ?? env.publicUrl;
  if (error || !code || !orgId) {
    return res.redirect(`${frontendBase}/settings/social?error=oauth_denied`);
  }

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
      `${META_BASE}/me/accounts?access_token=${longToken}&fields=id,name,picture,access_token,instagram_business_account`,
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
        [orgId, page.id, page.name, picture, pageToken, expiresAt],
      );

      // Si la page tiene Instagram Business vinculado
      if (page.instagram_business_account?.id) {
        const igId = page.instagram_business_account.id;

        // Obtener nombre de la cuenta IG
        const igRes = await fetch(
          `${META_BASE}/${igId}?fields=name,profile_picture_url&access_token=${pageToken}`,
        ).catch(() => null);
        const igJson = igRes ? await igRes.json() as { name?: string; profile_picture_url?: string } : {};

        await pool.query(
          `INSERT INTO social_connections
             (organization_id, platform, page_id, page_name, page_picture, access_token, token_expires_at, instagram_business_id, status)
           VALUES ($1, 'instagram', $2, $3, $4, $5, $6, $7, 'active')
           ON CONFLICT (organization_id, platform, page_id) DO UPDATE SET
             page_name = EXCLUDED.page_name,
             page_picture = EXCLUDED.page_picture,
             access_token = EXCLUDED.access_token,
             token_expires_at = EXCLUDED.token_expires_at,
             instagram_business_id = EXCLUDED.instagram_business_id,
             status = 'active',
             updated_at = NOW()`,
          [orgId, igId, igJson.name ?? page.name, igJson.profile_picture_url ?? picture, pageToken, expiresAt, igId],
        );
      }
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
      `UPDATE social_connections SET status = 'disconnected', updated_at = NOW() WHERE id = $1`,
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

// POST /api/meta/webhook — recepción de mensajes
metaWebhookRouter.post('/webhook', express_json_check, async (req, res) => {
  res.json({ ok: true }); // responder rápido a Meta

  try {
    const body = req.body as MetaWebhookBody;
    if (body.object !== 'page' && body.object !== 'instagram') return;

    for (const entry of body.entry ?? []) {
      const pageId = entry.id;

      // Encontrar la conexión y el orgId por page_id
      const connRes = await pool.query<{ organization_id: string; platform: string; access_token: string }>(
        `SELECT organization_id, platform, access_token FROM social_connections
         WHERE page_id = $1 AND status = 'active' LIMIT 1`,
        [pageId],
      );
      if (!connRes.rows[0]) continue;
      const { organization_id: orgId, platform } = connRes.rows[0];

      // Mensajes de Messenger
      for (const messaging of entry.messaging ?? []) {
        if (!messaging.message) continue;
        const senderId = messaging.sender?.id;
        const text = messaging.message.text ?? null;
        const mid = messaging.message.mid;

        broadcast(orgId, 'meta:message', {
          platform,
          pageId,
          senderId,
          messageId: mid,
          text,
          timestamp: messaging.timestamp,
        });
      }

      // Mensajes de Instagram
      for (const change of entry.changes ?? []) {
        if (change.field !== 'messages') continue;
        const msg = change.value;
        if (!msg?.message) continue;

        broadcast(orgId, 'meta:message', {
          platform: 'instagram',
          pageId,
          senderId: msg.sender?.id,
          messageId: msg.message.mid,
          text: msg.message.text ?? null,
          timestamp: msg.timestamp,
        });
      }
    }
  } catch (e) {
    console.error('meta-webhook error:', e);
  }
});

// express.json() ya está montado globalmente, este middleware es solo un placeholder
function express_json_check(_req: unknown, _res: unknown, next: () => void) { next(); }

// ─── Tipos Meta Webhook ─────────────────────────────────────────────────────
interface MetaWebhookBody {
  object: string;
  entry?: Array<{
    id: string;
    messaging?: Array<{
      sender?: { id: string };
      message?: { mid: string; text?: string };
      timestamp?: number;
    }>;
    changes?: Array<{
      field: string;
      value?: {
        sender?: { id: string };
        message?: { mid: string; text?: string };
        timestamp?: number;
      };
    }>;
  }>;
}
