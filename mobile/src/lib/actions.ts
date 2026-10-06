// Acciones de un toque sobre un contacto: llamar y escribir.
import { Linking } from 'react-native';
import { router } from 'expo-router';
import { api, qs } from './api';
import { digits } from './format';
import type { Conversation } from './types';

export async function callPhone(phone: string | null | undefined): Promise<boolean> {
  const p = (phone ?? '').replace(/[^\d+]/g, '');
  if (!p) return false;
  await Linking.openURL(`tel:${p}`).catch(() => {});
  return true;
}

// Conversación existente del contacto en el CRM (la más reciente), o null.
export async function findConversation(contactId: string | null | undefined): Promise<Conversation | null> {
  if (!contactId) return null;
  try {
    const r = await api.get<{ conversations: Conversation[] }>(`/conversations${qs({ contact_id: contactId, status: 'all', limit: 1 })}`);
    return r.conversations[0] ?? null;
  } catch { return null; }
}

export function openChat(c: Pick<Conversation, 'id' | 'channel'> & { name?: string }) {
  router.push({ pathname: '/chat/[id]', params: { id: c.id, name: c.name ?? '', channel: c.channel ?? '' } });
}

// Abre el chat dentro de Rocco si ya existe; si no, WhatsApp directamente (no crea nada en el CRM).
export async function openWhatsApp(contactId: string | null | undefined, phone: string | null | undefined, name?: string): Promise<'chat' | 'external' | 'none'> {
  const conv = await findConversation(contactId);
  if (conv) { openChat({ id: conv.id, channel: conv.channel, name }); return 'chat'; }
  const d = digits(phone);
  if (!d) return 'none';
  const app = `whatsapp://send?phone=${d}`;
  const ok = await Linking.openURL(app).then(() => true).catch(() => false);
  if (!ok) await Linking.openURL(`https://wa.me/${d}`).catch(() => {});
  return 'external';
}
