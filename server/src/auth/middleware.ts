import type { Request, Response, NextFunction } from 'express';
import { verifyToken, type AuthClaims } from './tokens.ts';
import { validateSession } from './session.ts';

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
  let claims: AuthClaims & { type?: string };
  try {
    claims = verifyToken(header.slice(7)) as AuthClaims & { type?: string };
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
  // Un token de agencia no es una sesión del CRM: no tiene organización
  if (claims.type === 'agency' || !claims.organizationId || !claims.userId) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
  // Sesión revocable: el usuario debe seguir existiendo y en la org (caché de 60 s)
  validateSession(claims)
    .then(user => {
      if (!user) return res.status(401).json({ error: 'Sesión cerrada. Vuelve a iniciar sesión.' });
      // Rol fresco de la BD (el del JWT puede ser de hace semanas)
      req.auth = { ...claims, role: user.role };
      next();
    })
    .catch(next);
}
