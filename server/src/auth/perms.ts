import type { Request, Response, NextFunction } from 'express';
import { queryOne } from '../db.ts';

// Módulos que se pueden restringir por permiso. Se amplía al añadir features (tareas, etc.).
export const MODULES = ['contacts', 'opportunities', 'tasks'] as const;
export type ModuleKey = (typeof MODULES)[number];

interface CurrentUser { role: string; permissions: unknown }

// Lee rol + permisos frescos de la BD (no del JWT) para que los cambios de
// permiso apliquen sin re-login. ~1 query en rutas protegidas.
async function currentUser(req: Request) {
  return queryOne<CurrentUser>('SELECT role, permissions FROM users WHERE id=$1', [req.auth!.userId]);
}

const isAdmin = (role: string) => role === 'owner' || role === 'admin';

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  currentUser(req)
    .then(u => (u && isAdmin(u.role) ? next() : res.status(403).json({ error: 'Requiere rol de administrador' })))
    .catch(next);
}

export function requireModule(key: ModuleKey) {
  return (req: Request, res: Response, next: NextFunction) => {
    currentUser(req)
      .then(u => {
        if (!u) return res.status(401).json({ error: 'No autenticado' });
        if (isAdmin(u.role)) return next();
        const perms = Array.isArray(u.permissions) ? (u.permissions as string[]) : [];
        return perms.includes(key) ? next() : res.status(403).json({ error: 'Sin permiso para este módulo' });
      })
      .catch(next);
  };
}
