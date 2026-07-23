import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db.ts';
import { buildFilters, type Condition } from '../filters.ts';
import { toCsv, parseCsv } from '../csv.ts';

export const opportunitiesRouter = Router();

// SELECT base con contacto y responsable embebidos.
const BASE_SELECT = `
  SELECT o.*, c.first_name AS contact_first_name, c.last_name AS contact_last_name,
         c.email AS contact_email, c.phone AS contact_phone, u.name AS owner_name,
         (SELECT count(*)::int FROM opportunity_notes n WHERE n.opportunity_id = o.id) AS notes_count,
         (SELECT coalesce(json_agg(json_build_object('id', fu.id, 'name', fu.name) ORDER BY fu.name), '[]')
          FROM opportunity_followers f JOIN users fu ON fu.id = f.user_id
          WHERE f.opportunity_id = o.id) AS followers
  FROM opportunities o
  LEFT JOIN contacts c ON c.id = o.contact_id
  LEFT JOIN users u ON u.id = o.owner_id`;

// Reemplaza el set de seguidores (valida que pertenezcan a la organización).
async function syncFollowers(opportunityId: string, userIds: string[], orgId: string) {
  await query('DELETE FROM opportunity_followers WHERE opportunity_id = $1', [opportunityId]);
  if (userIds.length === 0) return;
  const valid = await query<{ id: string }>(
    'SELECT id FROM users WHERE organization_id = $1 AND id = ANY($2::uuid[])', [orgId, userIds],
  );
  if (valid.length === 0) return;
  const placeholders = valid.map((_, i) => `($1, $${i + 2})`).join(', ');
  await query(
    `INSERT INTO opportunity_followers (opportunity_id, user_id) VALUES ${placeholders}`,
    [opportunityId, ...valid.map(v => v.id)],
  );
}

// Crea/actualiza/reutiliza el contacto a partir de los campos del formulario.
// Devuelve el contact_id resultante (o el existente si no hay cambios).
async function upsertContact(
  orgId: string,
  contactId: string | null,
  name?: string | null,
  email?: string | null,
  phone?: string | null,
): Promise<string | null> {
  const hasData = !!(name || email || phone);
  if (contactId) {
    if (hasData)
      await query(
        `UPDATE contacts SET first_name = COALESCE($1, first_name), email = $2, phone = $3, updated_at = now()
         WHERE id = $4 AND organization_id = $5`,
        [name || null, email || null, phone || null, contactId, orgId],
      );
    return contactId;
  }
  if (email) {
    const existing = await queryOne<{ id: string }>('SELECT id FROM contacts WHERE organization_id=$1 AND email=$2', [orgId, email]);
    if (existing) return existing.id;
  }
  if (hasData) {
    const [c] = await query<{ id: string }>(
      'INSERT INTO contacts (organization_id, first_name, email, phone) VALUES ($1,$2,$3,$4) RETURNING id',
      [orgId, name || email || 'Sin nombre', email || null, phone || null],
    );
    return c.id;
  }
  return null;
}

// ── Listado con búsqueda + filtros ────────────────────────────────────────────
const querySchema = z.object({
  pipelineId: z.string().uuid(),
  search: z.string().optional(),
  match: z.enum(['AND', 'OR']).optional(),
  filters: z.array(z.object({ field: z.string(), op: z.string(), value: z.unknown().optional() })).optional(),
});

opportunitiesRouter.post('/query', async (req, res) => {
  const parsed = querySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  const { pipelineId, search, match, filters } = parsed.data;

  const where = ['o.organization_id = $1', 'o.pipeline_id = $2'];
  const params: unknown[] = [req.auth!.organizationId, pipelineId];

  if (search?.trim()) {
    params.push(`%${search.trim()}%`);
    where.push(`(o.title ILIKE $${params.length} OR o.business_name ILIKE $${params.length} OR c.first_name ILIKE $${params.length} OR c.last_name ILIKE $${params.length} OR c.email ILIKE $${params.length})`);
  }
  if (filters?.length) {
    const f = buildFilters(filters as Condition[], match ?? 'AND', params.length + 1);
    if (f.sql) { where.push(f.sql); params.push(...f.params); }
  }

  const rows = await query(`${BASE_SELECT} WHERE ${where.join(' AND ')} ORDER BY o.position, o.created_at`, params);
  res.json(rows);
});

// Devuelve una oportunidad con todos sus campos (para abrir el formulario).
opportunitiesRouter.get('/:id', async (req, res) => {
  const row = await queryOne(`${BASE_SELECT} WHERE o.id = $1 AND o.organization_id = $2`, [req.params.id, req.auth!.organizationId]);
  if (!row) return res.status(404).json({ error: 'Oportunidad no encontrada' });
  res.json(row);
});

