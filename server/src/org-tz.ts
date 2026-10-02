// Zona horaria de la organización (Ajustes → Negocio) para calcular "hoy" y "este mes" en SQL con
// `AT TIME ZONE`. El contenedor y la BD corren en UTC: sin esto, una tarea a las 21:00 de Nueva York
// ya contaba como de mañana y las citas de la última noche del mes quedaban fuera de la vista mensual.

import { query, queryOne } from './db.ts';

// Respaldo si la organización no tiene zona o es inválida (es el DEFAULT de la columna en la BD).
export const DEFAULT_TZ = 'America/Caracas';

// Validez de cada nombre de zona según PostgreSQL (puede diferir de Intl): se pregunta una vez.
const pgValid = new Map<string, boolean>();
async function validForPg(tz: string): Promise<boolean> {
  let ok = pgValid.get(tz);
  if (ok === undefined) {
    ok = await query('SELECT now() AT TIME ZONE $1', [tz]).then(() => true, () => false);
    pgValid.set(tz, ok);
  }
  return ok;
}

// Devuelve una zona IANA válida para usar como parámetro de `AT TIME ZONE`.
export async function orgTimezone(orgId: string): Promise<string> {
  const org = await queryOne<{ timezone: string | null }>('SELECT timezone FROM organizations WHERE id = $1', [orgId]);
  const tz = org?.timezone?.trim();
  return tz && await validForPg(tz) ? tz : DEFAULT_TZ;
}

// Fragmentos SQL del rango [inicio, fin) de un mes en una zona. `y`, `m` y `tz` son placeholders ($n)
// con el año, el mes (1-12) y la zona. Ej.: octubre 2026 en New York → 2026-10-01 04:00Z … 2026-11-01 04:00Z.
export function monthRangeSql(y: string, m: string, tz: string): [string, string] {
  const first = `make_timestamp(${y}::int, ${m}::int, 1, 0, 0, 0)`;
  return [`(${first} AT TIME ZONE ${tz}::text)`, `((${first} + interval '1 month') AT TIME ZONE ${tz}::text)`];
}

// Condición SQL "cae hoy" en la zona: `col` dentro de [00:00, 24:00) locales de hoy (usa el índice de col).
export function isTodaySql(col: string, tz: string): string {
  const today = `date_trunc('day', now() AT TIME ZONE ${tz}::text)`;
  return `(${col} >= (${today} AT TIME ZONE ${tz}::text) AND ${col} < ((${today} + interval '1 day') AT TIME ZONE ${tz}::text))`;
}
