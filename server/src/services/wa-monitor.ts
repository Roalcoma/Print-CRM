// Vigila cada 5 min la conexión de los WhatsApp (Evolution API) y avisa por Telegram si uno
// se cae (dos comprobaciones seguidas, para no saltar con reconexiones de segundos) y cuando vuelve.

import { pool } from '../db.ts';
import { evolutionFor } from './evolution.ts';
import { alert } from './alerts.ts';

type State = 'open' | 'close' | 'connecting' | 'unreachable';
const last = new Map<string, { state: State; fails: number; alerted: boolean }>();

export async function checkWhatsappConnections(): Promise<void> {
  const { rows } = await pool.query<{ id: string; org: string; display_name: string; instance_name: string; evo_url: string; evo_api_key: string }>(
    `SELECT w.id, o.name AS org, w.display_name, w.instance_name, w.evo_url, w.evo_api_key
     FROM wa_settings w JOIN organizations o ON o.id = w.organization_id`,
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
    const prev = last.get(w.id);
    const name = `${w.org} · ${w.display_name} (instancia ${w.instance_name})`;
    if (!prev) { last.set(w.id, { state, fails: 0, alerted: false }); continue; } // primera lectura: línea base

    if (state === 'open') {
      if (prev.alerted) alert('WhatsApp reconectado ✅', name);
      last.set(w.id, { state, fails: 0, alerted: false });
      continue;
    }
    const fails = prev.state === 'open' || prev.fails > 0 ? prev.fails + 1 : 0;
    const shouldAlert = fails >= 2 && !prev.alerted;
    if (shouldAlert) {
      alert(state === 'unreachable' ? 'Evolution API no responde' : 'WhatsApp desconectado',
        `${name}\nEstado: ${state}. Los mensajes y leads de WhatsApp no están entrando. Reconecta en Configuración → WhatsApp.`);
    }
    last.set(w.id, { state, fails, alerted: prev.alerted || shouldAlert });
  }
}
