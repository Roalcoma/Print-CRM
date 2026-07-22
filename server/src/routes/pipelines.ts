import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne, pool } from '../db.ts';

export const pipelinesRouter = Router();

const HEX = /^#[0-9a-fA-F]{6}$/;

// Verifica que un pipeline pertenece al tenant. Devuelve el id o null.
async function ownedPipeline(id: string, orgId: string) {
  return queryOne<{ id: string }>('SELECT id FROM pipelines WHERE id=$1 AND organization_id=$2', [id, orgId]);
}

// ── Listado con etapas anidadas ──────────────────────────────────────────────
pipelinesRouter.get('/', async (req, res) => {
  const orgId = req.auth!.organizationId;
  const pipelines = await query<{ id: string; name: string; created_at: string }>(
    'SELECT id, name, created_at FROM pipelines WHERE organization_id = $1 ORDER BY created_at',
    [orgId],
  );
  const stages = await query<{ id: string; pipeline_id: string; name: string; position: number; color: string }>(
    `SELECT s.id, s.pipeline_id, s.name, s.position, s.color
     FROM pipeline_stages s JOIN pipelines p ON p.id = s.pipeline_id
     WHERE p.organization_id = $1 ORDER BY s.position`,
    [orgId],
  );
  res.json(pipelines.map(p => ({ ...p, stages: stages.filter(s => s.pipeline_id === p.id) })));
});

// ── Crear pipeline (con una etapa inicial para que no quede vacío) ────────────
pipelinesRouter.post('/', async (req, res) => {
  const parsed = z.object({ name: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  const [p] = await query<{ id: string; name: string }>(
    'INSERT INTO pipelines (organization_id, name) VALUES ($1,$2) RETURNING id, name',
    [req.auth!.organizationId, parsed.data.name],
  );
  await query('INSERT INTO pipeline_stages (pipeline_id, name, position) VALUES ($1,$2,0)', [p.id, 'Nuevo']);
  res.status(201).json(p);
});

pipelinesRouter.put('/:id', async (req, res) => {
  const parsed = z.object({ name: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  const [row] = await query(
    'UPDATE pipelines SET name=$1 WHERE id=$2 AND organization_id=$3 RETURNING id, name',
    [parsed.data.name, req.params.id, req.auth!.organizationId],
  );
  if (!row) return res.status(404).json({ error: 'Pipeline no encontrado' });
  res.json(row);
});

pipelinesRouter.delete('/:id', async (req, res) => {
  const row = await queryOne(
    'DELETE FROM pipelines WHERE id=$1 AND organization_id=$2 RETURNING id',
    [req.params.id, req.auth!.organizationId],
  );
  if (!row) return res.status(404).json({ error: 'Pipeline no encontrado' });
  res.status(204).end();
});

// ── Etapas ───────────────────────────────────────────────────────────────────
pipelinesRouter.post('/:id/stages', async (req, res) => {
  const parsed = z.object({ name: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  if (!(await ownedPipeline(req.params.id, req.auth!.organizationId)))
    return res.status(404).json({ error: 'Pipeline no encontrado' });
  const [{ next }] = await query<{ next: number }>(
    'SELECT COALESCE(MAX(position)+1,0) AS next FROM pipeline_stages WHERE pipeline_id=$1', [req.params.id],
  );
  const [row] = await query(
    'INSERT INTO pipeline_stages (pipeline_id, name, position) VALUES ($1,$2,$3) RETURNING *',
    [req.params.id, parsed.data.name, next],
  );
  res.status(201).json(row);
});

// Reordenar: recibe el array completo de stage ids en el nuevo orden.
pipelinesRouter.put('/:id/stages/order', async (req, res) => {
  const parsed = z.object({ order: z.array(z.string().uuid()) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  if (!(await ownedPipeline(req.params.id, req.auth!.organizationId)))
    return res.status(404).json({ error: 'Pipeline no encontrado' });
  // Actualiza position según el índice en el array. Whitelist implícita: solo etapas del pipeline.
  await Promise.all(
    parsed.data.order.map((sid, i) =>
      query('UPDATE pipeline_stages SET position=$1 WHERE id=$2 AND pipeline_id=$3', [i, sid, req.params.id]),
    ),
  );
  res.status(204).end();
});

// Guardado masivo del editor de pipeline: renombra el pipeline y sincroniza sus
// etapas (nombres, colores, orden, altas y bajas) en una sola transacción.
// La posición se toma del orden del array. Rechaza borrar etapas con oportunidades.
const bulkSchema = z.object({
  name: z.string().min(1),
  stages: z.array(z.object({
    id: z.string().uuid().optional(),
    name: z.string().min(1),
    color: z.string().regex(HEX),
  })).min(1),
});

pipelinesRouter.put('/:id/edit', async (req, res) => {
  const parsed = bulkSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  if (!(await ownedPipeline(req.params.id, req.auth!.organizationId)))
    return res.status(404).json({ error: 'Pipeline no encontrado' });

  const { name, stages } = parsed.data;
  const keepIds = stages.filter(s => s.id).map(s => s.id!);
  const existing = await query<{ id: string }>('SELECT id FROM pipeline_stages WHERE pipeline_id=$1', [req.params.id]);
  const toDelete = existing.map(e => e.id).filter(id => !keepIds.includes(id));

  // No borrar etapas con oportunidades.
  for (const id of toDelete) {
    const inUse = await queryOne('SELECT 1 FROM opportunities WHERE stage_id=$1 LIMIT 1', [id]);
    if (inUse) return res.status(409).json({ error: 'Hay etapas con oportunidades que intentas eliminar; muévelas primero' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE pipelines SET name=$1 WHERE id=$2', [name, req.params.id]);
    if (toDelete.length)
      await client.query('DELETE FROM pipeline_stages WHERE id = ANY($1::uuid[])', [toDelete]);
    for (let i = 0; i < stages.length; i++) {
      const s = stages[i];
      if (s.id)
        await client.query('UPDATE pipeline_stages SET name=$1, color=$2, position=$3 WHERE id=$4 AND pipeline_id=$5',
          [s.name, s.color, i, s.id, req.params.id]);
      else
        await client.query('INSERT INTO pipeline_stages (pipeline_id, name, color, position) VALUES ($1,$2,$3,$4)',
          [req.params.id, s.name, s.color, i]);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  res.status(204).end();
});
