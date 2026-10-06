// CORS: un origen ajeno se bloquea con 403 limpio; la página servida por el mismo host (dominio o IP
// de Tailscale) siempre puede llamar a la API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3202';

test('CORS: origen ajeno → 403 sin cabeceras CORS', async () => {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://sitio-ajeno.example' },
    body: JSON.stringify({ email: 'nadie@test.local', password: 'x' }),
  });
  assert.equal(r.status, 403);
  assert.equal(r.headers.get('access-control-allow-origin'), null);
  assert.equal((await r.json()).error, 'Origen no permitido');
});

test('CORS: mismo host (p. ej. entrar por la IP) sí pasa', async () => {
  const host = new URL(BASE).host;
  const r = await fetch(`${BASE}/api/health`, { headers: { Origin: `http://${host}` } });
  assert.equal(r.status, 200);
  // Simula entrar por otra dirección que apunta al mismo servidor (Host y Origin coinciden).
  // fetch no deja cambiar Host: se usa http.request
  const u = new URL(`${BASE}/api/health`);
  const r2 = await new Promise<http.IncomingMessage>((ok, ko) => {
    const rq = http.request({ hostname: u.hostname, port: u.port, path: u.pathname,
      headers: { Origin: 'http://100.64.0.10:3100', Host: '100.64.0.10:3100' } }, ok);
    rq.on('error', ko); rq.end();
  });
  r2.resume();
  assert.equal(r2.statusCode, 200);
  assert.equal(r2.headers['access-control-allow-origin'], 'http://100.64.0.10:3100');
});

test('CORS: el dominio configurado pasa', async () => {
  const r = await fetch(`${BASE}/api/health`, { headers: { Origin: BASE } });
  assert.equal(r.status, 200);
});
