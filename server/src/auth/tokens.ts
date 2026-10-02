import jwt from 'jsonwebtoken';
import { env } from '../env.ts';

export interface AuthClaims {
  userId: string;
  organizationId: string;
  role: string;
  impersonatedByAgency?: boolean;
  // Admin de agencia que impersona (si se desactiva, su token de impersonación deja de valer)
  agencyAdminId?: string;
  // users.token_version al emitirlo; si no coincide la sesión está cerrada. Ausente = 0.
  tv?: number;
}

export function signToken(claims: AuthClaims): string {
  // Sesión larga: el usuario puede dejar el CRM logueado (como GHL). Es revocable:
  // requireAuth comprueba en BD (con caché corta) que el usuario siga existiendo,
  // en la org y con la misma token_version (auth/session.ts).
  return jwt.sign(claims, env.jwtSecret, { expiresIn: '30d' });
}

export function verifyToken(token: string): AuthClaims {
  const claims = jwt.verify(token, env.jwtSecret) as AuthClaims & { typ?: string };
  // Un token con `typ` (state de OAuth, token de media…, mismo secreto) nunca vale como sesión
  if (claims.typ) throw new Error('Token no válido como sesión');
  return claims;
}

// ── Token de media ──────────────────────────────────────────────────────────
// Va en la URL de <img>/<video>/<audio> (no pueden mandar cabeceras), así que es de vida
// corta y solo sirve para /api/media: nunca la sesión de 30 días en una URL.
const MEDIA_TTL = '10m';

// Copia de la sesión lo justo para revalidarla (validateSession) al servir cada archivo.
export function signMediaToken(c: AuthClaims): string {
  const { userId, organizationId, tv, impersonatedByAgency, agencyAdminId } = c;
  return jwt.sign({ typ: 'media', userId, organizationId, tv, impersonatedByAgency, agencyAdminId }, env.jwtSecret, { expiresIn: MEDIA_TTL });
}

export function verifyMediaToken(token: string): AuthClaims {
  const c = jwt.verify(token, env.jwtSecret) as AuthClaims & { typ?: string };
  if (c.typ !== 'media' || !c.userId || !c.organizationId) throw new Error('Token de media no válido');
  return { userId: c.userId, organizationId: c.organizationId, role: '', tv: c.tv, impersonatedByAgency: c.impersonatedByAgency, agencyAdminId: c.agencyAdminId };
}