// ── Crear ─────────────────────────────────────────────────────────────────────
const oppSchema = z.object({
  pipeline_id: z.string().uuid(),
  stage_id: z.string().uuid(),
  title: z.string().min(1),
  value: z.number().nonnegative().optional(),
  status: z.enum(['open', 'won', 'lost']).optional(),
  source: z.string().optional().nullable(),
  business_name: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  owner_id: z.string().uuid().optional().nullable(),
  follower_ids: z.array(z.string().uuid()).optional(),
  contact_id: z.string().uuid().optional().nullable(),
  contact_name: z.string().optional().nullable(),
  contact_email: z.string().optional().nullable(),
  contact_phone: z.string().optional().nullable(),
});

opportunitiesRouter.post('/', async (req, res) => {
  const parsed = oppSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  const o = parsed.data;
  const orgId = req.auth!.organizationId;
  const contactId = await upsertContact(orgId, o.contact_id ?? null, o.contact_name, o.contact_email, o.contact_phone);

  const [row] = await query(
    `INSERT INTO opportunities
       (organization_id, pipeline_id, stage_id, contact_id, title, value, status, source, business_name, tags, owner_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [orgId, o.pipeline_id, o.stage_id, contactId, o.title, o.value ?? 0, o.status ?? 'open',
     o.source ?? null, o.business_name ?? null, o.tags ?? [], o.owner_id ?? null],
  );
  if (o.follower_ids) await syncFollowers(row.id, o.follower_ids, orgId);
  const full = await queryOne(`${BASE_SELECT} WHERE o.id = $1`, [row.id]);
  res.status(201).json(full);
});

// ── Editar ────────────────────────────────────────────────────────────────────
const updateSchema = oppSchema.partial();
const OPP_COLS = ['pipeline_id', 'stage_id', 'title', 'value', 'status', 'source', 'business_name', 'tags', 'owner_id', 'position'] as const;

opportunitiesRouter.patch('/:id', async (req, res) => {
  const parsed = updateSchema.extend({ position: z.number().int().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  const data = parsed.data as Record<string, unknown>;
  const orgId = req.auth!.organizationId;

  const existing = await queryOne<{ contact_id: string | null }>(
    'SELECT contact_id FROM opportunities WHERE id=$1 AND organization_id=$2', [req.params.id, orgId]);
  if (!existing) return res.status(404).json({ error: 'Oportunidad no encontrada' });

  // Contacto: actualiza/crea si vinieron campos de contacto.
  let contactId = existing.contact_id;
  if ('contact_name' in data || 'contact_email' in data || 'contact_phone' in data) {
    contactId = await upsertContact(orgId, existing.contact_id,
      data.contact_name as string, data.contact_email as string, data.contact_phone as string);
  }

  // Seguidores: reemplaza el set si vinieron.
  if ('follower_ids' in data) await syncFollowers(req.params.id, data.follower_ids as string[], orgId);

  // Columnas propias de la oportunidad presentes en el body.
  const cols = OPP_COLS.filter(c => c in data);
  const sets = cols.map((c, i) => `${c} = $${i + 1}`);
  const values: unknown[] = cols.map(c => data[c]);
  if (contactId !== existing.contact_id) { sets.push(`contact_id = $${sets.length + 1}`); values.push(contactId); }
  if (sets.length === 0) { // solo se tocó el contacto
    const full = await queryOne(`${BASE_SELECT} WHERE o.id = $1`, [req.params.id]);
    return res.json(full);
  }

  await query(
    `UPDATE opportunities SET ${sets.join(', ')}, updated_at = now()
     WHERE id = $${values.length + 1} AND organization_id = $${values.length + 2}`,
    [...values, req.params.id, orgId],
  );
  const full = await queryOne(`${BASE_SELECT} WHERE o.id = $1`, [req.params.id]);
  res.json(full);
});

opportunitiesRouter.delete('/:id', async (req, res) => {
  const row = await queryOne('DELETE FROM opportunities WHERE id=$1 AND organization_id=$2 RETURNING id', [req.params.id, req.auth!.organizationId]);
  if (!row) return res.status(404).json({ error: 'Oportunidad no encontrada' });
  res.status(204).end();
});

// ── Notas ───────────────────────────────────────────────────────────────────
opportunitiesRouter.get('/:id/notes', async (req, res) => {
  const rows = await query(
    `SELECT n.* FROM opportunity_notes n
     WHERE n.opportunity_id = $1 AND n.organization_id = $2 ORDER BY n.created_at DESC`,
    [req.params.id, req.auth!.organizationId],
  );
  res.json(rows);
});

opportunitiesRouter.post('/:id/notes', async (req, res) => {
  const parsed = z.object({ body: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  const orgId = req.auth!.organizationId;
  const opp = await queryOne('SELECT id FROM opportunities WHERE id=$1 AND organization_id=$2', [req.params.id, orgId]);
  if (!opp) return res.status(404).json({ error: 'Oportunidad no encontrada' });
  const author = await queryOne<{ name: string }>('SELECT name FROM users WHERE id=$1', [req.auth!.userId]);
  const [row] = await query(
    `INSERT INTO opportunity_notes (organization_id, opportunity_id, body, author_name)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [orgId, req.params.id, parsed.data.body, author?.name ?? null],
  );
  res.status(201).json(row);
});

