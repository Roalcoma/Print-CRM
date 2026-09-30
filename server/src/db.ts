import pg from 'pg';
import { env } from './env.ts';
import { decryptRows } from './secrets.ts';

// Un pool para toda la app. `query` es un helper tipado fino sobre pg.
export const pool = new pg.Pool({ connectionString: env.databaseUrl });

// Las credenciales de terceros se guardan cifradas (secrets.ts): se descifran aquí al leer,
// tanto en pool.query como en los clientes de transacciones (pool.connect).
type Queryable = { query: (...args: any[]) => any };
function decryptOnRead(target: Queryable) {
  const original = target.query.bind(target);
  target.query = (...args: any[]) => {
    const result = original(...args);
    if (result && typeof result.then === 'function') {
      return result.then((r: pg.QueryResult | pg.QueryResult[]) => {
        for (const one of Array.isArray(r) ? r : [r]) if (one?.rows) decryptRows(one.rows);
        return r;
      });
    }
    return result;
  };
}
decryptOnRead(pool);
pool.on('connect', client => decryptOnRead(client));

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const res = await pool.query<T>(text, params as any[]);
  return res.rows;
}

// Devuelve la primera fila o null. Para lecturas por id.
export async function queryOne<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
