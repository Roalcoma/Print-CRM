// Cliente de Firebase Cloud Messaging (API HTTP v1) para las notificaciones push de la app móvil.
// Sin dependencias: el JWT del service account se firma con node:crypto (RS256) y se cambia por un
// access token OAuth2 (cacheado ~55 min).
//
// Credenciales (la primera que exista):
//   FCM_SERVICE_ACCOUNT_JSON  contenido del JSON del service account en base64
//   FCM_SERVICE_ACCOUNT_FILE  ruta al JSON (en prod: /run/secrets-fcm/fcm.json). Se relee si cambia
//                             (mtime): basta con dejar el archivo, no hace falta reiniciar.
// Sin credenciales el push queda desactivado (se registra una vez) y no falla nada.
// FCM_API_URL / FCM_TOKEN_URL sobreescriben las URLs de Google (tests).

import { createSign } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { pool } from '../db.ts';
import { fetchWithTimeout } from '../http.ts';

interface ServiceAccount { project_id: string; client_email: string; private_key: string; token_uri?: string }

export interface PushMessage {
  title: string;
  body: string;
  data: Record<string, string>;
  channelId: string;          // canal de Android (la app crea: leads, messages, agenda, system)
  highPriority: boolean;
}

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const CONCURRENCY = 5;

let fileCache: { path: string; mtime: number; sa: ServiceAccount | null } | null = null;
let accessToken: { token: string; exp: number; email: string } | null = null;
let loggedDisabled = false;
let loggedEnabled = false;

function parseSa(raw: string): ServiceAccount | null {
  try {
    const sa = JSON.parse(raw) as ServiceAccount;
    if (sa.project_id && sa.client_email && sa.private_key) return sa;
    console.error('[push] el JSON del service account no tiene project_id/client_email/private_key');
  } catch {
    console.error('[push] el JSON del service account no es válido');
  }
  return null;
}

function credentials(): ServiceAccount | null {
  let sa: ServiceAccount | null = null;
  const b64 = process.env.FCM_SERVICE_ACCOUNT_JSON;
  const file = process.env.FCM_SERVICE_ACCOUNT_FILE;
  if (b64) sa = parseSa(Buffer.from(b64, 'base64').toString('utf8'));
  else if (file) {
    // stat en cada envío (barato): permite activar/cambiar las credenciales sin reiniciar
    let mtime = -1;
    try { mtime = statSync(file).mtimeMs; } catch { /* no existe */ }
    if (!fileCache || fileCache.path !== file || fileCache.mtime !== mtime) {
      let raw: string | null = null;
      if (mtime >= 0) try { raw = readFileSync(file, 'utf8'); } catch (e) { console.error(`[push] no se pudo leer ${file}:`, (e as Error).message); }
      fileCache = { path: file, mtime, sa: raw ? parseSa(raw) : null };
      accessToken = null;
      loggedDisabled = false;
      loggedEnabled = false;
    }
    sa = fileCache.sa;
  }
  if (!sa) {
    if (!loggedDisabled) { console.log('[push] push desactivado: sin credenciales de FCM (FCM_SERVICE_ACCOUNT_FILE / FCM_SERVICE_ACCOUNT_JSON)'); loggedDisabled = true; }
    return null;
  }
  if (!loggedEnabled) { console.log(`[push] push activado (proyecto ${sa.project_id})`); loggedEnabled = true; }
  return sa;
}

const b64url = (v: string | Buffer) => Buffer.from(v).toString('base64url');

// Una sola petición de token aunque varios envíos lo pidan a la vez
let pendingToken: Promise<string> | null = null;

function getAccessToken(sa: ServiceAccount): Promise<string> {
  if (accessToken && accessToken.email === sa.client_email && accessToken.exp > Date.now()) return Promise.resolve(accessToken.token);
  pendingToken ??= fetchAccessToken(sa).finally(() => { pendingToken = null; });
  return pendingToken;
}

async function fetchAccessToken(sa: ServiceAccount): Promise<string> {
  const tokenUrl = process.env.FCM_TOKEN_URL || sa.token_uri || 'https://oauth2.googleapis.com/token';
  const iat = Math.floor(Date.now() / 1000);
  const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({
    iss: sa.client_email, scope: SCOPE, aud: tokenUrl, iat, exp: iat + 3600,
  }))}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(sa.private_key);
  const res = await fetchWithTimeout(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${b64url(signature)}`,
    }),
  });
  if (!res.ok) throw new Error(`token OAuth de FCM rechazado (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const json = await res.json() as { access_token: string; expires_in?: number };
  // ~55 min (o lo que diga Google menos 5 min)
  const ttl = Math.min(55 * 60, Math.max(60, (json.expires_in ?? 3600) - 300));
  accessToken = { token: json.access_token, exp: Date.now() + ttl * 1000, email: sa.client_email };
  return json.access_token;
}

// true si FCM dice que el token ya no sirve (app desinstalada, token caducado o inválido)
function isDeadToken(status: number, err: { error?: { status?: string; message?: string; details?: { errorCode?: string }[] } }): boolean {
  if (status === 404) return true;
  const codes = [err.error?.status, ...(err.error?.details ?? []).map(d => d.errorCode)];
  if (codes.includes('UNREGISTERED')) return true;
  return status === 400 && codes.includes('INVALID_ARGUMENT') && /registration token/i.test(err.error?.message ?? '');
}

async function sendOne(sa: ServiceAccount, token: string, msg: PushMessage): Promise<void> {
  const access = await getAccessToken(sa);
  const base = (process.env.FCM_API_URL || 'https://fcm.googleapis.com').replace(/\/$/, '');
  const res = await fetchWithTimeout(`${base}/v1/projects/${encodeURIComponent(sa.project_id)}/messages:send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access}` },
    body: JSON.stringify({
      message: {
        token,
        notification: { title: msg.title, body: msg.body },
        data: msg.data,
        android: {
          priority: msg.highPriority ? 'high' : 'normal',
          notification: { channel_id: msg.channelId },
        },
        apns: {
          headers: { 'apns-priority': msg.highPriority ? '10' : '5' },
          payload: { aps: { sound: 'default' } },
        },
      },
    }),
  });
  if (res.ok) {
    await pool.query('UPDATE push_tokens SET last_used_at = now() WHERE token = $1', [token]);
    return;
  }
  const err = await res.json().catch(() => ({})) as Parameters<typeof isDeadToken>[1];
  if (res.status === 401) accessToken = null;   // token OAuth caducado/revocado: se pide otro la próxima vez
  if (isDeadToken(res.status, err)) {
    await pool.query('DELETE FROM push_tokens WHERE token = $1', [token]);
    console.log(`[push] token borrado (${err.error?.status ?? res.status})`);
    return;
  }
  console.error(`[push] envío fallido (${res.status}): ${err.error?.message ?? ''}`);
}

export function pushEnabled(): boolean {
  return credentials() !== null;
}

// Envía el mismo push a varios tokens, como mucho CONCURRENCY a la vez. No bloquea ni lanza:
// los errores se registran en el log.
export function sendPush(tokens: string[], msg: PushMessage): void {
  if (!tokens.length) return;
  const sa = credentials();
  if (!sa) return;
  const queue = [...new Set(tokens)];
  const worker = async () => {
    for (let t = queue.shift(); t !== undefined; t = queue.shift()) {
      await sendOne(sa, t, msg).catch(e => console.error('[push] error:', (e as Error).message));
    }
  };
  Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker))
    .catch(e => console.error('[push] error:', e));
}
