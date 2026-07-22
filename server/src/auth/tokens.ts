import jwt from 'jsonwebtoken';
import { env } from '../env.ts';

export interface AuthClaims {
  userId: string;
  organizationId: string;
  role: string;
}

export function signToken(claims: AuthClaims): string {
  return jwt.sign(claims, env.jwtSecret, { expiresIn: '7d' });
}

export function verifyToken(token: string): AuthClaims {
  return jwt.verify(token, env.jwtSecret) as AuthClaims;
}
