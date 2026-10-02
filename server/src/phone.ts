// Teléfonos: una sola normalización y una sola forma de comparar para todo el CRM.
//
// Regla de normalización (idéntica a la función SQL crm_phone_digits de la migración 044,
// que rellena la columna generada contacts.phone_digits):
//   1. Solo dígitos (se quitan +, espacios, guiones, paréntesis, puntos…).
//   2. Prefijo internacional "00" → se quita ("0058414…" → "58414…").
//   3. EE. UU./NANP de 10 dígitos ([2-9]XX [2-9]XX XXXX) → se antepone 1 ("(407) 555-1234" → "14075551234").
//      La cuenta principal es una agencia de Florida: un número de 10 dígitos con forma NANP es de EE. UU.
//   4. Venezuela en formato nacional: exactamente "0" + operadora móvil (412/414/416/422/424/426) + 7 dígitos
//      → "58" + número sin el 0 ("04141234567" → "584141234567"). Es inequívoco: ningún número
//      internacional (E.164) empieza por 0 y el patrón solo cubre móviles venezolanos.
//   Cualquier otro caso se deja tal cual (solo dígitos): nunca se inventan dígitos si hay duda.
//
// Comparación: dos teléfonos son el mismo si coinciden sus ÚLTIMOS 10 dígitos (phoneMatchKey). Así se
// toleran códigos de país presentes o ausentes ("4075551234" = "+1 407 555 1234", "04141234567" =
// "+58 414 1234567"). Los números con menos de 7 dígitos no se comparan (no identifican a nadie).

import type pg from 'pg';

type Db = Pick<pg.PoolClient, 'query'>;

const VE_MOBILE = /^0(41[246]|42[246])\d{7}$/;
const NANP_10 = /^[2-9]\d{2}[2-9]\d{6}$/;

export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (NANP_10.test(d)) d = '1' + d;
  else if (VE_MOBILE.test(d)) d = '58' + d.slice(1);
  return d || null;
}

/** Clave de comparación tolerante: últimos 10 dígitos del número normalizado (null si < 7 dígitos). */
export function phoneMatchKey(raw: string | null | undefined): string | null {
  const d = normalizePhone(raw);
  if (!d || d.length < 7) return null;
  return d.slice(-10);
}

export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = phoneMatchKey(a);
  return ka !== null && ka === phoneMatchKey(b);
}

/** Condición SQL para contacts: `contactPhoneMatch('$2')` con $2 = phoneMatchKey(...). Usa el índice de la 044. */
export const contactPhoneMatch = (param: string, alias = '') =>
  `right(${alias ? alias + '.' : ''}phone_digits, 10) = ${param}`;

/**
 * Serializa las altas de contacto con el mismo teléfono en la misma organización (dos mensajes
 * simultáneos de un número nuevo no crean dos contactos). Debe llamarse DENTRO de una transacción:
 * el candado se libera solo en COMMIT/ROLLBACK. Sin teléfono comparable no hace nada.
 */
export async function lockPhone(db: Db, orgId: string, phone: string | null | undefined): Promise<void> {
  const key = phoneMatchKey(phone);
  if (key) await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`contact-phone:${orgId}:${key}`]);
}

/** Contacto más antiguo de la organización con ese teléfono (comparación tolerante), o null. */
export async function findContactByPhone<T extends pg.QueryResultRow = { id: string }>(
  db: Db, orgId: string, phone: string | null | undefined, columns = 'id',
): Promise<T | null> {
  const key = phoneMatchKey(phone);
  if (!key) return null;
  const r = await db.query<T>(
    `SELECT ${columns} FROM contacts WHERE organization_id = $1 AND ${contactPhoneMatch('$2')}
     ORDER BY created_at LIMIT 1`,
    [orgId, key],
  );
  return r.rows[0] ?? null;
}

/** Ejecuta fn en una transacción (BEGIN/COMMIT, ROLLBACK si lanza). */
export async function withTransaction<T>(pool: pg.Pool, fn: (db: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
