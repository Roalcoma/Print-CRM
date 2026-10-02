// Llamadas HTTP a servicios externos (Evolution, Google, Meta/Instagram, Zoom, Telegram) con
// tiempo límite: sin él, un servicio colgado deja la petición (y el run de la automatización,
// o el request del usuario) esperando para siempre. Al vencer, fetch lanza un error
// 'TimeoutError' (DOMException), que los llamadores tratan como un fallo de red más.

// EXTERNAL_TIMEOUT_MS: por defecto 10 s (los tests lo bajan para probar el corte).
export function externalTimeoutMs(): number {
  const n = Number(process.env.EXTERNAL_TIMEOUT_MS);
  return n > 0 ? n : 10_000;
}

export function fetchWithTimeout(input: string | URL, init: RequestInit = {}, ms = externalTimeoutMs()): Promise<Response> {
  const timeout = AbortSignal.timeout(ms);
  return fetch(input, { ...init, signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout });
}
