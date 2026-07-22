import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api, setToken, getToken } from '../api';
import type { User } from '../types';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const preferences = ref<Record<string, unknown>>({});
  const isAuthenticated = ref(!!getToken());

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

  // Rehidrata la sesión al recargar la app (los datos viven en la cuenta, no en el navegador).
  async function init() {
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

  return { user, preferences, isAuthenticated, login, register, init, savePreferences, logout };
});
