// Cliente para Instagram Graph API: envío de DMs y respuesta a comentarios.
// Los tokens de "Instagram Login" (prefijo IGAA) solo funcionan en graph.instagram.com;
// los de páginas de Facebook (EAA…) en graph.facebook.com.

const FB_BASE = 'https://graph.facebook.com/v21.0';
const IG_BASE = 'https://graph.instagram.com/v21.0';

export function igBase(accessToken: string): string {
  return accessToken.startsWith('IG') ? IG_BASE : FB_BASE;
}

async function post(url: string, body: Record<string, unknown>, label: string) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json() as Record<string, unknown>;
  if (json.error) console.error(`[instagram] ${label} error:`, JSON.stringify(json.error));
  return json;
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
