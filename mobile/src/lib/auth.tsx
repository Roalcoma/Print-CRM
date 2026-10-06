// Sesión: JWT en almacenamiento cifrado, rehidratación al abrir, bloqueo biométrico opcional.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { api, apiState, normalizeBaseUrl, setApiToken, setBaseUrl, setUnauthorizedHandler } from './api';
import { DEFAULT_API_URL, RELOCK_AFTER_MS } from './config';
import { getItem, KEYS, setItem } from './storage';
import { unregisterPush } from './push';
import type { User } from './types';

type Status = 'loading' | 'signedOut' | 'signedIn';

interface AuthCtx {
  status: Status;
  user: User | null;
  locked: boolean;
  biometricEnabled: boolean;
  apiUrl: string;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  changePassword(current: string, next: string): Promise<void>;
  unlock(): Promise<boolean>;
  setBiometric(on: boolean): Promise<boolean>;
  setApiUrl(url: string): Promise<void>;
  refreshUser(): Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export async function biometricAvailable(): Promise<boolean> {
  try {
    return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
  } catch { return false; }
}

async function authenticate(prompt: string): Promise<boolean> {
  try {
    const r = await LocalAuthentication.authenticateAsync({
      promptMessage: prompt,
      cancelLabel: 'Cancelar',
      fallbackLabel: 'Usar PIN',
      disableDeviceFallback: false,
    });
    return r.success;
  } catch { return false; }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [locked, setLocked] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [apiUrl, setApiUrlState] = useState(DEFAULT_API_URL);
  const bgSince = useRef<number | null>(null);

  const saveUser = useCallback(async (u: User) => {
    setUser(u);
    await setItem(KEYS.user, JSON.stringify(u));
  }, []);

  const clearSession = useCallback(async () => {
    setApiToken(null);
    setUser(null);
    setLocked(false);
    setStatus('signedOut');
    await Promise.all([setItem(KEYS.token, null), setItem(KEYS.user, null)]);
  }, []);

  const refreshUser = useCallback(async () => {
    const me = await api.get<User>('/me');
    await saveUser(me);
  }, [saveUser]);

  // Arranque: recuperar sesión guardada.
  useEffect(() => {
    (async () => {
      const [url, token, userJson, bio] = await Promise.all([
        getItem(KEYS.apiUrl), getItem(KEYS.token), getItem(KEYS.user), getItem(KEYS.biometric),
      ]);
      if (url) { setBaseUrl(url); setApiUrlState(apiState.baseUrl); }
      const bioOn = bio === '1' && (await biometricAvailable());
      setBiometricEnabled(bioOn);
      if (!token) { setStatus('signedOut'); return; }
      setApiToken(token);
      try { if (userJson) setUser(JSON.parse(userJson)); } catch { /* caché corrupta: se rehace con /me */ }
      setLocked(bioOn);
      setStatus('signedIn');
      refreshUser().catch(() => { /* sin red: seguimos con la caché; un 401 cierra la sesión */ });
    })();
  }, [refreshUser]);

  useEffect(() => {
    setUnauthorizedHandler(() => { clearSession(); });
    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  // Volver a pedir huella si la app estuvo un rato en segundo plano.
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => {
      if (s === 'background') bgSince.current = Date.now();
      else if (s === 'active' && bgSince.current) {
        const away = Date.now() - bgSince.current;
        bgSince.current = null;
        if (biometricEnabled && status === 'signedIn' && away > RELOCK_AFTER_MS) setLocked(true);
      }
    });
    return () => sub.remove();
  }, [biometricEnabled, status]);

  const signIn = useCallback(async (email: string, password: string) => {
    const r = await api.post<{ token: string; user: User }>('/auth/login', { email: email.trim(), password }, { auth: false });
    setApiToken(r.token);
    await setItem(KEYS.token, r.token);
    await saveUser(r.user);
    setLocked(false);
    setStatus('signedIn');
    // /me trae además el nombre de la organización
    refreshUser().catch(() => {});
  }, [saveUser, refreshUser]);

  const signOut = useCallback(async () => {
    await unregisterPush();
    await clearSession();
  }, [clearSession]);

  const changePassword = useCallback(async (current: string, next: string) => {
    const r = await api.post<{ ok: boolean; token?: string }>('/me/password', { current_password: current, new_password: next });
    if (r.token) { setApiToken(r.token); await setItem(KEYS.token, r.token); }
    if (user) await saveUser({ ...user, mustChangePassword: false });
    refreshUser().catch(() => {});
  }, [user, saveUser, refreshUser]);

  const unlock = useCallback(async () => {
    const ok = await authenticate('Desbloquear Rocco');
    if (ok) setLocked(false);
    return ok;
  }, []);

  const setBiometric = useCallback(async (on: boolean) => {
    if (on) {
      if (!(await biometricAvailable())) return false;
      if (!(await authenticate('Confirma para activar el desbloqueo'))) return false;
    }
    await setItem(KEYS.biometric, on ? '1' : '0');
    setBiometricEnabled(on);
    return true;
  }, []);

  const setApiUrl = useCallback(async (url: string) => {
    const u = normalizeBaseUrl(url);
    setBaseUrl(u);
    setApiUrlState(u);
    await setItem(KEYS.apiUrl, u === DEFAULT_API_URL ? null : u);
  }, []);

  const value = useMemo<AuthCtx>(() => ({
    status, user, locked, biometricEnabled, apiUrl,
    signIn, signOut, changePassword, unlock, setBiometric, setApiUrl, refreshUser,
  }), [status, user, locked, biometricEnabled, apiUrl, signIn, signOut, changePassword, unlock, setBiometric, setApiUrl, refreshUser]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth fuera de AuthProvider');
  return c;
}
