// Runner de migraciones minimalista: ejecuta los .sql de ./migrations en orden,
// registrando los aplicados en schema_migrations para no repetirlos.
// ponytail: ~40 líneas evitan una dependencia de migraciones y su config.
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool } from './db.ts';
import { hashPassword } from './auth/password.ts';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

async function run() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

  const applied = new Set(
    (await pool.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map(r => r.name),
  );

  const files = (await readdir(migrationsDir)).filter(f => f.endsWith('.sql')).sort();

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`  = ${file} (ya aplicada)`);
      continue;
    }
    const sql = await readFile(join(migrationsDir, file), 'utf8');
    // Cada migración corre en su propia transacción.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`  + ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // Usuario demo (necesita hash generado en runtime, no cabe en SQL puro).
  const hash = await hashPassword('demo1234');
  await pool.query(
    `INSERT INTO users (organization_id, email, password_hash, name, role)
     VALUES ('00000000-0000-0000-0000-000000000001', 'demo@crm.test', $1, 'Usuario Demo', 'owner')
     ON CONFLICT (email) DO NOTHING`,
    [hash],
  );

  console.log('Migraciones completas.');
  await pool.end();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
