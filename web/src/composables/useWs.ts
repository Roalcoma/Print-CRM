// Composable que mantiene una conexión WebSocket al backend CRM.
// Gestiona reconexión automática con backoff, heartbeat ping/pong, y bus de eventos.

import { ref, onUnmounted } from 'vue';
import { getToken } from '../api';

type Handler = (data: unknown) => void;

const handlers = new Map<string, Set<Handler>>();
let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let pongTimer: ReturnType<typeof setTimeout> | null = null;
let backoff = 1000;
let refCount = 0;
let hasConnectedBefore = false;

function getWsUrl(): string {
  const token = getToken();
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const host = import.meta.env.VITE_API_URL
    ? new URL(import.meta.env.VITE_API_URL as string).host
    : `${location.hostname}:3100`;
  return `${proto}://${host}/ws?token=${token}`;
}

function stopHeartbeat() {
  if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
  if (pongTimer) { clearTimeout(pongTimer); pongTimer = null; }
}

function startHeartbeat() {
  stopHeartbeat();
  pingTimer = setInterval(() => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'ping' }));
      // Si no llega pong en 5s, la conexión es zombie: cerrar y reconectar
      pongTimer = setTimeout(() => {
        pongTimer = null;
        socket?.close();
      }, 5000);
    }
  }, 25000);
}

function connect() {
  if (socket && socket.readyState <= WebSocket.OPEN) return;
  socket = new WebSocket(getWsUrl());

  socket.onopen = () => {
    backoff = 1000;
    isConnected.value = true;
    startHeartbeat();
    if (hasConnectedBefore) {
      // Reconexión: notificar para que el componente re-fetchee datos perdidos
      const set = handlers.get('ws:reconnect');
      if (set) set.forEach(h => h(undefined));
    }
    hasConnectedBefore = true;
  };

  socket.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data as string) as { type: string; data?: unknown };
      if (msg.type === 'pong') {
        // Cancelar el timer de pong: conexión viva
        if (pongTimer) { clearTimeout(pongTimer); pongTimer = null; }
        return;
      }
      const set = handlers.get(msg.type);
      if (set) set.forEach(h => h(msg.data));
      const all = handlers.get('*');
      if (all) all.forEach(h => h(msg));
    } catch { /* mensajes no JSON ignorados */ }
  };

  socket.onclose = () => {
    isConnected.value = false;
    socket = null;
    stopHeartbeat();
    if (refCount > 0) scheduleReconnect();
  };

  socket.onerror = () => {
    socket?.close();
  };
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
    backoff = Math.min(backoff * 2, 30_000);
  }, backoff);
}

const isConnected = ref(false);

export function useWs() {
  refCount++;
  connect();

  onUnmounted(() => {
    refCount--;
    if (refCount <= 0) {
      refCount = 0;
      stopHeartbeat();
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      socket?.close();
      socket = null;
    }
  });

  function on(type: string, handler: Handler) {
    if (!handlers.has(type)) handlers.set(type, new Set());
    handlers.get(type)!.add(handler);
    onUnmounted(() => handlers.get(type)?.delete(handler));
  }

  function off(type: string, handler: Handler) {
    handlers.get(type)?.delete(handler);
  }

  function send(type: string, data?: unknown) {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type, data }));
    }
  }

  return { isConnected, on, off, send };
}
