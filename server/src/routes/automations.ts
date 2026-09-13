import { Router } from 'express';
import { query, queryOne } from '../db.ts';
import { requireAdmin } from '../auth/perms.ts';

export const automationsRouter = Router();

// GET / — list automation rules for this org
automationsRouter.get('/', async (req, res) => {
  try {
    const rows = await query(
      `SELECT id, trigger_type, name, description, enabled, run_count, last_run_at, config, created_at, updated_at
       FROM automation_rules
       WHERE organization_id = $1
       ORDER BY created_at ASC`,
      [req.auth!.organizationId],
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar automatizaciones' });
  }
});

// PATCH /:id — toggle enabled or update config (admin only)
automationsRouter.patch('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { enabled } = req.body as { enabled?: boolean };
    if (enabled === undefined) return res.status(400).json({ error: 'Campo enabled requerido' });

    const row = await queryOne(
      `UPDATE automation_rules
       SET enabled = $1, updated_at = NOW()
       WHERE id = $2 AND organization_id = $3
       RETURNING *`,
      [enabled, id, req.auth!.organizationId],
    );
    if (!row) return res.status(404).json({ error: 'Automatización no encontrada' });
    res.json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al actualizar automatización' });
  }
});
