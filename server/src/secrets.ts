// Cifrado de credenciales de terceros guardadas en la BD (tokens de Google/Zoom/Meta, API key
// de Evolution). AES-256-GCM con SECRETS_KEY (32 bytes en base64). Formato: enc:v1:<iv>:<tag>:<datos>.
// Las lecturas se descifran solas en db.ts; las escrituras pasan por encryptSecret().

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const PREFIX = 'enc:v1:';

// Columnas que se descifran automáticamente al leerlas (db.ts)
export const SECRET_COLUMNS = new Set(['google_refresh_token', 'zoom_refresh_token', 'access_token', 'evo_api_key']);

let cachedKey: Buffer | null | undefined;
function key(): Buffer | null {
  if (cachedKey !== undefined) return cachedKey;
  const raw = process.env.SECRETS_KEY ?? '';
  const buf = raw ? Buffer.from(raw, 'base64') : null;
  if (buf && buf.length !== 32) throw new Error('SECRETS_KEY debe ser de 32 bytes en base64 (openssl rand -base64 32)');
  cachedKey = buf;
  return cachedKey;
}

export function isEncrypted(v: unknown): v is string {
  return typeof v === 'string' && v.startsWith(PREFIX);
}

// Sin SECRETS_KEY (entorno local) guarda en claro, como antes.
export function encryptSecret<T extends string | null | undefined>(value: T): T {
  const k = key();
  if (!k || value == null || value === '' || isEncrypted(value)) return value;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', k, iv);
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `${PREFIX}${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${data.toString('base64')}` as T;
}

// Valores en claro (anteriores al cifrado) se devuelven tal cual.
export function decryptSecret(value: string): string {
  if (!isEncrypted(value)) return value;
  const k = key();
  if (!k) throw new Error('Hay secretos cifrados en la BD pero falta SECRETS_KEY');
  const [iv, tag, data] = value.slice(PREFIX.length).split(':').map(p => Buffer.from(p, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', k, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

// Descifra en sitio las columnas secretas de un resultado de pg.
export function decryptRows(rows: Record<string, unknown>[]): void {
  for (const row of rows) {
    for (const col in row) {
      if (SECRET_COLUMNS.has(col) && isEncrypted(row[col])) row[col] = decryptSecret(row[col]);
    }
  }
}
