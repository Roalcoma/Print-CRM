// Gestión de la configuración de WhatsApp (Evolution API) por organización.

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
  session_status: string;
  webhook_secret: string;
  created_at: string;
  updated_at: string;
};

async function getOrCreate(orgId: string): Promise<Row> {
  const res = await pool.query<Row>(
    'SELECT * FROM wa_settings WHERE organization_id = $1',
    [orgId],
  );
  if (res.rows[0]) return res.rows[0];
  const ins = await pool.query<Row>(
    `INSERT INTO wa_settings (organization_id) VALUES ($1) RETURNING *`,
    [orgId],
  );
  return ins.rows[0];
}

function buildClient(row: Row): EvolutionClient {
  return new EvolutionClient({ url: row.evo_url, apiKey: row.evo_api_key, instanceName: row.instance_name });
}

// GET /api/wa/settings
waSettingsRouter.get('/settings', requireAdmin, async (req, res) => {
  try {
    const row = await getOrCreate(req.auth!.organizationId);
    const { evo_api_key: _, ...safe } = row;
    res.json({ ...safe, has_api_key: !!row.evo_api_key });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar configuración' });
  }
});

// PATCH /api/wa/settings
waSettingsRouter.patch('/settings', requireAdmin, async (req, res) => {
  try {
    const { evo_url, evo_api_key, instance_name } = req.body;
    const orgId = req.auth!.organizationId;
    await getOrCreate(orgId);

    const fields: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (evo_url !== undefined)       { fields.push(`evo_url = $${i++}`);       vals.push(evo_url); }
    if (evo_api_key !== undefined)   { fields.push(`evo_api_key = $${i++}`);   vals.push(evo_api_key); }
    if (instance_name !== undefined) { fields.push(`instance_name = $${i++}`); vals.push(instance_name); }
    if (!fields.length) return res.status(400).json({ error: 'Nada que actualizar' });

    fields.push(`updated_at = NOW()`);
    vals.push(orgId);
    await pool.query(`UPDATE wa_settings SET ${fields.join(', ')} WHERE organization_id = $${i}`, vals);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al guardar configuración' });
  }
});

// POST /api/wa/connect — crea (si no existe) la instancia y registra el webhook
waSettingsRouter.post('/connect', requireAdmin, async (req, res) => {
  try {
    const orgId = req.auth!.organizationId;
    const row = await getOrCreate(orgId);
    if (!row.evo_api_key) return res.status(400).json({ error: 'Configura la API key primero' });

    const client = buildClient(row);
    await client.ensureInstance();

    const webhookUrl = `${env.publicUrl}/api/wa/webhook/${row.webhook_secret}`;
    await client.setWebhook(webhookUrl).catch(e => console.warn('Webhook register:', e));

    // Disparar generación de QR en Evolution API (/instance/connect/:name)
    await client.getQR().catch(e => console.warn('QR trigger:', e));

    await pool.query(
      `UPDATE wa_settings SET session_status = 'qr', updated_at = NOW() WHERE organization_id = $1`,
      [orgId],
    );
    broadcast(orgId, 'wa:status', { status: 'qr' });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al conectar' });
  }
});

// POST /api/wa/disconnect — cierra la sesión de WhatsApp (logout)
waSettingsRouter.post('/disconnect', requireAdmin, async (req, res) => {
  try {
    const orgId = req.auth!.organizationId;
    const row = await getOrCreate(orgId);
    await buildClient(row).logout();

    await pool.query(
      `UPDATE wa_settings SET session_status = 'disconnected', updated_at = NOW() WHERE organization_id = $1`,
      [orgId],
    );
    broadcast(orgId, 'wa:status', { status: 'disconnected' });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al desconectar' });
  }
});

// GET /api/wa/qr
waSettingsRouter.get('/qr', requireAdmin, async (req, res) => {
  try {
    const row = await getOrCreate(req.auth!.organizationId);
    const data = await buildClient(row).getQR();
    // Devolver base64 como "qr" para compatibilidad con el frontend
    res.json({ qr: data.base64, pairingCode: data.pairingCode });
  } catch (e) {
    console.error(e);
    res.status(503).json({ error: 'QR no disponible' });
  }
});

// POST /api/wa/pairing-code
waSettingsRouter.post('/pairing-code', requireAdmin, async (req, res) => {
  try {
    const { phoneNumber } = req.body as { phoneNumber?: string };
    if (!phoneNumber || !/^[0-9]{6,15}$/.test(phoneNumber)) {
      return res.status(400).json({ error: 'Número inválido. Solo dígitos en formato internacional, ej: 584141234567' });
    }
    const row = await getOrCreate(req.auth!.organizationId);
    const result = await buildClient(row).requestPairingCode(phoneNumber);
    res.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error al solicitar código';
    console.error(e);
    res.status(503).json({ error: msg });
  }
});

// GET /api/wa/status
waSettingsRouter.get('/status', async (req, res) => {
  try {
    const row = await getOrCreate(req.auth!.organizationId);
    res.json({ status: row.session_status });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al obtener estado' });
  }
});

// POST /api/wa/sync — consulta el estado real en Evolution API y actualiza la DB
waSettingsRouter.post('/sync', requireAdmin, async (req, res) => {
  try {
    const orgId = req.auth!.organizationId;
    const row = await getOrCreate(orgId);
    if (!row.evo_url || !row.evo_api_key) return res.json({ status: row.session_status });

    const remote = await buildClient(row).getConnectionState().catch(() => null);
    if (!remote) return res.json({ status: row.session_status });

    const stateMap: Record<string, string> = { open: 'connected', close: 'disconnected', connecting: 'connecting' };
    const status = stateMap[remote.instance.state] ?? 'disconnected';

    if (status !== row.session_status) {
      await pool.query(
        `UPDATE wa_settings SET session_status = $1, updated_at = NOW() WHERE organization_id = $2`,
        [status, orgId],
      );
      broadcast(orgId, 'wa:status', { status });
    }
    res.json({ status });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al sincronizar estado' });
  }
});
