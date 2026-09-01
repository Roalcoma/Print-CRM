// Cliente HTTP para el backoffice de agencia.
// Usa un token JWT separado (claim type='agency') almacenado en localStorage.
const AGENCY_TOKEN_KEY = 'agency_token';

export function getAgencyToken(): string | null {
  return localStorage.getItem(AGENCY_TOKEN_KEY);
}
export function setAgencyToken(token: string | null) {
  if (token) localStorage.setItem(AGENCY_TOKEN_KEY, token);
  else localStorage.removeItem(AGENCY_TOKEN_KEY);
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getAgencyToken();
  const res = await fetch(`/api/agency${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error?.toString() ?? `Error ${res.status}`);
  return data as T;
}

export const agencyApi = {
  get: <T>(p: string) => request<T>('GET', p),
  post: <T>(p: string, b?: unknown) => request<T>('POST', p, b),
  put: <T>(p: string, b?: unknown) => request<T>('PUT', p, b),
  patch: <T>(p: string, b?: unknown) => request<T>('PATCH', p, b),
  del: <T>(p: string) => request<T>('DELETE', p),
};
