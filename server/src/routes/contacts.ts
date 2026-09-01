import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db.ts';
import { logActivity } from '../activity.ts';

export const contactsRouter = Router();

const contactSchema = z.object({
  first_name:      z.string().min(1),
  last_name:       z.string().optional().nullable(),
  email:           z.string().email().optional().or(z.literal('')).nullable(),
  phone:           z.string().optional().nullable(),
  email_secondary: z.string().email().optional().or(z.literal('')).nullable(),
  phone_secondary: z.string().optional().nullable(),
  company:         z.string().optional().nullable(),
  position:        z.string().optional().nullable(),
  address:         z.string().optional().nullable(),
  city:            z.string().optional().nullable(),
  country:         z.string().optional().nullable(),
  birthday:        z.string().optional().nullable(),
  linkedin:        z.string().optional().nullable(),
  twitter:         z.string().optional().nullable(),
  instagram:       z.string().optional().nullable(),
  website:         z.string().optional().nullable(),
  source:          z.string().optional().nullable(),
  status:          z.enum(['active', 'inactive', 'blocked']).optional(),
  avatar_color:    z.string().optional().nullable(),
  tags:            z.array(z.string()).optional(),
  notes:           z.string().optional().nullable(),
});

// GET /contacts/export/csv
contactsRouter.get('/export/csv', async (req, res) => {
  const orgId = req.auth!.organizationId;
  const rows = await query(
    `SELECT first_name, last_name, email, phone, email_secondary, phone_secondary,
            company, position, address, city, country, birthday,
            linkedin, twitter, instagram, website, source, status,
            array_to_string(tags, '|') AS tags, notes, created_at
     FROM contacts WHERE organization_id = $1 ORDER BY created_at DESC`,
    [orgId],
  );

  const headers = [
    'Nombre','Apellido','Email','Teléfono','Email 2','Teléfono 2',
    'Empresa','Cargo','Dirección','Ciudad','País','Cumpleaños',
    'LinkedIn','Twitter','Instagram','Web','Origen','Estado','Etiquetas','Notas','Creado',
  ];

  const escape = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const csv = [headers.join(','), ...rows.map(r =>
    [r.first_name, r.last_name, r.email, r.phone, r.email_secondary, r.phone_secondary,
     r.company, r.position, r.address, r.city, r.country, r.birthday,
     r.linkedin, r.twitter, r.instagram, r.website, r.source, r.status,
     r.tags, r.notes, r.created_at].map(escape).join(',')
  )].join('\r\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="contactos.csv"');
  res.send('﻿' + csv);
});

// POST /contacts/import/csv
contactsRouter.post('/import/csv', async (req, res) => {
  const orgId   = req.auth!.organizationId;
  const actorId = req.auth!.userId;
  const { rows } = req.body as { rows: Record<string, string>[] };

  if (!Array.isArray(rows) || rows.length === 0)
    return res.status(400).json({ error: 'rows vacío o inválido' });

  const results = { created: 0, skipped: 0, errors: [] as string[] };

  for (const r of rows.slice(0, 500)) {
    const firstName = (r['Nombre'] ?? r['first_name'] ?? '').trim();
    if (!firstName) { results.skipped++; continue; }

    try {
      await query(
        `INSERT INTO contacts (organization_id, first_name, last_name, email, phone,
           company, position, city, country, source, status, tags, notes, avatar_color)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,null)
         ON CONFLICT DO NOTHING`,
        [
          orgId,
          firstName,
          (r['Apellido'] ?? r['last_name'] ?? '') || null,
          (r['Email']    ?? r['email']     ?? '') || null,
          (r['Teléfono'] ?? r['phone']     ?? '') || null,
          (r['Empresa']  ?? r['company']   ?? '') || null,
          (r['Cargo']    ?? r['position']  ?? '') || null,
          (r['Ciudad']   ?? r['city']      ?? '') || null,
          (r['País']     ?? r['country']   ?? '') || null,
          (r['Origen']   ?? r['source']    ?? '') || null,
          (r['Estado']   ?? r['status']    ?? 'active'),
          (r['Etiquetas'] ?? r['tags'] ?? '').split('|').map((t: string) => t.trim()).filter(Boolean),
          (r['Notas']    ?? r['notes']     ?? '') || null,
        ],
      );
      results.created++;
    } catch {
      results.skipped++;
    }
  }

  const actor = await queryOne<{ name: string }>('SELECT name FROM users WHERE id=$1', [actorId]);
  logActivity({ orgId, entityType: 'contact', entityId: orgId, actorId, actorName: actor?.name ?? null, eventType: 'contacts_imported', meta: { count: results.created } }).catch(console.error);
  res.json(results);
});

