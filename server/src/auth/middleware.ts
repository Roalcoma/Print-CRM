import type { Request, Response, NextFunction } from 'express';
import { verifyToken, type AuthClaims } from './tokens.ts';

// Adjunta los claims del JWT a req.auth. Todas las rutas protegidas leen
// req.auth.organizationId para filtrar por tenant (aislamiento row-level).
declare global {
  // eslint-disable-next-line no-var
  namespace Express {
    interface Request {
      auth?: AuthClaims;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  try {
    req.auth = verifyToken(header.slice(7));
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
}
