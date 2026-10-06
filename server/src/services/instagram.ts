// Cliente para Instagram Graph API: envío de DMs y respuesta a comentarios.
// Los tokens de "Instagram Login" (prefijo IGAA) solo funcionan en graph.instagram.com;
// los de páginas de Facebook (EAA…) en graph.facebook.com.

import { fetchWithTimeout } from '../http.ts';

// META_GRAPH_URL / IG_GRAPH_URL: overrides solo para los tests (Meta simulado)
const FB_BASE = `${process.env.META_GRAPH_URL ?? 'https://graph.facebook.com'}/v21.0`;
const IG_BASE = `${process.env.IG_GRAPH_URL ?? 'https://graph.instagram.com'}/v21.0`;

export function igBase(accessToken: string): string {
  return accessToken.startsWith('IG') ? IG_BASE : FB_BASE;
}

async function post(url: string, body: Record<string, unknown>, label: string) {
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json() as Record<string, unknown>;
  if (json.error) {
    // Fuera de la ventana de mensajería es una regla de Meta, no un fallo del sistema: sin alerta
    const log = isOutsideWindow(json.error) ? console.warn : console.error;
    log(`[instagram] ${label} error:`, JSON.stringify(json.error));
  }
  return json;
}

// Meta rechaza el DM porque la persona no ha escrito por DM en las últimas 24 h
// (p. ej. solo comentó y ya se usó la respuesta privada de ese comentario).
export function isOutsideWindow(error: unknown): boolean {
  const e = error as { code?: number; error_subcode?: number } | undefined;
  return e?.error_subcode === 2534022 || e?.error_subcode === 2018278;
}

// Con Instagram Login se envía desde /me; con token de página, desde el id de la cuenta IG.
function sender(igUserId: string, accessToken: string) {
  return accessToken.startsWith('IG') ? 'me' : igUserId;
}

export async function sendIgDm(
  igUserId: string,
  accessToken: string,
  recipientId: string,
  text: string,
): Promise<{ message_id?: string; error?: unknown }> {
  return post(`${igBase(accessToken)}/${sender(igUserId, accessToken)}/messages`, {
    recipient: { id: recipientId },
    message: { text },
    access_token: accessToken,
  }, 'sendIgDm');
}

// Private reply: DM a quien comentó. No necesita que la persona haya escrito antes,
// pero Meta permite solo UNA por comentario y dentro de los 7 días siguientes.
export async function sendIgPrivateReply(
  igUserId: string,
  accessToken: string,
  commentId: string,
  text: string,
): Promise<{ message_id?: string; error?: unknown }> {
  return post(`${igBase(accessToken)}/${sender(igUserId, accessToken)}/messages`, {
    recipient: { comment_id: commentId },
    message: { text },
    access_token: accessToken,
  }, 'sendIgPrivateReply');
}

export async function replyToIgComment(
  commentId: string,
  accessToken: string,
  message: string,
): Promise<{ id?: string; error?: unknown }> {
  return post(`${igBase(accessToken)}/${commentId}/replies`, { message, access_token: accessToken }, 'replyToIgComment');
}

// Usuario de Instagram de quien escribe por DM (User Profile API). Solo funciona con personas que
// han conversado con la cuenta; si Meta no lo da, null y se queda el id numérico.
export async function getIgUsername(accessToken: string, igsid: string): Promise<string | null> {
  try {
    const url = `${igBase(accessToken)}/${igsid}?fields=username,name&access_token=${encodeURIComponent(accessToken)}`;
    const res = await fetchWithTimeout(url, {}, 5000);
    const json = await res.json() as { username?: string; name?: string; error?: unknown };
    if (json.error) { console.warn(`[instagram] getIgUsername ${igsid}:`, JSON.stringify(json.error)); return null; }
    return json.username ?? json.name ?? null;
  } catch {
    return null;
  }
}

// Texto legible para un DM sin texto (foto, reel, publicación compartida, mención en historia…)
type IgAttachment = { type?: string; payload?: { url?: string; title?: string } };
export type IgDmMessage = {
  text?: string;
  attachments?: IgAttachment[];
  reply_to?: { story?: { url?: string } };
  is_deleted?: boolean;
  is_unsupported?: boolean;
};
const ATTACHMENT_LABEL: Record<string, string> = {
  image: '📷 Foto',
  video: '🎬 Video',
  audio: '🎤 Audio',
  file: '📎 Archivo',
  share: '🔗 Publicación compartida',
  ig_post: '🔗 Publicación compartida',
  ig_reel: '🎬 Reel compartido',
  reel: '🎬 Reel compartido',
  story_mention: '📍 Te mencionó en su historia',
  animated_image: '🖼️ GIF',
  sticker: '🖼️ Sticker',
};
export function describeIgMessage(msg: IgDmMessage): string | null {
  if (msg.is_deleted) return '🗑️ Mensaje eliminado';
  const parts: string[] = [];
  for (const a of msg.attachments ?? []) {
    const label = ATTACHMENT_LABEL[a.type ?? ''] ?? '📎 Adjunto';
    const title = a.payload?.title ? ` · ${a.payload.title}` : '';
    parts.push(a.payload?.url ? `${label}${title}: ${a.payload.url}` : `${label}${title}`);
  }
  if (msg.reply_to?.story) parts.unshift('💬 Respondió a tu historia');
  if (msg.text) parts.push(msg.text);
  if (!parts.length && msg.is_unsupported) return '📎 Contenido que Instagram no deja ver aquí (ábrelo en la app)';
  return parts.length ? parts.join('\n') : null;
}

// ─── Facebook Messenger (token de página) ───────────────────────────────────

// Responde a quien escribió a la página. messaging_type RESPONSE: solo dentro de las 24 h
// siguientes a su último mensaje (mismos códigos de error que Instagram, ver isOutsideWindow).
export async function sendFbMessage(
  pageToken: string,
  psid: string,
  text: string,
): Promise<{ message_id?: string; error?: unknown }> {
  return post(`${FB_BASE}/me/messages`, {
    recipient: { id: psid },
    messaging_type: 'RESPONSE',
    message: { text },
    access_token: pageToken,
  }, 'sendFbMessage');
}

// Respuesta privada por Messenger a un comentario de la página (una por comentario, hasta 7 días después)
export async function sendFbPrivateReply(
  pageToken: string,
  commentId: string,
  text: string,
): Promise<{ message_id?: string; error?: unknown }> {
  return post(`${FB_BASE}/me/messages`, {
    recipient: { comment_id: commentId },
    message: { text },
    access_token: pageToken,
  }, 'sendFbPrivateReply');
}

// Nombre de quien escribe por Messenger (User Profile API de la página)
export async function getFbName(pageToken: string, psid: string): Promise<string | null> {
  try {
    const url = `${FB_BASE}/${psid}?fields=name,first_name,last_name&access_token=${encodeURIComponent(pageToken)}`;
    const res = await fetchWithTimeout(url);
    const json = await res.json() as { name?: string; first_name?: string; last_name?: string; error?: unknown };
    if (json.error) { console.warn(`[facebook] getFbName ${psid}:`, JSON.stringify(json.error)); return null; }
    return json.name ?? ([json.first_name, json.last_name].filter(Boolean).join(' ') || null);
  } catch {
    return null;
  }
}