// GET /contacts/stats — resumen estadístico del tenant
contactsRouter.get('/stats', async (req, res) => {
  const orgId = req.auth!.organizationId;

  const [totals, bySource] = await Promise.all([
    queryOne<{ total: string; active: string; inactive: string; new_this_month: string; companies: string }>(
      `SELECT
         count(*)                                                  AS total,
         count(*) FILTER (WHERE status = 'active')                AS active,
         count(*) FILTER (WHERE status = 'inactive')              AS inactive,
         count(*) FILTER (WHERE date_trunc('month', created_at) = date_trunc('month', now())) AS new_this_month,
         count(DISTINCT company) FILTER (WHERE company IS NOT NULL AND company <> '') AS companies
       FROM contacts
       WHERE organization_id = $1`,
      [orgId],
    ),
    query<{ source: string | null; count: string }>(
      `SELECT source, count(*) AS count
       FROM contacts
       WHERE organization_id = $1
       GROUP BY source
       ORDER BY count DESC`,
      [orgId],
    ),
  ]);

  res.json({
    total:          Number(totals?.total ?? 0),
    active:         Number(totals?.active ?? 0),
    inactive:       Number(totals?.inactive ?? 0),
    new_this_month: Number(totals?.new_this_month ?? 0),
    companies:      Number(totals?.companies ?? 0),
    by_source:      bySource.map(r => ({ source: r.source ?? 'unknown', count: Number(r.count) })),
  });
});

