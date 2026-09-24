// Cliente para Instagram Graph API: envío de DMs y respuesta a comentarios.

const IG_BASE = 'https://graph.facebook.com/v19.0';

export async function sendIgDm(
  igUserId: string,
  accessToken: string,
  recipientId: string,
  text: string,
): Promise<{ message_id?: string; error?: unknown }> {
  const res = await fetch(`${IG_BASE}/${igUserId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text },
      access_token: accessToken,
    }),
  });
  return res.json() as Promise<{ message_id?: string; error?: unknown }>;
}

export async function replyToIgComment(
  commentId: string,
  accessToken: string,
  message: string,
): Promise<{ id?: string; error?: unknown }> {
  const res = await fetch(`${IG_BASE}/${commentId}/replies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, access_token: accessToken }),
  });
  return res.json() as Promise<{ id?: string; error?: unknown }>;
}
