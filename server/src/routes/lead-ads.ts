// Gestión de configuraciones de Facebook Lead Ads.
// Los leads entrantes se procesan en el webhook de Meta (social.ts → handleLeadgen).

import { Router } from 'express';
import { pool } from '../db.ts';
import { requireAdmin } from '../auth/perms.ts';

export const leadAdsRouter = Router();

const META_BASE = 'https://graph.facebook.com/v19.0';

// GET /lead-ads/forms/:connectionId
// Lista los formularios Lead Ads disponibles en la página de Facebook conectada.
leadAdsRouter.get('/forms/:connectionId', requireAdmin, async (req, res) => {
  try {
    const orgId = req.auth!.organizationId;
    const { connectionId } = req.params;

    const connRes = await pool.query<{ page_id: string; access_token: string }>(
      `SELECT page_id, access_token FROM social_connections
       WHERE id = $1 AND organization_id = $2 AND platform = 'facebook' AND status = 'active'`,
      [connectionId, orgId],
    );
    if (!connRes.rows[0]) return res.status(404).json({ error: 'Conexión no encontrada' });

    const { page_id, access_token } = connRes.rows[0];
    const metaRes = await fetch(
      `${META_BASE}/${page_id}/leadgen_forms?fields=id,name,status,leads_count&access_token=${access_token}`,
    );
    const json = await metaRes.json() as { data?: Array<{ id: string; name: string; status: string; leads_count?: number }>; error?: { message: string } };

    if (json.error) return res.status(502).json({ error: json.error.message });
    res.json({ forms: json.data ?? [] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al obtener formularios' });
  }
});

// GET /lead-ads/configs
// Lista las configuraciones de formularios de la organización.
leadAdsRouter.get('/configs', requireAdmin, async (req, res) => {
  try {
    const orgId = req.auth!.organizationId;
    const { rows } = await pool.query(
      `SELECT lfc.*, sc.page_name, p.name AS pipeline_name, s.name AS stage_name
       FROM lead_form_configs lfc
       LEFT JOIN social_connections sc ON sc.id = lfc.social_connection_id
       LEFT JOIN pipelines p ON p.id = lfc.pipeline_id
       LEFT JOIN pipeline_stages s ON s.id = lfc.stage_id
       WHERE lfc.organization_id = $1
       ORDER BY lfc.created_at DESC`,
      [orgId],
    );
    res.json({ configs: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar configuraciones' });
  }
});

// POST /lead-ads/configs
// Crea o actualiza la configuración de un formulario (upsert por form_id).
leadAdsRouter.post('/configs', requireAdmin, async (req, res) => {
  try {
    const orgId = req.auth!.organizationId;
    const {
      social_connection_id,
      form_id,
      form_name,
      pipeline_id,
      stage_id,
      field_map,
      auto_create_contact,
      auto_create_opportunity,
    } = req.body as {
      social_connection_id: string;
      form_id: string;
      form_name: string;
      pipeline_id: string | null;
      stage_id: string | null;
      field_map: Record<string, string>;
      auto_create_contact: boolean;
      auto_create_opportunity: boolean;
    };

    if (!social_connection_id || !form_id) {
      return res.status(400).json({ error: 'social_connection_id y form_id son requeridos' });
    }

    // Verificar que la conexión pertenece a la org
    const connCheck = await pool.query(
      `SELECT id FROM social_connections WHERE id = $1 AND organization_id = $2 AND platform = 'facebook'`,
      [social_connection_id, orgId],
    );
    if (!connCheck.rows[0]) return res.status(404).json({ error: 'Conexión no encontrada' });

    const { rows } = await pool.query(
      `INSERT INTO lead_form_configs
         (organization_id, social_connection_id, form_id, form_name, pipeline_id, stage_id,
          field_map, auto_create_contact, auto_create_opportunity)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (organization_id, form_id) DO UPDATE SET
         social_connection_id   = EXCLUDED.social_connection_id,
         form_name              = EXCLUDED.form_name,
         pipeline_id            = EXCLUDED.pipeline_id,
         stage_id               = EXCLUDED.stage_id,
         field_map              = EXCLUDED.field_map,
         auto_create_contact    = EXCLUDED.auto_create_contact,
         auto_create_opportunity = EXCLUDED.auto_create_opportunity,
         updated_at             = NOW()
       RETURNING *`,
      [orgId, social_connection_id, form_id, form_name ?? '', pipeline_id ?? null, stage_id ?? null,
       JSON.stringify(field_map ?? {}), auto_create_contact ?? true, auto_create_opportunity ?? true],
    );
    res.json({ config: rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al guardar configuración' });
  }
});

// DELETE /lead-ads/configs/:id
leadAdsRouter.delete('/configs/:id', requireAdmin, async (req, res) => {
  try {
    const orgId = req.auth!.organizationId;
    const result = await pool.query(
      `DELETE FROM lead_form_configs WHERE id = $1 AND organization_id = $2`,
      [req.params.id, orgId],
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Configuración no encontrada' });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al eliminar configuración' });
  }
});
