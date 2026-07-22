import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db.ts';

export const stagesRouter = Router();

// Confirma que la etapa pertenece a un pipeline del tenant.
async function ownedStage(stageId: string, orgId: string) {
  return queryOne<{ id: string }>(
    `SELECT s.id FROM pipeline_stages s JOIN pipelines p ON p.id = s.pipeline_id
     WHERE s.id=$1 AND p.organization_id=$2`,
    [stageId, orgId],
  );
}

stagesRouter.put('/:id', async (req, res) => {
  const parsed = z.object({ name: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  if (!(await ownedStage(req.params.id, req.auth!.organizationId)))
    return res.status(404).json({ error: 'Etapa no encontrada' });
  const [row] = await query('UPDATE pipeline_stages SET name=$1 WHERE id=$2 RETURNING *', [parsed.data.name, req.params.id]);
  res.json(row);
});

// Borrar etapa: rechaza si tiene oportunidades (evita perder datos por CASCADE).
stagesRouter.delete('/:id', async (req, res) => {
  if (!(await ownedStage(req.params.id, req.auth!.organizationId)))
    return res.status(404).json({ error: 'Etapa no encontrada' });
  const inUse = await queryOne('SELECT 1 FROM opportunities WHERE stage_id=$1 LIMIT 1', [req.params.id]);
  if (inUse) return res.status(409).json({ error: 'La etapa tiene oportunidades; muévelas antes de eliminar' });
  await query('DELETE FROM pipeline_stages WHERE id=$1', [req.params.id]);
  res.status(204).end();
});
