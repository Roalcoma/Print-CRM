// `npm test`: levanta un servidor de pruebas en :3202 apuntado a servicios externos FALSOS
// (Evolution, Meta/Instagram, Google en http://localhost:4202, que monta flows.test.ts),
// corre los tests de aislamiento y de flujos, y lo apaga. Usa la BD del .env local.
// NUNCA contra producción: crea cuentas y datos de prueba.

import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const PORT = process.env.TEST_PORT ?? '3202';
const FAKE = process.env.TEST_FAKE_URL ?? 'http://localhost:4202';
const BASE = `http://localhost:${PORT}`;

// Variables de entorno compartidas por el servidor y los tests (las del proceso ganan al .env)
const testEnv: Record<string, string> = {
  PORT,
  PUBLIC_URL: BASE,
  ALLOW_PUBLIC_SIGNUP: 'true',
  DISABLE_BACKGROUND_JOBS: 'true',
  SECRETS_KEY: process.env.TEST_SECRETS_KEY ?? randomBytes(32).toString('base64'),
  EVOLUTION_URL: `${FAKE}/evo`,
  EVOLUTION_API_KEY: 'evo-test-key',
  META_GRAPH_URL: `${FAKE}/fb`,
  IG_GRAPH_URL: `${FAKE}/ig`,
  GOOGLE_API_URL: `${FAKE}/google`,
  GOOGLE_TOKEN_URL: `${FAKE}/google-token`,
  GOOGLE_CLIENT_ID: 'google-test-client',
  GOOGLE_CLIENT_SECRET: 'google-test-secret',
  META_APP_SECRET: 'meta-test-secret',
  INSTAGRAM_APP_SECRET: 'ig-test-secret',
  META_WEBHOOK_ENFORCE_SIGNATURE: 'true',
  // Sin alertas a Telegram desde los tests
  ALERT_WEBHOOK_URL: '',
  TELEGRAM_BOT_TOKEN: '',
  TELEGRAM_CHAT_ID: '',
  TEST_BASE_URL: BASE,
  TEST_FAKE_URL: FAKE,
};

const env = { ...process.env, ...testEnv };
const server = spawn(process.execPath, ['--env-file=.env', 'src/index.ts'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
server.stdout.on('data', d => { log += d; });
server.stderr.on('data', d => { log += d; });

let code = 1;
try {
  // Esperar a que responda /api/health
  const t0 = Date.now();
  for (;;) {
    if (server.exitCode !== null) throw new Error(`El servidor de pruebas terminó al arrancar:\n${log}`);
    if (await fetch(`${BASE}/api/health`).then(r => r.ok).catch(() => false)) break;
    if (Date.now() - t0 > 20_000) throw new Error(`El servidor de pruebas no arrancó en 20 s:\n${log}`);
    await new Promise(r => setTimeout(r, 250));
  }
  const tests = process.argv.slice(2).length ? process.argv.slice(2) : ['test/isolation.test.ts', 'test/flows.test.ts', 'test/users.test.ts', 'test/appointment-lead.test.ts', 'test/appointments-tz.test.ts'];
  const runner = spawn(process.execPath, ['--env-file=.env', '--test', '--test-concurrency=1', ...tests], { env, stdio: 'inherit' });
  code = await new Promise<number>(r => runner.on('exit', c => r(c ?? 1)));
  if (code !== 0 && process.env.TEST_SERVER_LOG !== '0') console.error(`\n── Log del servidor de pruebas ──\n${log.slice(-8000)}`);
} catch (e) {
  console.error((e as Error).message);
} finally {
  server.kill('SIGTERM');
}
process.exit(code);
