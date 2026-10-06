// Bus mínimo de eventos de la app (p. ej. "llegó un push de mensaje" → refrescar bandeja y badge).
type Handler = (payload?: unknown) => void;
const handlers = new Map<string, Set<Handler>>();

export function on(event: string, fn: Handler): () => void {
  if (!handlers.has(event)) handlers.set(event, new Set());
  handlers.get(event)!.add(fn);
  return () => { handlers.get(event)?.delete(fn); };
}
export function emit(event: string, payload?: unknown) {
  handlers.get(event)?.forEach(fn => fn(payload));
}
