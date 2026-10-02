// Cliente HTTP para Evolution API v2.
// Cada org tiene su propia instancia configurada en wa_settings.

import { fetchWithTimeout, externalTimeoutMs } from '../http.ts';

export interface EvoConfig {
  url: string;          // e.g. "http://localhost:8080"
  apiKey: string;       // clave global de Evolution API
  instanceName: string; // nombre de instancia, e.g. "crm"
}

export interface EvoMessageKey {
  remoteJid: string;
  fromMe: boolean;
  id: string;
}

export interface EvoSendResult {
  key: EvoMessageKey;
  status: string;
}

export interface EvoConnectionState {
  instance: { instanceName: string; state: 'open' | 'close' | 'connecting' };
}

export interface EvoQRResult {
  pairingCode: string | null;
  code: string;
  base64: string; // "data:image/png;base64,..."
}

// Respuesta no-2xx de Evolution: guarda el status y el cuerpo para distinguir errores definitivos
// (número sin WhatsApp) de los pasajeros (5xx, instancia caída). El mensaje se mantiene igual que antes.
export class EvolutionError extends Error {
  readonly status: number;
  readonly body: string;
  constructor(status: number, body: string) {
    super(`Evolution API ${status}: ${body}`);
    this.name = 'EvolutionError';
    this.status = status;
    this.body = body;
  }
}

// El número no tiene WhatsApp: Evolution responde 400 con {"response":{"message":[{"exists":false,...}]}}.
// Es el único error de envío que no tiene sentido reintentar.
export function isNotOnWhatsapp(err: unknown): boolean {
  return err instanceof EvolutionError && err.status === 400 && /"exists"\s*:\s*false/.test(err.body);
}

export class EvolutionClient {
  private base: string;
  private headers: Record<string, string>;
  readonly instanceName: string;

  constructor(cfg: EvoConfig) {
    this.base = cfg.url.replace(/\/$/, '');
    this.instanceName = cfg.instanceName;
    this.headers = {
      'Content-Type': 'application/json',
      'apikey': cfg.apiKey,
    };
  }

  private async req<T>(path: string, opts: RequestInit = {}, timeoutMs = externalTimeoutMs()): Promise<T> {
    const res = await fetchWithTimeout(`${this.base}${path}`, {
      ...opts,
      headers: { ...this.headers, ...(opts.headers as Record<string, string> ?? {}) },
    }, timeoutMs);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new EvolutionError(res.status, body);
    }
    return res.json() as Promise<T>;
  }

  // Crea la instancia si no existe; no falla si ya existe.
  async ensureInstance(): Promise<void> {
    const state = await this.getConnectionState().catch(() => null);
    if (state) return; // ya existe
    await this.req('/instance/create', {
      method: 'POST',
      body: JSON.stringify({ instanceName: this.instanceName, qrcode: true, integration: 'WHATSAPP-BAILEYS' }),
    }); // si falla aquí, el error debe propagarse para que el CRM lo reporte
  }

  async getConnectionState(): Promise<EvoConnectionState> {
    return this.req<EvoConnectionState>(`/instance/connectionState/${this.instanceName}`);
  }

  async getQR(): Promise<EvoQRResult> {
    return this.req<EvoQRResult>(`/instance/connect/${this.instanceName}`);
  }

  async logout(): Promise<void> {
    await this.req(`/instance/logout/${this.instanceName}`, { method: 'DELETE' }).catch(() => {});
  }

  async setWebhook(webhookUrl: string): Promise<void> {
    await this.req(`/webhook/set/${this.instanceName}`, {
      method: 'POST',
      body: JSON.stringify({
        webhook: {
          url: webhookUrl,
          enabled: true,
          events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE'],
        },
      }),
    });
  }

  async sendText(number: string, text: string): Promise<EvoSendResult> {
    return this.req<EvoSendResult>(`/message/sendText/${this.instanceName}`, {
      method: 'POST',
      body: JSON.stringify({ number, text }),
    });
  }

  async sendImage(number: string, media: string, caption?: string): Promise<EvoSendResult> {
    return this.req<EvoSendResult>(`/message/sendMedia/${this.instanceName}`, {
      method: 'POST',
      body: JSON.stringify({ number, mediatype: 'image', media, caption: caption ?? '' }),
    });
  }

  async requestPairingCode(number: string): Promise<{ pairingCode: string }> {
    return this.req<{ pairingCode: string }>(`/instance/pairingCode/${this.instanceName}`, {
      method: 'POST',
      body: JSON.stringify({ number }),
    });
  }

  // Descarga un archivo multimedia y devuelve base64+mime.
  async getMediaBase64(messageData: Record<string, unknown>): Promise<{ base64: string; mimetype: string } | null> {
    return this.req<{ base64: string; mimetype: string }>(
      `/message/getBase64FromMediaMessage/${this.instanceName}`,
      { method: 'POST', body: JSON.stringify({ message: messageData, convertToMp4: false }) },
      Math.max(externalTimeoutMs(), 30_000),   // la media puede pesar varios MB
    ).catch(() => null);
  }
}

// ── Conexión de cada instancia ──────────────────────────────────────────────
// Las instancias guardan su propia URL/API key solo si se configuraron a mano (p. ej. la de VFS);
// las demás usan el Evolution del servidor (EVOLUTION_URL / EVOLUTION_API_KEY). La API key de
// Evolution es la llave maestra de TODAS las instancias: nunca se pide ni se muestra al cliente.
export function resolveEvo(row: { evo_url?: string | null; evo_api_key?: string | null }): { url: string; apiKey: string } {
  const url = row.evo_url && !row.evo_url.includes('localhost:2785') ? row.evo_url : (process.env.EVOLUTION_URL ?? '');
  const apiKey = row.evo_api_key || process.env.EVOLUTION_API_KEY || '';
  return { url, apiKey };
}

export function evolutionFor(row: { evo_url?: string | null; evo_api_key?: string | null; instance_name: string }): EvolutionClient | null {
  const { url, apiKey } = resolveEvo(row);
  if (!url || !apiKey) return null;
  return new EvolutionClient({ url, apiKey, instanceName: row.instance_name });
}

// Nombre único de instancia para una organización (nunca se comparte entre clientes).
export function newInstanceName(orgId: string): string {
  return `rocco-${orgId.slice(0, 8)}-${Math.random().toString(16).slice(2, 8)}`;
}
