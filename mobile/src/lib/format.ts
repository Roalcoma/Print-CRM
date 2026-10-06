import type { Opportunity, Conversation } from './types';

export function leadName(o: Pick<Opportunity, 'contact_first_name' | 'contact_last_name' | 'title'>): string {
  const n = [o.contact_first_name, o.contact_last_name].filter(Boolean).join(' ').trim();
  return n || o.title || 'Sin nombre';
}

export function convName(c: Pick<Conversation, 'contact_full_name' | 'display_name' | 'phone'>): string {
  return c.contact_full_name?.trim() || c.display_name || c.phone || 'Sin nombre';
}

export function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() || '?';
}

export function money(v: string | number | null | undefined): string | null {
  const n = typeof v === 'string' ? Number(v) : v ?? 0;
  if (!n || !Number.isFinite(n)) return null;
  return '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// "ahora", "hace 5 min", "hace 3 h", "hace 2 d", luego la fecha.
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `hace ${d} d`;
  return shortDate(iso);
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const pad = (n: number) => String(n).padStart(2, '0');

export function shortDate(iso: string): string {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return `${d.getDate()} ${MESES[d.getMonth()]}${sameYear ? '' : ` ${d.getFullYear()}`}`;
}

export function clock(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Hora si es de hoy, "ayer", o fecha corta (lista de conversaciones).
export function listTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return clock(iso);
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'ayer';
  return shortDate(iso);
}

export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Hoy';
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Ayer';
  return shortDate(iso);
}

export function digits(phone: string | null | undefined): string {
  return (phone ?? '').replace(/\D/g, '');
}

export const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  instagram_dm: 'Instagram',
  facebook_dm: 'Messenger',
};

export function mediaLabel(type: string): string | null {
  switch (type) {
    case 'image': return '📷 Foto';
    case 'sticker': return '🖼️ Sticker';
    case 'audio': case 'ptt': case 'voice': return '🎤 Audio';
    case 'video': return '🎬 Video';
    case 'document': return '📄 Documento';
    case 'location': return '📍 Ubicación';
    case 'contact': case 'vcard': return '👤 Contacto';
    default: return null;
  }
}
