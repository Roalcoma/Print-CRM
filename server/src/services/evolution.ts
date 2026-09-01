// Cliente HTTP para Evolution API v2.
// Cada org tiene su propia instancia configurada en wa_settings.

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

  private async req<T>(path: string, opts: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      ...opts,
      headers: { ...this.headers, ...(opts.headers as Record<string, string> ?? {}) },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Evolution API ${res.status}: ${body}`);
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
    ).catch(() => null);
  }
}
