// URL del servidor del CRM. Se puede cambiar desde la opción oculta del login (útil para pruebas
// contra un servidor local); el valor elegido se guarda en el dispositivo.
export const DEFAULT_API_URL = 'https://rocco.arbolaureo.org';

// Cada cuánto se refresca el contador de no leídos y el chat abierto (no hay WebSocket en la fase 1).
export const UNREAD_POLL_MS = 45_000;
export const CHAT_POLL_MS = 8_000;

// Si la app pasó más de este tiempo en segundo plano y el desbloqueo biométrico está activo, se pide de nuevo.
export const RELOCK_AFTER_MS = 5 * 60_000;

export const PAGE_SIZE = 30;
