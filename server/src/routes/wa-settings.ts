// Gestión de instancias WhatsApp (Evolution API) por organización.
// Soporta hasta 2 instancias por CRM. Cada instancia tiene un nombre único (nunca compartido
// entre clientes) y usa el Evolution del servidor: el cliente solo conecta y escanea el QR.
// La URL y la API key de Evolution (llave maestra de todas las instancias) no se exponen ni se editan.

import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.ts';
import { requireAdmin } from '../auth/perms.ts';
import { EvolutionClient, evolutionFor, newInstanceName } from '../services/evolution.ts';
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
  const client = evolutionFor(row);
  if (!client) throw new Error('Evolution API no configurado en el servidor (EVOLUTION_URL / EVOLUTION_API_KEY)');
  return client;
}

// Crea la instancia de una organización con un nombre propio.
async function createInstanceRow(orgId: string, displayName: string, isDefault: boolean): Promise<Row> {
  const r = await pool.query<Row>(
    `INSERT INTO wa_settings (organization_id, evo_url, evo_api_key, instance_name, display_name, is_default)
     VALUES ($1, '', '', $2, $3, $4) RETURNING *`,
    [orgId, newInstanceName(orgId), displayName, isDefault],
  );
  return r.rows[0];
}

// Segunda barrera: nunca operar una instancia de Evolution que otra organización también tenga.
async function sharedWithOtherOrg(row: Row): Promise<boolean> {
  const r = await pool.query(
    'SELECT 1 FROM wa_settings WHERE instance_name = $1 AND organization_id <> $2 LIMIT 1',
    [row.instance_name, row.organization_id],
  );
  return (r.rowCount ?? 0) > 0;
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
      if (req.query.nocreate) return res.json({ instances: [], in_use: false });   // banner: solo consulta
      const newRow = await createInstanceRow(orgId, 'WhatsApp #1', true);
      return res.json({ instances: [safeInstance(newRow)], in_use: false });
    }
    // in_use: la organización ya recibió/envió por WhatsApp (el banner de "desconectado" solo
    // tiene sentido si usan WhatsApp; a quien nunca lo conectó no se le insiste).
    const used = await pool.query(
      `SELECT 1 FROM conversations WHERE organization_id = $1 AND channel = 'whatsapp' LIMIT 1`, [orgId],
    );
    res.json({ instances: rows.rows.map(safeInstance), in_use: (used.rowCount ?? 0) > 0 });
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
    const display_name = String(req.body.display_name ?? '').trim().slice(0, 40) || 'WhatsApp #2';
    const newRow = await createInstanceRow(orgId, display_name, false);
    res.json({ instance: safeInstance(newRow) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al crear instancia' });
  }
});

