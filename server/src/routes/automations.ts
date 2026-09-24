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

// POST / — crear nueva automatización (admin only)
automationsRouter.post('/', requireAdmin, async (req, res) => {
  try {
    const { name, description, trigger_type, config } = req.body as {
      name?: string;
      description?: string;
      trigger_type?: string;
      config?: unknown;
    };
    if (!name || !trigger_type) {
      return res.status(400).json({ error: 'Campos name y trigger_type son requeridos' });
    }
    const row = await queryOne(
      `INSERT INTO automation_rules (organization_id, name, description, trigger_type, config)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [req.auth!.organizationId, name, description ?? null, trigger_type, JSON.stringify(config ?? {})],
    );
    res.status(201).json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al crear automatización' });
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

// PUT /:id — reemplazar config completa (admin only)
automationsRouter.put('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, trigger_type, config, enabled } = req.body as {
      name?: string;
      description?: string;
      trigger_type?: string;
      config?: unknown;
      enabled?: boolean;
    };
    if (!name || !trigger_type) {
      return res.status(400).json({ error: 'Campos name y trigger_type son requeridos' });
    }
    const row = await queryOne(
      `UPDATE automation_rules
       SET name = $1, description = $2, trigger_type = $3, config = $4,
           enabled = COALESCE($5, enabled), updated_at = NOW()
       WHERE id = $6 AND organization_id = $7
       RETURNING *`,
      [name, description ?? null, trigger_type, JSON.stringify(config ?? {}),
       enabled ?? null, id, req.auth!.organizationId],
    );
    if (!row) return res.status(404).json({ error: 'Automatización no encontrada' });
    res.json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al actualizar automatización' });
  }
});

// DELETE /:id — eliminar automatización (admin only)
automationsRouter.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const row = await queryOne(
      `DELETE FROM automation_rules WHERE id = $1 AND organization_id = $2 RETURNING id`,
      [id, req.auth!.organizationId],
    );
    if (!row) return res.status(404).json({ error: 'Automatización no encontrada' });
    res.status(204).end();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al eliminar automatización' });
  }
});
