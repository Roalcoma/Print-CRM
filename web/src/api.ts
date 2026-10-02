// Cliente HTTP mínimo sobre fetch nativo. Inyecta el token y parsea JSON/errores.
// ponytail: sin axios; fetch cubre todo lo que necesitamos.
import { apiErrorMessage } from './utils/apiError';

const TOKEN_KEY = 'crm_token';

// Error de sesión caducada: ya redirige a /login, no hace falta avisar con un toast.
export class SessionExpiredError extends Error {
  constructor() { super('Sesión expirada'); this.name = 'SessionExpiredError'; }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    window.location.replace('/login');
    throw new SessionExpiredError();
  }
  const data = await res.json().catch(() => ({}));
  // `error` puede ser texto o el array de issues de zod: siempre un mensaje legible
  if (!res.ok) throw new Error(apiErrorMessage((data as { error?: unknown }).error, `Error ${res.status}`));
  return data as T;
}

export const api = {
  get: <T>(p: string) => request<T>('GET', p),
  post: <T>(p: string, b?: unknown) => request<T>('POST', p, b),
  put: <T>(p: string, b?: unknown) => request<T>('PUT', p, b),
  patch: <T>(p: string, b?: unknown) => request<T>('PATCH', p, b),
  del: <T>(p: string) => request<T>('DELETE', p),
};
