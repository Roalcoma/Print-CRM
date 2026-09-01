// Gestiona las conexiones WebSocket del CRM, agrupadas por organización.
// El frontend se conecta con: ws://host/ws?token=<jwt>

import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { Server } from 'http';
import { verifyToken } from '../auth/tokens.ts';

interface WSClient {
  ws: WebSocket;
  organizationId: string;
  userId: string;
}

const clients: Set<WSClient> = new Set();

export function initWS(httpServer: Server) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url ?? '', 'http://localhost');
    const token = url.searchParams.get('token');
    if (!token) { ws.close(4001, 'Sin token'); return; }

    let claims: { userId: string; organizationId: string };
    try {
      claims = verifyToken(token);
    } catch {
      ws.close(4001, 'Token inválido');
      return;
    }

    const client: WSClient = { ws, organizationId: claims.organizationId, userId: claims.userId };
    clients.add(client);

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
      } catch { /* ignorar mensajes malformados */ }
    });

    ws.on('close', () => clients.delete(client));
    ws.on('error', () => clients.delete(client));

    ws.send(JSON.stringify({ type: 'connected', organizationId: claims.organizationId }));
  });

  return wss;
}

// Envía un evento JSON a todos los clientes de una organización.
export function broadcast(organizationId: string, type: string, data: unknown) {
  const payload = JSON.stringify({ type, data });
  for (const client of clients) {
    if (client.organizationId === organizationId && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(payload);
    }
  }
}
