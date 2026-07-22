import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api, setToken, getToken } from '../api';
import type { User } from '../types';

const USER_KEY = 'crm_user';
const storedUser = (): User | null => JSON.parse(localStorage.getItem(USER_KEY) ?? 'null');

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(storedUser());
  const isAuthenticated = ref(!!getToken());

  function persist(res: { token: string; user: User }) {
    setToken(res.token);
    localStorage.setItem(USER_KEY, JSON.stringify(res.user));
    user.value = res.user;
    isAuthenticated.value = true;
  }

  async function login(email: string, password: string) {
    persist(await api.post<{ token: string; user: User }>('/auth/login', { email, password }));
  }

  async function register(payload: { organizationName: string; name: string; email: string; password: string }) {
    persist(await api.post<{ token: string; user: User }>('/auth/register', payload));
  }

  function logout() {
    setToken(null);
    localStorage.removeItem(USER_KEY);
    user.value = null;
    isAuthenticated.value = false;
  }

  return { user, isAuthenticated, login, register, logout };
});
