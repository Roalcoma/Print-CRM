import jwt from 'jsonwebtoken';
import { env } from '../env.ts';

export interface AuthClaims {
  userId: string;
  organizationId: string;
  role: string;
  impersonatedByAgency?: boolean;
}

export function signToken(claims: AuthClaims): string {
  // Sesión larga: el usuario puede dejar el CRM logueado (como GHL).
  // ponytail: token de larga duración; migrar a refresh tokens si se necesita revocación.
  return jwt.sign(claims, env.jwtSecret, { expiresIn: '30d' });
}

export function verifyToken(token: string): AuthClaims {
  return jwt.verify(token, env.jwtSecret) as AuthClaims;
}
