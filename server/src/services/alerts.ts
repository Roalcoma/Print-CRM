// Alertas a Telegram: todo error que el CRM registra (console.error), las promesas sin
// capturar y los avisos explícitos (WhatsApp desconectado…) llegan al chat del admin.
// Vía un webhook de n8n (ALERT_WEBHOOK_URL, workflow "Rocco CRM · Alertas" que reusa el bot de
// Telegram) o directo con TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID. Sin ninguno no hace nada (local).

const WEBHOOK = process.env.ALERT_WEBHOOK_URL ?? '';
const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const CHAT  = process.env.TELEGRAM_CHAT_ID ?? '';
const ENABLED = !!WEBHOOK || (!!TOKEN && !!CHAT);
const REPEAT_WINDOW_MS = 30 * 60_000;   // el mismo error se avisa como mucho una vez cada 30 min
const MAX_PER_HOUR = 15;                // tope global para no inundar el chat

const lastSent = new Map<string, { at: number; suppressed: number }>();
let hourStart = Date.now();
let sentThisHour = 0;

export async function sendTelegram(text: string): Promise<void> {
  if (!ENABLED) return;
  const body = text.slice(0, 3900);
  try {
    if (WEBHOOK) {
      await fetch(WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: body }),
        signal: AbortSignal.timeout(10_000),
      });
    } else {
      await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: CHAT, text: body, disable_web_page_preview: true }),
        signal: AbortSignal.timeout(10_000),
      });
    }
  } catch { /* sin red hacia n8n/Telegram: no hay a quién avisar */ }
}

// Clave de agrupación: el mensaje sin ids, números ni fechas, para que el mismo fallo cuente como uno
function keyOf(text: string): string {
  return text.split('\n')[0]
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f-]{27}/gi, '<id>')
    .replace(/\d+/g, '#')
    .slice(0, 160);
}

export function alert(title: string, detail = ''): void {
  const now = Date.now();
  const key = keyOf(`${title} ${detail}`);
  const prev = lastSent.get(key);
  if (prev && now - prev.at < REPEAT_WINDOW_MS) { prev.suppressed++; return; }
  if (now - hourStart > 60 * 60_000) { hourStart = now; sentThisHour = 0; }
  if (sentThisHour >= MAX_PER_HOUR) return;
  sentThisHour++;
  const repeated = prev?.suppressed ? `\n(se repitió ${prev.suppressed} veces más en la última media hora)` : '';
  lastSent.set(key, { at: now, suppressed: 0 });
  void sendTelegram(`🚨 Rocco CRM · ${title}${detail ? `\n\n${detail.slice(0, 1500)}` : ''}${repeated}`);
}

function describe(args: unknown[]): string {
  return args.map(a => {
    if (a instanceof Error) return `${a.message}\n${(a.stack ?? '').split('\n').slice(1, 4).join('\n')}`;
    if (typeof a === 'string') return a;
    try { return JSON.stringify(a); } catch { return String(a); }
  }).join(' ').trim();
}

export function installErrorAlerts(): void {
  if (!ENABLED) { console.log('[alerts] sin ALERT_WEBHOOK_URL ni TELEGRAM_BOT_TOKEN: alertas desactivadas'); return; }
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    original(...args);
    const text = describe(args);
    if (text) alert('error', text);
  };
  process.on('unhandledRejection', reason => { original('unhandledRejection:', reason); alert('promesa sin capturar', describe([reason])); });
  process.on('uncaughtException', err => { original('uncaughtException:', err); alert('excepción sin capturar', describe([err])); });
  console.log(`[alerts] alertas de errores a Telegram activadas (${WEBHOOK ? 'vía n8n' : 'bot directo'})`);
}
