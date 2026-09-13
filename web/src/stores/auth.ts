import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api, setToken, getToken } from '../api';
import type { User } from '../types';

function decodeJwt(token: string): Record<string, unknown> {
  try { return JSON.parse(atob(token.split('.')[1])); } catch { return {}; }
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const preferences = ref<Record<string, unknown>>({});
  const isAuthenticated = ref(!!getToken());

  const isAdmin = computed(() => user.value?.role === 'owner' || user.value?.role === 'admin')

  const isImpersonated = computed(() => {
    const t = getToken();
    return !!t && decodeJwt(t).impersonatedByAgency === true;
  })

  const impersonatedClient = computed<{ id: string; name: string; company: string | null } | null>(() => {
    if (!isImpersonated.value) return null;
    try {
      const raw = localStorage.getItem('crm_impersonated_client');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });
  // ¿El usuario puede acceder a este módulo? Admin/owner siempre; el resto según permisos.
  function can(module: string) {
    if (isAdmin.value) return true;
    return (user.value?.permissions ?? []).includes(module);
  }

  function setSession(u: User) {
    user.value = u;
    preferences.value = u.preferences ?? {};
    isAuthenticated.value = true;
  }

  async function login(email: string, password: string) {
    const res = await api.post<{ token: string; user: User }>('/auth/login', { email, password });
    setToken(res.token);
    setSession(res.user);
  }

  async function register(payload: { organizationName: string; name: string; email: string; password: string }) {
    const res = await api.post<{ token: string; user: User }>('/auth/register', payload);
    setToken(res.token);
    setSession(res.user);
  }

  // Rehidrata la sesión al recargar (memoizado: corre una sola vez aunque se
  // llame desde App.vue y desde el guard del router).
  let initPromise: Promise<void> | null = null;
  function init() {
    if (!initPromise) initPromise = doInit();
    return initPromise;
  }
  async function doInit() {
    if (!getToken()) return;
    try {
      setSession(await api.get<User>('/me'));
    } catch {
      logout(); // token inválido/expirado
    }
  }

  // Guarda preferencias en la cuenta (merge en backend) y actualiza el estado local.
  async function savePreferences(patch: Record<string, unknown>) {
    preferences.value = await api.put<Record<string, unknown>>('/me/preferences', patch);
  }

  function logout() {
    setToken(null);
    user.value = null;
    preferences.value = {};
    isAuthenticated.value = false;
  }

  return { user, preferences, isAuthenticated, isAdmin, isImpersonated, impersonatedClient, can, login, register, init, savePreferences, logout };
});
