import { Router } from 'express';
import { query } from '../db.ts';

export const usersRouter = Router();

// Usuarios de la organización (para el select de "Responsable").
usersRouter.get('/', async (req, res) => {
  const rows = await query(
    'SELECT id, name, email, role FROM users WHERE organization_id = $1 ORDER BY name',
    [req.auth!.organizationId],
  );
  res.json(rows);
});