// GET /contacts — listar con filtros, paginación y sort
contactsRouter.get('/', async (req, res) => {
  const orgId  = req.auth!.organizationId;
  const q      = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const page   = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const offset = (page - 1) * limit;
  const like   = q ? `%${q}%` : null;

  // Filtros adicionales
  const statusFilter  = typeof req.query.status  === 'string' ? req.query.status  : null;
  const sourceFilter  = typeof req.query.source  === 'string' ? req.query.source  : null;
  const companyFilter = typeof req.query.company === 'string' ? req.query.company.trim() : null;

  // Sort
  const sortMap: Record<string, string> = {
    name:       'first_name ASC, last_name ASC',
    created_at: 'created_at DESC',
    company:    'company ASC NULLS LAST',
  };
  const sortParam = typeof req.query.sort === 'string' ? req.query.sort : 'created_at';
  const orderBy   = sortMap[sortParam] ?? 'created_at DESC';

  // Build WHERE clauses dynamically
  const conditions: string[] = ['organization_id = $1'];
  const params: unknown[]    = [orgId];
  let   idx = 2;

  if (like) {
    conditions.push(`(first_name ILIKE $${idx} OR last_name ILIKE $${idx} OR email ILIKE $${idx} OR phone ILIKE $${idx} OR company ILIKE $${idx})`);
    params.push(like);
    idx++;
  }
  if (statusFilter) {
    conditions.push(`status = $${idx}`);
    params.push(statusFilter);
    idx++;
  }
  if (sourceFilter) {
    conditions.push(`source = $${idx}`);
    params.push(sourceFilter);
    idx++;
  }
  if (companyFilter) {
    conditions.push(`company ILIKE $${idx}`);
    params.push(`%${companyFilter}%`);
    idx++;
  }

  const whereClause = conditions.join(' AND ');

  const [countRows, rows] = await Promise.all([
    query<{ total: string }>(
      `SELECT count(*) AS total FROM contacts WHERE ${whereClause}`,
      params,
    ),
    query(
      `SELECT * FROM contacts WHERE ${whereClause} ORDER BY ${orderBy} LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset],
    ),
  ]);

  const total = Number(countRows[0].total);
  res.json({ data: rows, total, page, limit, pages: Math.ceil(total / limit) });
});

// POST /contacts — crear
contactsRouter.post('/', async (req, res) => {
  const parsed = contactSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  const c      = parsed.data;
  const orgId  = req.auth!.organizationId;
  const actorId = req.auth!.userId;

  const [row] = await query(
    `INSERT INTO contacts (
       organization_id, first_name, last_name, email, phone,
       email_secondary, phone_secondary, company, position,
       address, city, country, birthday, linkedin, twitter,
       instagram, website, source, status, avatar_color, tags, notes
     ) VALUES (
       $1,  $2,  $3,  $4,  $5,
       $6,  $7,  $8,  $9,
       $10, $11, $12, $13, $14, $15,
       $16, $17, $18, $19, $20, $21, $22
     ) RETURNING *`,
    [
      orgId,
      c.first_name,
      c.last_name       ?? null,
      c.email           || null,
      c.phone           ?? null,
      c.email_secondary || null,
      c.phone_secondary ?? null,
      c.company         ?? null,
      c.position        ?? null,
      c.address         ?? null,
      c.city            ?? null,
      c.country         ?? null,
      c.birthday        ?? null,
      c.linkedin        ?? null,
      c.twitter         ?? null,
      c.instagram       ?? null,
      c.website         ?? null,
      c.source          ?? null,
      c.status          ?? 'active',
      c.avatar_color    ?? null,
      c.tags            ?? [],
      c.notes           ?? null,
    ],
  );

  const fullName = [c.first_name, c.last_name].filter(Boolean).join(' ');
  const actor    = await queryOne<{ name: string }>('SELECT name FROM users WHERE id=$1', [actorId]);
  logActivity({ orgId, entityType: 'contact', entityId: row.id, actorId, actorName: actor?.name ?? null, eventType: 'contact_created', meta: { name: fullName } }).catch(console.error);
  res.status(201).json(row);
});

// GET /:id — detalle completo con oportunidades, citas, tareas y archivos
contactsRouter.get('/:id', async (req, res) => {
  const orgId = req.auth!.organizationId;
  const id    = req.params.id;

  const [row, opps, tasks, appointments, files] = await Promise.all([
    queryOne(
      'SELECT * FROM contacts WHERE id = $1 AND organization_id = $2',
      [id, orgId],
    ),
    query(
      `SELECT o.id, o.title, o.value, o.status, o.created_at, s.name AS stage_name
       FROM opportunities o
       JOIN pipeline_stages s ON s.id = o.stage_id
       WHERE o.contact_id = $1 AND o.organization_id = $2
       ORDER BY o.created_at DESC`,
      [id, orgId],
    ),
    query(
      `SELECT t.id, t.title, t.status, t.priority, t.due_at, t.created_at,
              o.title AS opportunity_title
       FROM tasks t
       JOIN opportunities o ON o.id = t.opportunity_id
       WHERE o.contact_id = $1 AND t.organization_id = $2
       ORDER BY t.created_at DESC`,
      [id, orgId],
    ),
    query(
      `SELECT a.*, u.name AS user_name FROM appointments a
       LEFT JOIN users u ON u.id = a.user_id
       WHERE a.contact_id = $1 AND a.organization_id = $2
       ORDER BY a.start_at DESC`,
      [id, orgId],
    ),
    query(
      'SELECT * FROM contact_files WHERE contact_id = $1 AND organization_id = $2 ORDER BY created_at DESC',
      [id, orgId],
    ),
  ]);

  if (!row) return res.status(404).json({ error: 'Contacto no encontrado' });

  res.json({ ...row, opportunities: opps, tasks, appointments, files });
});

// GET /:id/opportunities — oportunidades asociadas
contactsRouter.get('/:id/opportunities', async (req, res) => {
  const rows = await query(
    `SELECT o.id, o.title, o.value, o.status, o.created_at, s.name AS stage_name
     FROM opportunities o
     JOIN pipeline_stages s ON s.id = o.stage_id
     WHERE o.contact_id = $1 AND o.organization_id = $2
     ORDER BY o.created_at DESC`,
    [req.params.id, req.auth!.organizationId],
  );
  res.json(rows);
});

// GET /:id/tasks — tareas ligadas a oportunidades de este contacto
contactsRouter.get('/:id/tasks', async (req, res) => {
  const rows = await query(
    `SELECT t.id, t.title, t.status, t.priority, t.due_at, t.created_at,
            o.title AS opportunity_title
     FROM tasks t
     JOIN opportunities o ON o.id = t.opportunity_id
     WHERE o.contact_id = $1 AND t.organization_id = $2
     ORDER BY t.created_at DESC`,
    [req.params.id, req.auth!.organizationId],
  );
  res.json(rows);
});

// GET /:id/appointments — citas ligadas a este contacto
contactsRouter.get('/:id/appointments', async (req, res) => {
  const rows = await query(
    `SELECT a.*, u.name AS user_name FROM appointments a
     LEFT JOIN users u ON u.id = a.user_id
     WHERE a.contact_id = $1 AND a.organization_id = $2
     ORDER BY a.start_at DESC`,
    [req.params.id, req.auth!.organizationId],
  );
  res.json(rows);
});

// PUT /:id — reemplazar (compatibilidad)
contactsRouter.put('/:id', async (req, res) => {
  const parsed = contactSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  const c      = parsed.data;
  const orgId  = req.auth!.organizationId;
  const actorId = req.auth!.userId;

  const [row] = await query(
    `UPDATE contacts SET
       first_name=$1, last_name=$2, email=$3, phone=$4,
       email_secondary=$5, phone_secondary=$6, company=$7, position=$8,
       address=$9, city=$10, country=$11, birthday=$12,
       linkedin=$13, twitter=$14, instagram=$15, website=$16,
       source=$17, status=$18, avatar_color=$19, tags=$20, notes=$21,
       updated_at=now()
     WHERE id=$22 AND organization_id=$23 RETURNING *`,
    [
      c.first_name,
      c.last_name       ?? null,
      c.email           || null,
      c.phone           ?? null,
      c.email_secondary || null,
      c.phone_secondary ?? null,
      c.company         ?? null,
      c.position        ?? null,
      c.address         ?? null,
      c.city            ?? null,
      c.country         ?? null,
      c.birthday        ?? null,
      c.linkedin        ?? null,
      c.twitter         ?? null,
      c.instagram       ?? null,
      c.website         ?? null,
      c.source          ?? null,
      c.status          ?? 'active',
      c.avatar_color    ?? null,
      c.tags            ?? [],
      c.notes           ?? null,
      req.params.id,
      orgId,
    ],
  );

  if (!row) return res.status(404).json({ error: 'Contacto no encontrado' });
  const fullName = [c.first_name, c.last_name].filter(Boolean).join(' ');
  const actor    = await queryOne<{ name: string }>('SELECT name FROM users WHERE id=$1', [actorId]);
  logActivity({ orgId, entityType: 'contact', entityId: req.params.id, actorId, actorName: actor?.name ?? null, eventType: 'contact_updated', meta: { name: fullName } }).catch(console.error);
  res.json(row);
});

// PATCH /:id — actualización parcial
contactsRouter.patch('/:id', async (req, res) => {
  const orgId  = req.auth!.organizationId;
  const actorId = req.auth!.userId;
  const allowed = [
    'first_name','last_name','email','phone','email_secondary','phone_secondary',
    'company','position','address','city','country','birthday','linkedin','twitter',
    'instagram','website','source','status','avatar_color','tags','notes',
  ];
  const fields: string[]   = [];
  const values: unknown[]  = [];
  let   idx = 1;

  for (const key of allowed) {
    if (key in req.body) {
      fields.push(`${key}=$${idx}`);
      values.push(req.body[key] ?? null);
      idx++;
    }
  }

  if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

  fields.push(`updated_at=now()`);
  values.push(req.params.id, orgId);

  const [row] = await query(
    `UPDATE contacts SET ${fields.join(', ')} WHERE id=$${idx} AND organization_id=$${idx + 1} RETURNING *`,
    values,
  );
  if (!row) return res.status(404).json({ error: 'Contacto no encontrado' });

  const actor = await queryOne<{ name: string }>('SELECT name FROM users WHERE id=$1', [actorId]);
  logActivity({ orgId, entityType: 'contact', entityId: req.params.id, actorId, actorName: actor?.name ?? null, eventType: 'contact_updated', meta: { name: row.first_name } }).catch(console.error);
  res.json(row);
});

// DELETE /:id
contactsRouter.delete('/:id', async (req, res) => {
  const row = await queryOne(
    'DELETE FROM contacts WHERE id=$1 AND organization_id=$2 RETURNING id',
    [req.params.id, req.auth!.organizationId],
  );
  if (!row) return res.status(404).json({ error: 'Contacto no encontrado' });
  res.status(204).end();
});