opportunitiesRouter.delete('/notes/:noteId', async (req, res) => {
  const row = await queryOne('DELETE FROM opportunity_notes WHERE id=$1 AND organization_id=$2 RETURNING id', [req.params.noteId, req.auth!.organizationId]);
  if (!row) return res.status(404).json({ error: 'Nota no encontrada' });
  res.status(204).end();
});

// ── Exportar CSV ────────────────────────────────────────────────────────────
opportunitiesRouter.get('/export/csv', async (req, res) => {
  const pipelineId = req.query.pipelineId;
  if (typeof pipelineId !== 'string') return res.status(400).json({ error: 'Falta pipelineId' });
  const rows = await query<any>(
    `${BASE_SELECT} WHERE o.organization_id = $1 AND o.pipeline_id = $2 ORDER BY o.created_at`,
    [req.auth!.organizationId, pipelineId],
  );
  const stages = await query<{ id: string; name: string }>('SELECT id, name FROM pipeline_stages WHERE pipeline_id=$1', [pipelineId]);
  const stageName = (id: string) => stages.find(s => s.id === id)?.name ?? '';
  const headers = ['title', 'value', 'status', 'stage', 'source', 'business_name', 'tags', 'contact_name', 'contact_email', 'contact_phone', 'created_at'];
  const data = rows.map(r => [
    r.title, r.value, r.status, stageName(r.stage_id), r.source ?? '', r.business_name ?? '', (r.tags ?? []).join('; '),
    [r.contact_first_name, r.contact_last_name].filter(Boolean).join(' '), r.contact_email ?? '', r.contact_phone ?? '', r.created_at.toISOString(),
  ]);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="oportunidades.csv"');
  res.send(toCsv(headers, data));
});

// ── Importar CSV ────────────────────────────────────────────────────────────
opportunitiesRouter.post('/import', async (req, res) => {
  const parsed = z.object({ pipelineId: z.string().uuid(), csv: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  const orgId = req.auth!.organizationId;
  const { pipelineId } = parsed.data;

  const stages = await query<{ id: string; name: string; position: number }>(
    `SELECT s.id, s.name, s.position FROM pipeline_stages s JOIN pipelines p ON p.id=s.pipeline_id
     WHERE s.pipeline_id=$1 AND p.organization_id=$2 ORDER BY s.position`, [pipelineId, orgId]);
  if (stages.length === 0) return res.status(404).json({ error: 'Pipeline no encontrado o sin etapas' });
  const defaultStage = stages[0].id;
  const stageByName = new Map(stages.map(s => [s.name.toLowerCase(), s.id]));

  const rows = parseCsv(parsed.data.csv);
  if (rows.length < 2) return res.status(400).json({ error: 'CSV vacío o sin filas de datos' });
  const cols = rows[0].map(c => c.trim().toLowerCase());
  const col = (r: string[], name: string) => { const i = cols.indexOf(name); return i >= 0 ? r[i]?.trim() ?? '' : ''; };

  let imported = 0;
  const errors: string[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const title = col(r, 'title');
    if (!title) { errors.push(`Fila ${i + 1}: sin título`); continue; }
    const value = Number(col(r, 'value')) || 0;
    const statusRaw = col(r, 'status');
    const status = ['open', 'won', 'lost'].includes(statusRaw) ? statusRaw : 'open';
    const stageId = stageByName.get(col(r, 'stage').toLowerCase()) ?? defaultStage;
    const contactId = await upsertContact(orgId, null, col(r, 'contact_name'), col(r, 'contact_email'), col(r, 'contact_phone'));

    await query(
      `INSERT INTO opportunities (organization_id, pipeline_id, stage_id, contact_id, title, value, status, source, business_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [orgId, pipelineId, stageId, contactId, title, value, status, col(r, 'source') || null, col(r, 'business_name') || null],
    );
    imported++;
  }
  res.json({ imported, errors });
});
