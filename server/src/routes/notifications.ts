import { Router } from 'express';
import { query, queryOne } from '../db.ts';

export const notificationsRouter = Router();

// GET / — list notifications for the current user
notificationsRouter.get('/', async (req, res) => {
  try {
    const { organizationId, userId } = req.auth!;
    const rows = await query(
      `SELECT id, type, title, body, read_at, entity_type, entity_id, created_at
       FROM notifications
       WHERE organization_id = $1 AND user_id = $2
       ORDER BY read_at NULLS FIRST, created_at DESC
       LIMIT 50`,
      [organizationId, userId],
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener notificaciones' });
  }
});

// PATCH /:id/read — mark a single notification as read
notificationsRouter.patch('/:id/read', async (req, res) => {
  try {
    const { userId } = req.auth!;
    const { id } = req.params;
    const row = await queryOne(
      `UPDATE notifications SET read_at = now()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [id, userId],
    );
    if (!row) return res.status(404).json({ error: 'Notificación no encontrada' });
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al marcar notificación' });
  }
});

// POST /read-all — mark all unread notifications as read
notificationsRouter.post('/read-all', async (req, res) => {
  try {
    const { organizationId, userId } = req.auth!;
    await query(
      `UPDATE notifications SET read_at = now()
       WHERE organization_id = $1 AND user_id = $2 AND read_at IS NULL`,
      [organizationId, userId],
    );
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al marcar todas las notificaciones' });
  }
});
