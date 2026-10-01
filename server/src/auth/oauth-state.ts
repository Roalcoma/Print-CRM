import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import { env } from '../env.ts';

// `state` de OAuth firmado: antes era "userId:orgId" (o solo orgId) en claro, así que
// cualquiera que conociera esos ids podía completar un callback y atar SU cuenta de
// Google/Instagram a otra organización. Ahora es un JWT de 10 min ligado al proveedor.
export type OAuthProvider = 'google' | 'zoom' | 'instagram' | 'facebook';

export interface OAuthState {
  userId: string;
  orgId: string;
  provider: OAuthProvider;
}

export function signOAuthState(s: OAuthState): string {
  return jwt.sign(
    { typ: 'oauth_state', uid: s.userId, org: s.orgId, prv: s.provider, n: randomBytes(12).toString('base64url') },
    env.jwtSecret,
    { expiresIn: '10m' },
  );
}

// Devuelve el contenido si la firma, la caducidad y el proveedor son válidos; si no, null.
export function verifyOAuthState(token: unknown, provider: OAuthProvider): OAuthState | null {
  if (typeof token !== 'string' || !token) return null;
  try {
    const c = jwt.verify(token, env.jwtSecret) as Record<string, unknown>;
    if (c.typ !== 'oauth_state' || c.prv !== provider) return null;
    if (typeof c.uid !== 'string' || typeof c.org !== 'string') return null;
    return { userId: c.uid, orgId: c.org, provider };
  } catch {
    return null;
  }
}
