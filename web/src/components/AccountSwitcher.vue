<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { Search, ArrowLeft, Loader2, Pin } from 'lucide-vue-next';
import { agencyApi, getAgencyToken } from '../agencyApi';
import { api, setToken, getToken } from '../api';
import { useAuthStore } from '../stores/auth';
import { useDialog } from '../composables/useDialog';

interface AgencyClient {
  id: string;
  name: string;
  company: string | null;
  email: string;
  status: string;
  type: 'own' | 'client';
  organization_id: string | null;
}

interface UserOrg {
  id: string;
  name: string;
  role: string;
  is_current: boolean;
}

interface Account {
  key: string;
  initial: string;
  name: string;
  subtitle: string;
  isCurrent: boolean;
  action: () => void;
  loading: boolean;
}

const props = defineProps<{
  currentClientId?: string;
  hideAgencySwitch?: boolean;
}>();

const emit = defineEmits<{ close: [] }>();

const { alert, confirm } = useDialog();
const auth = useAuthStore();
const router = useRouter();
const q = ref('');
const agencyClients = ref<AgencyClient[]>([]);
const userOrgs = ref<UserOrg[]>([]);
const loading = ref(false);
const switching = ref<string | null>(null);

const hasAgencyAccess = computed(() => !!getAgencyToken());

onMounted(async () => {
  loading.value = true;
  try {
    await Promise.all([
      hasAgencyAccess.value
        ? agencyApi.get<{ clients: AgencyClient[] }>('/clients?limit=100').then(r => { agencyClients.value = r.clients; })
        : Promise.resolve(),
      api.get<{ organizations: UserOrg[] }>('/me/organizations').then(r => { userOrgs.value = r.organizations; }),
    ]);
  } catch { /* sin acceso */ }
  finally { loading.value = false; }
});

function initial(name: string) {
  return name.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

async function switchToOrg(org: UserOrg) {
  if (org.is_current || switching.value) return;
  switching.value = org.id;
  try {
    const res = await api.post<{ token: string }>('/me/switch-org', { organizationId: org.id });
    setToken(res.token);
    emit('close');
    await router.push('/dashboard');
    window.location.reload();
  } catch (e) {
    await alert(e instanceof Error ? e.message : 'Error al cambiar organización');
  } finally {
    switching.value = null;
  }
}

async function switchToClient(client: AgencyClient) {
  if (switching.value) return;
  switching.value = client.id;
  try {
    const originalToken = getToken();
    if (originalToken) localStorage.setItem('crm_original_token', originalToken);
    const res = await agencyApi.post<{
      token: string;
      client: { id: string; name: string; company: string | null; email: string };
    }>(`/clients/${client.id}/impersonate`);
    setToken(res.token);
    localStorage.setItem('crm_impersonated_client', JSON.stringify(res.client));
    emit('close');
    await router.push('/dashboard');
    window.location.reload();
  } catch (e) {
    await alert(e instanceof Error ? e.message : 'Error al acceder al CRM');
  } finally {
    switching.value = null;
  }
}

function goToAgency() {
  const originalToken = localStorage.getItem('crm_original_token');
  if (originalToken) {
    setToken(originalToken);
    localStorage.removeItem('crm_original_token');
  }
  localStorage.removeItem('crm_impersonated_client');
  emit('close');
  router.push('/agency/dashboard');
}

// Lista unificada de cuentas
const allAccounts = computed<Account[]>(() => {
  const s = q.value.toLowerCase().trim();

  const ownOrgs: Account[] = userOrgs.value
    .filter(o => !s || o.name.toLowerCase().includes(s))
    .map(o => ({
      key: `org:${o.id}`,
      initial: initial(o.name),
      name: o.name,
      subtitle: o.role,
      isCurrent: o.is_current && !auth.isImpersonated,
      action: () => switchToOrg(o),
      get loading() { return switching.value === o.id; },
    }));

  const clients: Account[] = agencyClients.value
    .filter(c => !s || (c.company || c.name).toLowerCase().includes(s) || c.email.toLowerCase().includes(s))
    .map(c => ({
      key: `client:${c.id}`,
      initial: initial(c.company || c.name),
      name: c.company || c.name,
      subtitle: c.email,
      isCurrent: auth.isImpersonated && c.id === props.currentClientId,
      action: () => switchToClient(c),
      get loading() { return switching.value === c.id; },
    }));

  // Evitar duplicados: si un org propio ya está como cliente, omitir el de userOrgs
  if (hasAgencyAccess.value && clients.length > 0) {
    return clients;
  }
  return ownOrgs;
});
</script>

<template>
  <div class="flex flex-col" style="width: 320px; max-height: 480px;">
    <!-- Search -->
    <div class="relative px-3 pt-3 pb-2.5">
      <Search class="pointer-events-none absolute left-6 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        v-model="q"
        autofocus
        placeholder="Buscar cuenta…"
        class="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20"
      />
    </div>

    <!-- Switch to Agency View -->
    <button
      v-if="hasAgencyAccess && !props.hideAgencySwitch"
      class="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
      @click="goToAgency"
    >
      <div class="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100">
        <ArrowLeft class="h-3.5 w-3.5 text-blue-600" />
      </div>
      <span>Switch to Agency View</span>
    </button>

    <!-- List -->
    <div v-if="loading" class="flex justify-center py-8">
      <Loader2 class="h-5 w-5 animate-spin text-slate-300" />
    </div>

    <div v-else class="flex-1 overflow-y-auto">
      <p v-if="allAccounts.length > 0" class="px-4 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
        All Accounts
      </p>

      <button
        v-for="acc in allAccounts"
        :key="acc.key"
        class="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors cursor-pointer"
        :class="acc.isCurrent ? 'bg-slate-50 cursor-default' : 'hover:bg-slate-50'"
        :disabled="acc.isCurrent || !!switching"
        @click="acc.action()"
      >
        <!-- Avatar -->
        <div
          class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-[12px] font-bold"
          :class="acc.isCurrent ? 'bg-[#F69008]/15 text-[#F69008]' : 'bg-slate-100 text-slate-600'"
        >
          {{ acc.initial }}
        </div>

        <!-- Info -->
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-semibold leading-tight text-slate-800">{{ acc.name }}</p>
          <p class="truncate text-xs leading-tight text-slate-400 capitalize">{{ acc.subtitle }}</p>
        </div>

        <!-- Right icon -->
        <div class="flex-shrink-0">
          <Loader2 v-if="acc.loading" class="h-4 w-4 animate-spin text-[#F69008]" />
          <Pin v-else-if="acc.isCurrent" class="h-3.5 w-3.5 text-slate-300 fill-slate-300" />
          <Pin v-else class="h-3.5 w-3.5 text-slate-200" />
        </div>
      </button>

      <p v-if="allAccounts.length === 0 && !loading" class="px-4 py-4 text-sm text-slate-400 text-center">
        Sin resultados
      </p>
    </div>
  </div>
</template>
