// Gestión de instancias WhatsApp (Evolution API) por organización.
// Soporta hasta 2 instancias por CRM. La config interna (evo_url, api_key)
// se gestiona vía /wa/api-config y no se expone en la UI de cliente.

import { Router } from 'express';
import { pool } from '../db.ts';
import { requireAdmin } from '../auth/perms.ts';
import { EvolutionClient } from '../services/evolution.ts';
import { env } from '../env.ts';
import { broadcast } from '../services/ws-manager.ts';

export const waSettingsRouter = Router();

type Row = {
  id: string;
  organization_id: string;
  evo_url: string;
  evo_api_key: string;
  instance_name: string;
  display_name: string;
  is_default: boolean;
  session_status: string;
  webhook_secret: string;
  created_at: string;
  updated_at: string;
};

function safeInstance(r: Row) {
  return {
    id: r.id,
    display_name: r.display_name,
    session_status: r.session_status,
    is_default: r.is_default,
    instance_name: r.instance_name,
    created_at: r.created_at,
  };
}

async function getInstance(id: string, orgId: string): Promise<Row | null> {
  const res = await pool.query<Row>(
    'SELECT * FROM wa_settings WHERE id = $1 AND organization_id = $2',
    [id, orgId],
  );
  return res.rows[0] ?? null;
}

function buildClient(row: Row): EvolutionClient {
  return new EvolutionClient({ url: row.evo_url, apiKey: row.evo_api_key, instanceName: row.instance_name });
}

