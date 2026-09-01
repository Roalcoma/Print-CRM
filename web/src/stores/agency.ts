import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { agencyApi, getAgencyToken, setAgencyToken } from '../agencyApi';

export interface AgencyAdmin {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export const useAgencyStore = defineStore('agency', () => {
  const token = ref<string | null>(getAgencyToken());
  const admin = ref<AgencyAdmin | null>(null);

  const isLoggedIn = computed(() => !!token.value && !!admin.value);

  async function login(email: string, password: string) {
    const res = await agencyApi.post<{ token: string; admin: AgencyAdmin }>('/auth/login', { email, password });
    token.value = res.token;
    admin.value = res.admin;
    setAgencyToken(res.token);
  }

  function logout() {
    token.value = null;
    admin.value = null;
    setAgencyToken(null);
  }

  let initPromise: Promise<void> | null = null;
  function init() {
    if (!initPromise) initPromise = doInit();
    return initPromise;
  }
  async function doInit() {
    if (!getAgencyToken()) return;
    try {
      admin.value = await agencyApi.get<AgencyAdmin>('/auth/me');
    } catch {
      logout();
    }
  }

  return { token, admin, isLoggedIn, login, logout, init };
});