// DELETE /wa/instances/:id
waSettingsRouter.delete('/instances/:id', requireAdmin, async (req, res) => {
  try {
    const orgId = req.auth!.organizationId;
    const id = String(req.params.id);
    const countRes = await pool.query<{ c: string }>(
      'SELECT COUNT(*) as c FROM wa_settings WHERE organization_id = $1',
      [orgId],
    );
    if (parseInt(countRes.rows[0].c) <= 1) {
      return res.status(400).json({ error: 'No puedes eliminar la única instancia' });
    }
    const row = await getInstance(id, orgId);
    if (!row) return res.status(404).json({ error: 'Instancia no encontrada' });
    if (row.session_status !== 'disconnected' && !(await sharedWithOtherOrg(row))) {
      await evolutionFor(row)?.logout().catch(() => {});
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

// PATCH /wa/instances/:id — renombrar. SOLO cambia display_name (la etiqueta visible);
// instance_name, evo_url y evo_api_key no se tocan nunca desde aquí (ver PATCH /settings).
const renameSchema = z.object({ display_name: z.string().trim().min(1).max(40) }).strict();
waSettingsRouter.patch('/instances/:id', requireAdmin, async (req, res) => {
  try {
    const parsed = renameSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Solo se puede cambiar el nombre (de 1 a 40 caracteres)' });
    const id = String(req.params.id);
    if (!z.string().uuid().safeParse(id).success) return res.status(404).json({ error: 'Instancia no encontrada' });
    const r = await pool.query<Row>(
      `UPDATE wa_settings SET display_name = $1, updated_at = NOW()
       WHERE id = $2 AND organization_id = $3 RETURNING *`,
      [parsed.data.display_name, id, req.auth!.organizationId],
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Instancia no encontrada' });
    res.json({ instance: safeInstance(r.rows[0]) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al renombrar instancia' });
  }
});

// POST /wa/instances/:id/default — marcar como predeterminada
waSettingsRouter.post('/instances/:id/default', requireAdmin, async (req, res) => {
  try {
    const orgId = req.auth!.organizationId;
    const id = String(req.params.id);
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
    const id = String(req.params.id);
    const row = await getInstance(id, orgId);
    if (!row) return res.status(404).json({ error: 'Instancia no encontrada' });
    if (await sharedWithOtherOrg(row)) return res.status(409).json({ error: 'Esta instancia de WhatsApp está asignada a otra cuenta. Contacta a soporte.' });

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
    const id = String(req.params.id);
    const row = await getInstance(id, orgId);
    if (!row) return res.status(404).json({ error: 'Instancia no encontrada' });
    if (await sharedWithOtherOrg(row)) return res.status(409).json({ error: 'Esta instancia de WhatsApp está asignada a otra cuenta. Contacta a soporte.' });
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
    const row = await getInstance(String(req.params.id), req.auth!.organizationId);
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
    const row = await getInstance(String(req.params.id), req.auth!.organizationId);
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
    const id = String(req.params.id);
    const row = await getInstance(id, orgId);
    if (!row) return res.status(404).json({ error: 'Instancia no encontrada' });
    const remote = await evolutionFor(row)?.getConnectionState().catch(() => null);
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
    res.json({ managed: true, configured: !!(row.rows[0] && evolutionFor(row.rows[0])) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar config' });
  }
});

// PATCH /wa/api-config y /wa/settings — ya no se pueden editar: cambiar el nombre de instancia,
// la URL o la API key permitiría a un cliente tomar el WhatsApp de otro.
waSettingsRouter.patch('/api-config', requireAdmin, (_req, res) => {
  res.status(403).json({ error: 'La conexión con WhatsApp la gestiona Rocco: solo tienes que conectar y escanear el QR.' });
});

// ─── Rutas legacy (backward compat) — operan sobre la instancia default ────
async function getDefaultOrCreate(orgId: string): Promise<Row> {
  // Buscar la predeterminada, o la primera, o crear una nueva
  const res = await pool.query<Row>(
    'SELECT * FROM wa_settings WHERE organization_id = $1 ORDER BY is_default DESC, created_at LIMIT 1',
    [orgId],
  );
  if (res.rows[0]) return res.rows[0];
  return createInstanceRow(orgId, 'WhatsApp #1', true);
}

waSettingsRouter.get('/settings', requireAdmin, async (req, res) => {
  try {
    const row = await getDefaultOrCreate(req.auth!.organizationId);
    res.json({ ...safeInstance(row), configured: !!evolutionFor(row) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al cargar configuración' });
  }
});

waSettingsRouter.patch('/settings', requireAdmin, (_req, res) => {
  res.status(403).json({ error: 'La conexión con WhatsApp la gestiona Rocco: solo tienes que conectar y escanear el QR.' });
});

waSettingsRouter.post('/connect', requireAdmin, async (req, res) => {
  try {
    const orgId = req.auth!.organizationId;
    const row = await getDefaultOrCreate(orgId);
    if (await sharedWithOtherOrg(row)) return res.status(409).json({ error: 'Esta instancia de WhatsApp está asignada a otra cuenta. Contacta a soporte.' });
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
    if (await sharedWithOtherOrg(row)) return res.status(409).json({ error: 'Esta instancia de WhatsApp está asignada a otra cuenta. Contacta a soporte.' });
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
    const remote = await evolutionFor(row)?.getConnectionState().catch(() => null);
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
