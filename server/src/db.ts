import pg from 'pg';
import { env } from './env.ts';

// Un pool para toda la app. `query` es un helper tipado fino sobre pg.
export const pool = new pg.Pool({ connectionString: env.databaseUrl });

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
