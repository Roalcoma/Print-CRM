// Gestiona las conexiones WebSocket del CRM, agrupadas por organización.
// El frontend pide un ticket de un solo uso (POST /api/ws-ticket, autenticado) y se conecta
// con ws://host/ws?ticket=<ticket>: la sesión de 30 días nunca viaja en la URL (logs, proxies).
// Cada evento se filtra por los permisos del usuario conectado (ver canReceive).

import { WebSocketServer, WebSocket } from 'ws';
import { randomBytes } from 'node:crypto';
import type { IncomingMessage } from 'http';
import type { Server } from 'http';
import { verifyToken, type AuthClaims } from '../auth/tokens.ts';
import { validateSession, onInvalidateUser, type SessionUser } from '../auth/session.ts';
import type { ModuleKey } from '../auth/perms.ts';

interface WSClient {
  ws: WebSocket;
  organizationId: string;
  userId: string;
  claims: AuthClaims;
  role: string;
  permissions: string[];
}

const clients: Set<WSClient> = new Set();

// ── Tickets de conexión ──────────────────────────────────────────────────────
const TICKET_MS = 30_000;
const tickets = new Map<string, { claims: AuthClaims; exp: number }>();

export function issueWsTicket(claims: AuthClaims): string {
  const now = Date.now();
  for (const [k, t] of tickets) if (t.exp < now) tickets.delete(k);   // limpieza perezosa
  const ticket = randomBytes(24).toString('base64url');
  tickets.set(ticket, { claims, exp: now + TICKET_MS });
  return ticket;
}

function takeTicket(ticket: string): AuthClaims | null {
  const t = tickets.get(ticket);
  tickets.delete(ticket);   // un solo uso
  return t && t.exp >= Date.now() ? t.claims : null;
}

async function claimsFromRequest(req: IncomingMessage): Promise<AuthClaims | null> {
  const url = new URL(req.url ?? '', 'http://localhost');
  const ticket = url.searchParams.get('ticket');
  let claims: AuthClaims | null = null;
  if (ticket) claims = takeTicket(ticket);
  else {
    // Compatibilidad temporal con pestañas abiertas antes del despliegue (?token=<jwt>).
    // ponytail: quitar cuando ya no queden clientes viejos; el front actual usa ?ticket=.
    const token = url.searchParams.get('token');
    if (token) try { claims = verifyToken(token); } catch { claims = null; }
  }
  if (!claims || (claims as { type?: string }).type === 'agency') return null;
  return claims;
}

// ── Permisos por tipo de evento ──────────────────────────────────────────────
const MODULE_BY_PREFIX: Record<string, ModuleKey> = {
  message: 'conversations',
  conversation: 'conversations',
  opportunity: 'opportunities',
  appointment: 'calendar',
};

function canReceive(client: WSClient, type: string, data: unknown): boolean {
  const prefix = type.split(':')[0];
  // Las notificaciones son personales: solo al destinatario si el evento lo indica
  if (prefix === 'notification') {
    const target = (data as { userId?: unknown } | null)?.userId;
    return typeof target !== 'string' || target === client.userId;
  }
  if (client.role === 'owner' || client.role === 'admin') return true;
  const mod = MODULE_BY_PREFIX[prefix];
  return !mod || client.permissions.includes(mod);
}

function applyUser(client: WSClient, user: SessionUser) {
  client.role = user.role;
  client.permissions = user.permissions;
}

// Al borrar/cambiar a un usuario, se revalidan sus conexiones: se cierran si la sesión ya
// no vale o se actualizan rol y permisos al momento.
onInvalidateUser(userId => {
  for (const client of clients) {
    if (client.userId !== userId) continue;
    validateSession(client.claims)
      .then(user => {
        if (user) applyUser(client, user);
        else { clients.delete(client); client.ws.close(4001, 'Sesión cerrada'); }
      })
      .catch(() => { /* error de BD: se mantiene lo que había */ });
  }
});

export function initWS(httpServer: Server) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    // Los mensajes que lleguen mientras se valida se ignoran (solo hay ping); un error de
    // socket durante la validación no debe tumbar el proceso por falta de listener.
    ws.on('error', () => {});
    const claims = await claimsFromRequest(req);
    if (!claims) { ws.close(4001, 'Token inválido'); return; }
    const user = await validateSession(claims).catch(() => null);
    if (!user) { ws.close(4001, 'Sesión no válida'); return; }
    if (ws.readyState !== WebSocket.OPEN) return;

    const client: WSClient = {
      ws, organizationId: claims.organizationId, userId: claims.userId, claims,
      role: user.role, permissions: user.permissions,
    };
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

// Envía un evento JSON a los clientes de una organización que tengan permiso para verlo.
export function broadcast(organizationId: string, type: string, data: unknown) {
  const payload = JSON.stringify({ type, data });
  for (const client of clients) {
    if (client.organizationId === organizationId && client.ws.readyState === WebSocket.OPEN
        && canReceive(client, type, data)) {
      client.ws.send(payload);
    }
  }
}
