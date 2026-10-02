// Validación de sesiones contra la BD: un JWT firmado no basta, el usuario tiene que seguir
// existiendo, pertenecer a la organización del token y tener la misma token_version.
// Caché en memoria de 60 s por usuario+org para no consultar en cada petición; las rutas
// que borran usuarios o cambian rol/permisos/contraseña llaman a invalidateUser().
// ponytail: caché por proceso; con varias instancias del server la revocación tardaría
// hasta CACHE_MS en llegar a las demás (hoy hay una sola).
import { queryOne } from '../db.ts';
import type { AuthClaims } from './tokens.ts';

export interface SessionUser {
  role: string;
  permissions: string[];
  tokenVersion: number;
}

const CACHE_MS = 60_000;
const cache = new Map<string, { user: SessionUser | null; at: number }>();
const listeners = new Set<(userId: string) => void>();

const isUuid = (v: unknown) => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);
const keyOf =(c: AuthClaims) =>
  `${c.userId}:${c.organizationId}:${c.impersonatedByAgency ? `imp:${c.agencyAdminId ?? ''}` : ''}`;

async function load(c: AuthClaims): Promise<SessionUser | null> {
  const row = await queryOne<{ role: string; permissions: unknown; token_version: number; ok: boolean }>(
    `SELECT u.role, u.permissions, u.token_version,
            CASE WHEN $3::boolean
              -- Impersonación de la agencia: el usuario actúa en una org ajena; basta con que
              -- exista y, si el token lo dice, que el admin de agencia siga activo.
              THEN ($4::uuid IS NULL OR EXISTS (SELECT 1 FROM agency_admins a WHERE a.id = $4 AND a.is_active))
              ELSE (u.organization_id = $2 OR EXISTS (
                     SELECT 1 FROM user_organizations uo WHERE uo.user_id = u.id AND uo.organization_id = $2))
            END AS ok
     FROM users u WHERE u.id = $1`,
    [c.userId, c.organizationId, c.impersonatedByAgency === true, c.agencyAdminId ?? null],
  );
  if (!row?.ok) return null;
  return {
    role: row.role,
    permissions: Array.isArray(row.permissions) ? (row.permissions as string[]) : [],
    tokenVersion: row.token_version ?? 0,
  };
}

// Devuelve el usuario de la sesión o null si ya no es válida (borrado, fuera de la org,
// sesiones cerradas por token_version…).
export async function validateSession(c: AuthClaims): Promise<SessionUser | null> {
  if (!isUuid(c.userId) || !isUuid(c.organizationId) || (c.agencyAdminId != null && !isUuid(c.agencyAdminId))) return null;
  const key = keyOf(c);
  const hit = cache.get(key);
  let user: SessionUser | null;
  if (hit && Date.now() - hit.at < CACHE_MS) user = hit.user;
  else {
    user = await load(c);
    if (cache.size > 10_000) cache.clear();   // tope de memoria simple
    cache.set(key, { user, at: Date.now() });
  }
  // La impersonación (8 h, emitida por la agencia) no depende de la versión del usuario
  if (user && !c.impersonatedByAgency && (c.tv ?? 0) !== user.tokenVersion) return null;
  return user;
}

// Olvida lo cacheado de un usuario (todas sus orgs) y avisa a los suscriptores (WebSocket).
export function invalidateUser(userId: string) {
  for (const k of cache.keys()) if (k.startsWith(`${userId}:`)) cache.delete(k);
  for (const fn of listeners) fn(userId);
}

export function onInvalidateUser(fn: (userId: string) => void) {
  listeners.add(fn);
}
