// Cliente HTTP mínimo sobre fetch: inyecta el JWT, normaliza errores a español y avisa
// cuando la sesión caduca (401) para volver al login.
import { DEFAULT_API_URL } from './config';

let baseUrl = DEFAULT_API_URL;
let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

export const apiState = {
  get baseUrl() { return baseUrl; },
  get token() { return token; },
};
export function setBaseUrl(url: string) { baseUrl = normalizeBaseUrl(url); }
export function setApiToken(t: string | null) { token = t; }
export function setUnauthorizedHandler(fn: (() => void) | null) { onUnauthorized = fn; }

export function normalizeBaseUrl(url: string): string {
  let u = url.trim().replace(/\/+$/, '').replace(/\/api$/, '');
  if (u && !/^https?:\/\//i.test(u)) u = `https://${u}`;
  return u || DEFAULT_API_URL;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// `error` puede venir como texto o como el array de issues de zod.
function errorText(err: unknown, fallback: string): string {
  if (typeof err === 'string' && err) return err;
  if (Array.isArray(err)) {
    const msgs = err.map(i => (i && typeof i === 'object' && 'message' in i ? String((i as { message: unknown }).message) : '')).filter(Boolean);
    if (msgs.length) return msgs.join('. ');
  }
  return fallback;
}

function statusFallback(status: number): string {
  if (status === 403) return 'No tienes permiso para esto';
  if (status === 404) return 'No encontrado';
  if (status === 429) return 'Demasiados intentos, espera un momento';
  if (status >= 500) return 'El servidor tuvo un problema, inténtalo de nuevo';
  return `Error ${status}`;
}

interface Opts { auth?: boolean; timeoutMs?: number }

async function request<T>(method: string, path: string, body?: unknown, opts: Opts = {}): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 20_000);
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token && opts.auth !== false ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e) {
    const aborted = (e as Error)?.name === 'AbortError';
    throw new ApiError(0, aborted ? 'El servidor tardó demasiado en responder' : 'Sin conexión con el servidor');
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 204) return undefined as T;
  if (res.status === 401 && opts.auth !== false && token) {
    onUnauthorized?.();
    throw new ApiError(401, 'Tu sesión expiró, vuelve a entrar');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, errorText((data as { error?: unknown }).error, statusFallback(res.status)));
  return data as T;
}

export const api = {
  get: <T>(p: string, o?: Opts) => request<T>('GET', p, undefined, o),
  post: <T>(p: string, b?: unknown, o?: Opts) => request<T>('POST', p, b ?? {}, o),
  put: <T>(p: string, b?: unknown, o?: Opts) => request<T>('PUT', p, b ?? {}, o),
  patch: <T>(p: string, b?: unknown, o?: Opts) => request<T>('PATCH', p, b ?? {}, o),
  del: <T>(p: string, b?: unknown, o?: Opts) => request<T>('DELETE', p, b, o),
};

export function errMsg(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  return 'Algo salió mal';
}

// Querystring sin URLSearchParams (Hermes lo trae incompleto en algunas versiones).
export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}
