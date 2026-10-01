// Vigila cada 5 min la conexión de los WhatsApp (Evolution API) y avisa si uno se cae (dos
// comprobaciones seguidas, para no saltar con reconexiones de segundos) y cuando vuelve:
// por Telegram al dueño de la agencia y en la campanita a los owner/admin de esa organización.
// Un aviso por caída y uno por reconexión; también sincroniza session_status (banner de la app).

import { pool } from '../db.ts';
import { evolutionFor } from './evolution.ts';
import { alert } from './alerts.ts';
import { broadcast } from './ws-manager.ts';

type State = 'open' | 'close' | 'connecting' | 'unreachable';
const last = new Map<string, { state: State; fails: number; alerted: boolean }>();

const DOWN_TITLE = 'WhatsApp desconectado';
const UP_TITLE = 'WhatsApp reconectado';

async function notifyAdmins(orgId: string, instanceId: string, title: string, body: string): Promise<void> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE organization_id = $1 AND role IN ('owner','admin')`, [orgId],
  );
  for (const u of rows) {
    await pool.query(
      `INSERT INTO notifications (organization_id, user_id, type, title, body, entity_type, entity_id)
       VALUES ($1, $2, 'system', $3, $4, 'wa_instance', $5)`,
      [orgId, u.id, title, body, instanceId],
    );
    broadcast(orgId, 'notification:new', { userId: u.id });
  }
}

async function setStatus(orgId: string, instanceId: string, status: string): Promise<void> {
  await pool.query('UPDATE wa_settings SET session_status = $1, updated_at = NOW() WHERE id = $2', [status, instanceId]);
  broadcast(orgId, 'wa:status', { status, instanceId });
}

// `onlyOrgId` limita la revisión a una organización (lo usan los tests).
export async function checkWhatsappConnections(onlyOrgId?: string): Promise<void> {
  const { rows } = await pool.query<{
    id: string; organization_id: string; org: string; display_name: string; instance_name: string;
    evo_url: string; evo_api_key: string; session_status: string;
  }>(
    `SELECT w.id, w.organization_id, o.name AS org, w.display_name, w.instance_name, w.evo_url, w.evo_api_key, w.session_status
     FROM wa_settings w JOIN organizations o ON o.id = w.organization_id
     WHERE $1::uuid IS NULL OR w.organization_id = $1`,
    [onlyOrgId ?? null],
  );
  for (const w of rows) {
    let state: State;
    try {
      const client = evolutionFor(w);
      if (!client) continue;
      state = (await client.getConnectionState()).instance.state;
    } catch {
      state = 'unreachable';
    }
    const name = `${w.org} · ${w.display_name} (instancia ${w.instance_name})`;
    let prev = last.get(w.id);
    if (!prev) {
      // Primera lectura (arranque): si el último aviso al cliente fue de caída, sigue caída hasta que vuelva
      const { rows: [n] } = await pool.query<{ title: string }>(
        `SELECT title FROM notifications WHERE entity_type = 'wa_instance' AND entity_id = $1
         ORDER BY created_at DESC LIMIT 1`, [w.id],
      );
      prev = n?.title === DOWN_TITLE ? { state: 'close', fails: 2, alerted: true } : { state, fails: 0, alerted: false };
      if (!prev.alerted) { last.set(w.id, prev); continue; }   // línea base
    }

    if (state === 'open') {
      if (w.session_status !== 'connected') await setStatus(w.organization_id, w.id, 'connected');
      if (prev.alerted) {
        alert('WhatsApp reconectado ✅', name);
        await notifyAdmins(w.organization_id, w.id, UP_TITLE,
          `«${w.display_name}» volvió a conectarse. Los mensajes y leads de WhatsApp vuelven a entrar al CRM.`);
      }
      last.set(w.id, { state, fails: 0, alerted: false });
      continue;
    }
    const fails = prev.state === 'open' || prev.fails > 0 ? prev.fails + 1 : 0;
    const shouldAlert = fails >= 2 && !prev.alerted;
    if (shouldAlert) {
      alert(state === 'unreachable' ? 'Evolution API no responde' : 'WhatsApp desconectado',
        `${name}\nEstado: ${state}. Los mensajes y leads de WhatsApp no están entrando. Reconecta en Configuración → WhatsApp.`);
      await notifyAdmins(w.organization_id, w.id, DOWN_TITLE,
        `«${w.display_name}» perdió la conexión: los mensajes y leads de WhatsApp no están entrando al CRM. ` +
        'Reconéctalo en Configuración → WhatsApp (escanea el QR de nuevo).');
      if (w.session_status !== 'disconnected' && w.session_status !== 'qr') await setStatus(w.organization_id, w.id, 'disconnected');
    }
    last.set(w.id, { state, fails, alerted: prev.alerted || shouldAlert });
  }
}
