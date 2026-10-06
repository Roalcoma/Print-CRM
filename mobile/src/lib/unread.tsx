// Número de conversaciones con mensajes sin leer (badge de la pestaña Mensajes).
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { api, qs } from './api';
import { UNREAD_POLL_MS } from './config';
import { on } from './events';
import { useAuth } from './auth';

const Ctx = createContext<{ unread: number; refreshUnread(): void }>({ unread: 0, refreshUnread: () => {} });

export function UnreadProvider({ children }: { children: ReactNode }) {
  const { status, locked } = useAuth();
  const [unread, setUnread] = useState(0);
  const active = status === 'signedIn' && !locked;

  const refreshUnread = useCallback(() => {
    if (!active) return;
    api.get<{ total: number }>(`/conversations${qs({ unread: 'true', status: 'all', limit: 1 })}`)
      .then(r => setUnread(r.total ?? 0))
      .catch(() => { /* sin módulo de conversaciones o sin red: se deja como está */ });
  }, [active]);

  useEffect(() => {
    if (!active) { setUnread(0); return; }
    refreshUnread();
    const t = setInterval(() => { if (AppState.currentState === 'active') refreshUnread(); }, UNREAD_POLL_MS);
    const offs = [on('push:message', refreshUnread), on('conversations:changed', refreshUnread)];
    const sub = AppState.addEventListener('change', s => { if (s === 'active') refreshUnread(); });
    return () => { clearInterval(t); offs.forEach(o => o()); sub.remove(); };
  }, [active, refreshUnread]);

  const value = useMemo(() => ({ unread, refreshUnread }), [unread, refreshUnread]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useUnread = () => useContext(Ctx);