// ─── Lista de instancias ────────────────────────────────────────────────────
// GET /wa/instances
waSettingsRouter.get('/instances', requireAdmin, async (req, res) => {
  try {
    const orgId = req.auth!.organizationId;
    const rows = await pool.query<Row>(
      'SELECT * FROM wa_settings WHERE organization_id = $1 ORDER BY created_at',
      [orgId],
    );
    if (!rows.rows.length) {
      const newRow = await pool.query<Row>(
        `INSERT INTO wa_settings (organization_id, display_name, is_default) VALUES ($1, 'WhatsApp #1', true) RETURNING *`,
        [orgId],
      );
      return res.json({ instances: [safeInstance(newRow.rows[0])] });
    }
    res.json({ instances: rows.rows.map(safeInstance) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar instancias' });
  }
});

// POST /wa/instances — crear nueva instancia (máx 2)
waSettingsRouter.post('/instances', requireAdmin, async (req, res) => {
  try {
    const orgId = req.auth!.organizationId;
    const countRes = await pool.query<{ c: string }>(
      'SELECT COUNT(*) as c FROM wa_settings WHERE organization_id = $1',
      [orgId],
    );
    if (parseInt(countRes.rows[0].c) >= 2) {
      return res.status(400).json({ error: 'Máximo 2 instancias por organización' });
    }
    const existing = await pool.query<Row>(
      'SELECT * FROM wa_settings WHERE organization_id = $1 ORDER BY created_at LIMIT 1',
      [orgId],
    );
    const evo_url    = existing.rows[0]?.evo_url    ?? 'http://localhost:8080';
    const evo_api_key = existing.rows[0]?.evo_api_key ?? '';
    const baseInstance = existing.rows[0]?.instance_name ?? 'crm';
    const instance_name = `${baseInstance}-2`;
    const display_name  = (req.body.display_name as string | undefined) ?? 'WhatsApp #2';

    const newRow = await pool.query<Row>(
      `INSERT INTO wa_settings (organization_id, evo_url, evo_api_key, instance_name, display_name, is_default)
       VALUES ($1, $2, $3, $4, $5, false) RETURNING *`,
      [orgId, evo_url, evo_api_key, instance_name, display_name],
    );
    res.json({ instance: safeInstance(newRow.rows[0]) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al crear instancia' });
  }
});

// DELETE /wa/instances/:id
waSettingsRouter.delete('/instances/:id', requireAdmin, async (req, res) => {
  try {
    const orgId = req.auth!.organizationId;
    const { id } = req.params;
    const countRes = await pool.query<{ c: string }>(
      'SELECT COUNT(*) as c FROM wa_settings WHERE organization_id = $1',
      [orgId],
    );
    if (parseInt(countRes.rows[0].c) <= 1) {
      return res.status(400).json({ error: 'No puedes eliminar la única instancia' });
    }
    const row = await getInstance(id, orgId);
    if (!row) return res.status(404).json({ error: 'Instancia no encontrada' });
    if (row.evo_api_key && row.session_status !== 'disconnected') {
      await buildClient(row).logout().catch(() => {});
    }
    await pool.query('DELETE FROM wa_settings WHERE id = $1', [id]);
    if (row.is_default) {
      await pool.query(
        'UPDATE wa_settings SET is_default = true WHERE organization_id = $1 ORDER BY created_at LIMIT 1',
        [orgId],
      );
    }
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al eliminar instancia' });
  }
});

// POST /wa/instances/:id/default — marcar como predeterminada
waSettingsRouter.post('/instances/:id/default', requireAdmin, async (req, res) => {
  try {
    const orgId = req.auth!.organizationId;
    const { id } = req.params;
    const row = await getInstance(id, orgId);
    if (!row) return res.status(404).json({ error: 'Instancia no encontrada' });
    await pool.query('UPDATE wa_settings SET is_default = false WHERE organization_id = $1', [orgId]);
    await pool.query('UPDATE wa_settings SET is_default = true WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al actualizar predeterminada' });
  }
});

// POST /wa/instances/:id/connect
waSettingsRouter.post('/instances/:id/connect', requireAdmin, async (req, res) => {
  try {
    const orgId = req.auth!.organizationId;
    const { id } = req.params;
    const row = await getInstance(id, orgId);
    if (!row) return res.status(404).json({ error: 'Instancia no encontrada' });
    if (!row.evo_api_key) return res.status(400).json({ error: 'Configura la API key primero' });

    const client = buildClient(row);
    await client.ensureInstance();
    const webhookUrl = `${env.publicUrl}/api/wa/webhook/${row.webhook_secret}`;
    await client.setWebhook(webhookUrl).catch(e => console.warn('Webhook:', e));
    await client.getQR().catch(e => console.warn('QR trigger:', e));

    await pool.query(
      `UPDATE wa_settings SET session_status = 'qr', updated_at = NOW() WHERE id = $1`,
      [id],
    );
    broadcast(orgId, 'wa:status', { status: 'qr', instanceId: id });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al conectar' });
  }
});

// POST /wa/instances/:id/disconnect
waSettingsRouter.post('/instances/:id/disconnect', requireAdmin, async (req, res) => {
  try {
    const orgId = req.auth!.organizationId;
    const { id } = req.params;
    const row = await getInstance(id, orgId);
    if (!row) return res.status(404).json({ error: 'Instancia no encontrada' });
    await buildClient(row).logout();
    await pool.query(
      `UPDATE wa_settings SET session_status = 'disconnected', updated_at = NOW() WHERE id = $1`,
      [id],
    );
    broadcast(orgId, 'wa:status', { status: 'disconnected', instanceId: id });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al desconectar' });
  }
});

// GET /wa/instances/:id/qr
waSettingsRouter.get('/instances/:id/qr', requireAdmin, async (req, res) => {
  try {
    const row = await getInstance(req.params.id, req.auth!.organizationId);
    if (!row) return res.status(404).json({ error: 'Instancia no encontrada' });
    const data = await buildClient(row).getQR();
    res.json({ qr: data.base64, pairingCode: data.pairingCode });
  } catch (e) {
    console.error(e);
    res.status(503).json({ error: 'QR no disponible' });
  }
});

// POST /wa/instances/:id/pairing-code
waSettingsRouter.post('/instances/:id/pairing-code', requireAdmin, async (req, res) => {
  try {
    const { phoneNumber } = req.body as { phoneNumber?: string };
    if (!phoneNumber || !/^[0-9]{6,15}$/.test(phoneNumber)) {
      return res.status(400).json({ error: 'Número inválido. Solo dígitos en formato internacional, ej: 584141234567' });
    }
    const row = await getInstance(req.params.id, req.auth!.organizationId);
    if (!row) return res.status(404).json({ error: 'Instancia no encontrada' });
    const result = await buildClient(row).requestPairingCode(phoneNumber);
    res.json(result);
  } catch (e: unknown) {
    console.error(e);
    res.status(503).json({ error: e instanceof Error ? e.message : 'Error al solicitar código' });
  }
});

// POST /wa/instances/:id/sync
waSettingsRouter.post('/instances/:id/sync', requireAdmin, async (req, res) => {
  try {
    const orgId = req.auth!.organizationId;
    const { id } = req.params;
    const row = await getInstance(id, orgId);
    if (!row) return res.status(404).json({ error: 'Instancia no encontrada' });
    if (!row.evo_url || !row.evo_api_key) return res.json({ status: row.session_status });

    const remote = await buildClient(row).getConnectionState().catch(() => null);
    if (!remote) return res.json({ status: row.session_status });

    const stateMap: Record<string, string> = { open: 'connected', close: 'disconnected', connecting: 'connecting' };
    const status = stateMap[remote.instance.state] ?? 'disconnected';

    if (status !== row.session_status) {
      await pool.query(
        `UPDATE wa_settings SET session_status = $1, updated_at = NOW() WHERE id = $2`,
        [status, id],
      );
      broadcast(orgId, 'wa:status', { status, instanceId: id });
    }
    res.json({ status });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al sincronizar' });
  }
});

// ─── Config interna de Evolution API (agencia/admin) ───────────────────────
// GET /wa/api-config
waSettingsRouter.get('/api-config', requireAdmin, async (req, res) => {
  try {
    const row = await pool.query<Row>(
      'SELECT * FROM wa_settings WHERE organization_id = $1 ORDER BY created_at LIMIT 1',
      [req.auth!.organizationId],
    );
    if (!row.rows[0]) return res.json({ evo_url: 'http://localhost:8080', has_api_key: false });
    res.json({ evo_url: row.rows[0].evo_url, has_api_key: !!row.rows[0].evo_api_key });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar config' });
  }
});

// PATCH /wa/api-config — actualiza evo_url y api_key en TODAS las instancias del org
waSettingsRouter.patch('/api-config', requireAdmin, async (req, res) => {
  try {
    const { evo_url, evo_api_key } = req.body as { evo_url?: string; evo_api_key?: string };
    const orgId = req.auth!.organizationId;
    const fields: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (evo_url !== undefined)     { fields.push(`evo_url = $${i++}`);     vals.push(evo_url); }
    if (evo_api_key !== undefined) { fields.push(`evo_api_key = $${i++}`); vals.push(evo_api_key); }
    if (!fields.length) return res.status(400).json({ error: 'Nada que actualizar' });
    fields.push(`updated_at = NOW()`);
    vals.push(orgId);
    await pool.query(
      `UPDATE wa_settings SET ${fields.join(', ')} WHERE organization_id = $${i}`,
      vals,
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al guardar config' });
  }
});

// ─── Rutas legacy (backward compat) — operan sobre la instancia default ────
async function getDefaultOrCreate(orgId: string): Promise<Row> {
  // Buscar la predeterminada, o la primera, o crear una nueva
  const res = await pool.query<Row>(
    'SELECT * FROM wa_settings WHERE organization_id = $1 ORDER BY is_default DESC, created_at LIMIT 1',
    [orgId],
  );
  if (res.rows[0]) return res.rows[0];
  const ins = await pool.query<Row>(
    `INSERT INTO wa_settings (organization_id, display_name, is_default) VALUES ($1, 'WhatsApp #1', true) RETURNING *`,
    [orgId],
  );
  return ins.rows[0];
}

waSettingsRouter.get('/settings', requireAdmin, async (req, res) => {
  try {
    const row = await getDefaultOrCreate(req.auth!.organizationId);
    const { evo_api_key: _, ...safe } = row;
    res.json({ ...safe, has_api_key: !!row.evo_api_key });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar configuración' });
  }
});

waSettingsRouter.patch('/settings', requireAdmin, async (req, res) => {
  try {
    const { evo_url, evo_api_key, instance_name } = req.body as Record<string, string | undefined>;
    const orgId = req.auth!.organizationId;
    await getDefaultOrCreate(orgId);
    const fields: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (evo_url !== undefined)       { fields.push(`evo_url = $${i++}`);       vals.push(evo_url); }
    if (evo_api_key !== undefined)   { fields.push(`evo_api_key = $${i++}`);   vals.push(evo_api_key); }
    if (instance_name !== undefined) { fields.push(`instance_name = $${i++}`); vals.push(instance_name); }
    if (!fields.length) return res.status(400).json({ error: 'Nada que actualizar' });
    fields.push(`updated_at = NOW()`);
    vals.push(orgId);
    // Legacy: actualiza la primera instancia del org
    await pool.query(
      `UPDATE wa_settings SET ${fields.join(', ')} WHERE id = (
         SELECT id FROM wa_settings WHERE organization_id = $${i} ORDER BY is_default DESC, created_at LIMIT 1
       )`,
      vals,
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al guardar configuración' });
  }
});

waSettingsRouter.post('/connect', requireAdmin, async (req, res) => {
  try {
    const orgId = req.auth!.organizationId;
    const row = await getDefaultOrCreate(orgId);
    if (!row.evo_api_key) return res.status(400).json({ error: 'Configura la API key primero' });
    const client = buildClient(row);
    await client.ensureInstance();
    const webhookUrl = `${env.publicUrl}/api/wa/webhook/${row.webhook_secret}`;
    await client.setWebhook(webhookUrl).catch(e => console.warn('Webhook register:', e));
    await client.getQR().catch(e => console.warn('QR trigger:', e));
    await pool.query(
      `UPDATE wa_settings SET session_status = 'qr', updated_at = NOW() WHERE id = $1`,
      [row.id],
    );
    broadcast(orgId, 'wa:status', { status: 'qr', instanceId: row.id });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al conectar' });
  }
});

waSettingsRouter.post('/disconnect', requireAdmin, async (req, res) => {
  try {
    const orgId = req.auth!.organizationId;
    const row = await getDefaultOrCreate(orgId);
    await buildClient(row).logout();
    await pool.query(
      `UPDATE wa_settings SET session_status = 'disconnected', updated_at = NOW() WHERE id = $1`,
      [row.id],
    );
    broadcast(orgId, 'wa:status', { status: 'disconnected', instanceId: row.id });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al desconectar' });
  }
});

waSettingsRouter.get('/qr', requireAdmin, async (req, res) => {
  try {
    const row = await getDefaultOrCreate(req.auth!.organizationId);
    const data = await buildClient(row).getQR();
    res.json({ qr: data.base64, pairingCode: data.pairingCode });
  } catch (e) {
    console.error(e);
    res.status(503).json({ error: 'QR no disponible' });
  }
});

waSettingsRouter.post('/pairing-code', requireAdmin, async (req, res) => {
  try {
    const { phoneNumber } = req.body as { phoneNumber?: string };
    if (!phoneNumber || !/^[0-9]{6,15}$/.test(phoneNumber)) {
      return res.status(400).json({ error: 'Número inválido. Solo dígitos en formato internacional, ej: 584141234567' });
    }
    const row = await getDefaultOrCreate(req.auth!.organizationId);
    const result = await buildClient(row).requestPairingCode(phoneNumber);
    res.json(result);
  } catch (e: unknown) {
    console.error(e);
    res.status(503).json({ error: e instanceof Error ? e.message : 'Error al solicitar código' });
  }
});

waSettingsRouter.get('/status', async (req, res) => {
  try {
    const row = await getDefaultOrCreate(req.auth!.organizationId);
    res.json({ status: row.session_status });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al obtener estado' });
  }
});

waSettingsRouter.post('/sync', requireAdmin, async (req, res) => {
  try {
    const orgId = req.auth!.organizationId;
    const row = await getDefaultOrCreate(orgId);
    if (!row.evo_url || !row.evo_api_key) return res.json({ status: row.session_status });
    const remote = await buildClient(row).getConnectionState().catch(() => null);
    if (!remote) return res.json({ status: row.session_status });
    const stateMap: Record<string, string> = { open: 'connected', close: 'disconnected', connecting: 'connecting' };
    const status = stateMap[remote.instance.state] ?? 'disconnected';
    if (status !== row.session_status) {
      await pool.query(
        `UPDATE wa_settings SET session_status = $1, updated_at = NOW() WHERE id = $2`,
        [status, row.id],
      );
      broadcast(orgId, 'wa:status', { status, instanceId: row.id });
    }
    res.json({ status });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al sincronizar estado' });
  }
});
