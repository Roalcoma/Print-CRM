// Aislamiento entre clientes: los ids que llegan en el cuerpo de una petición (contacto,
// oportunidad, calendario, usuarios…) deben pertenecer a la organización de quien la hace.
// Sin esto, una cuenta podía enlazar datos de otra y verlos a través de los JOIN.

import { query } from './db.ts';

const TABLES = ['contacts', 'opportunities', 'calendars', 'users', 'pipelines'] as const;
type OrgTable = typeof TABLES[number];

// true si el id no viene (null/undefined) o pertenece a la organización.
export async function belongsToOrg(table: OrgTable, id: string | null | undefined, orgId: string): Promise<boolean> {
  if (!id) return true;
  if (!TABLES.includes(table)) throw new Error(`tabla no permitida: ${table}`);
  const rows = await query(`SELECT 1 FROM ${table} WHERE id = $1 AND organization_id = $2`, [id, orgId]);
  return rows.length > 0;
}

// Devuelve el primer campo cuyo id no pertenece a la organización, o null si todos son válidos.
export async function foreignRef(orgId: string, refs: [OrgTable, string | null | undefined, string][]): Promise<string | null> {
  for (const [table, id, label] of refs) {
    if (!(await belongsToOrg(table, id, orgId))) return label;
  }
  return null;
}

// Filtra una lista de ids de usuario a los que son de la organización.
export async function orgUserIds(ids: string[], orgId: string): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = await query<{ id: string }>(
    'SELECT id FROM users WHERE organization_id = $1 AND id = ANY($2::uuid[])', [orgId, ids],
  );
  return new Set(rows.map(r => r.id));
}
