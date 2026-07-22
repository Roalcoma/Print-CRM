// Hash de passwords con scrypt de la stdlib (node:crypto). Sin dependencias.
// Formato almacenado: "<saltHex>:<hashHex>".
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scryptAsync(password, salt, KEYLEN)) as Buffer;
  return `${salt.toString('hex')}:${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const derived = (await scryptAsync(password, Buffer.from(saltHex, 'hex'), KEYLEN)) as Buffer;
  const expected = Buffer.from(hashHex, 'hex');
  // Comparación en tiempo constante evita timing attacks.
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
