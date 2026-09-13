<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { Search, Building2, ArrowLeft, Loader2, CheckCircle2 } from 'lucide-vue-next';
import { agencyApi, getAgencyToken } from '../agencyApi';
import { api, setToken, getToken } from '../api';

interface AgencyClient {
  id: string;
  name: string;
  company: string | null;
  email: string;
  status: string;
  organization_id: string | null;
}

interface UserOrg {
  id: string;
  name: string;
  role: string;
  is_current: boolean;
}

const props = defineProps<{
  currentClientId?: string;
}>();

const emit = defineEmits<{ close: [] }>();

const router = useRouter();
const q = ref('');
const agencyClients = ref<AgencyClient[]>([]);
const userOrgs = ref<UserOrg[]>([]);
const loading = ref(false);
const switching = ref<string | null>(null);

const hasAgencyAccess = computed(() => !!getAgencyToken());
const hasMultipleOrgs = computed(() => userOrgs.value.length > 1);

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

const filteredAgencyClients = computed(() => {
  const s = q.value.toLowerCase().trim();
  if (!s) return agencyClients.value;
  return agencyClients.value.filter(c =>
    c.name.toLowerCase().includes(s) ||
    (c.company ?? '').toLowerCase().includes(s) ||
    c.email.toLowerCase().includes(s),
  );
});

const filteredUserOrgs = computed(() => {
  const s = q.value.toLowerCase().trim();
  if (!s) return userOrgs.value;
  return userOrgs.value.filter(o => o.name.toLowerCase().includes(s));
});

function initials(name: string) {
  return name.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

const STATUS_DOT: Record<string, string> = {
  active: 'bg-emerald-400',
  trial:  'bg-amber-400',
  suspended: 'bg-red-400',
  cancelled: 'bg-slate-400',
};

// Cambia a una org del propio usuario (sin impersonación de agencia)
async function switchToOrg(orgId: string, isCurrent: boolean) {
  if (isCurrent || switching.value) return;
  switching.value = orgId;
  try {
    const res = await api.post<{ token: string }>('/me/switch-org', { organizationId: orgId });
    setToken(res.token);
    emit('close');
    await router.push('/dashboard');
    window.location.reload();
  } catch (e) {
    alert(e instanceof Error ? e.message : 'Error al cambiar organización');
  } finally {
    switching.value = null;
  }
}

// Entra al CRM de un cliente por impersonación de agencia
async function switchToClient(clientId: string) {
  if (switching.value) return;
  switching.value = clientId;
  try {
    const res = await agencyApi.post<{
      token: string;
      client: { id: string; name: string; company: string | null; email: string };
    }>(`/clients/${clientId}/impersonate`);

    setToken(res.token);
    localStorage.setItem('crm_impersonated_client', JSON.stringify(res.client));
    emit('close');
    await router.push('/dashboard');
    window.location.reload();
  } catch (e) {
    alert(e instanceof Error ? e.message : 'Error al acceder al CRM');
  } finally {
    switching.value = null;
  }
}

function goToAgency() {
  setToken(null);
  localStorage.removeItem('crm_impersonated_client');
  emit('close');
  router.push('/agency/dashboard');
}
</script>

<template>
  <div class="flex flex-col" style="width: 300px;">
    <!-- Search -->
    <div class="relative px-3 pt-3 pb-2">
      <Search class="pointer-events-none absolute left-6 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        v-model="q"
        autofocus
        placeholder="Buscar cuenta…"
        class="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
    </div>

    <!-- Agency view switch (solo si tiene agency_token) -->
    <button
      v-if="hasAgencyAccess"
      class="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-primary hover:bg-primary/5 transition-colors cursor-pointer"
      @click="goToAgency"
    >
      <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100">
        <Building2 class="h-4 w-4 text-violet-600" />
      </div>
      <span>Vista de agencia</span>
      <ArrowLeft class="ml-auto h-3.5 w-3.5 text-slate-400" />
    </button>

    <div v-if="loading" class="flex justify-center py-6">
      <Loader2 class="h-5 w-5 animate-spin text-slate-300" />
    </div>

    <template v-else>
      <!-- Mis organizaciones (multi-CRM propio) -->
      <template v-if="filteredUserOrgs.length > 0">
        <div class="mx-3 h-px bg-slate-100"></div>
        <div class="max-h-48 overflow-y-auto py-1.5">
          <p class="px-4 pt-1 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Mis organizaciones
          </p>
          <button
            v-for="org in filteredUserOrgs"
            :key="org.id"
            class="flex w-full items-center gap-3 px-4 py-2.5 transition-colors cursor-pointer"
            :class="org.is_current ? 'bg-primary/5 cursor-default' : 'hover:bg-slate-50'"
            :disabled="org.is_current || !!switching"
            @click="switchToOrg(org.id, org.is_current)"
          >
            <div class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-200 text-[11px] font-bold text-slate-600">
              {{ initials(org.name) }}
            </div>
            <div class="min-w-0 flex-1 text-left">
              <p class="truncate text-sm font-medium text-slate-800 leading-tight">{{ org.name }}</p>
              <p class="truncate text-xs text-slate-400 leading-tight capitalize">{{ org.role }}</p>
            </div>
            <CheckCircle2 v-if="org.is_current" class="h-4 w-4 flex-shrink-0 text-primary" />
            <Loader2 v-else-if="switching === org.id" class="h-4 w-4 flex-shrink-0 animate-spin text-primary" />
          </button>
        </div>
      </template>

      <!-- Clientes de agencia (solo si tiene agency access) -->
      <template v-if="hasAgencyAccess && filteredAgencyClients.length > 0">
        <div class="mx-3 h-px bg-slate-100"></div>
        <div class="max-h-64 overflow-y-auto py-1.5">
          <p class="px-4 pt-1 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Clientes de agencia
          </p>
          <button
            v-for="c in filteredAgencyClients"
            :key="c.id"
            class="flex w-full items-center gap-3 px-4 py-2.5 transition-colors hover:bg-slate-50 cursor-pointer"
            :class="c.id === currentClientId ? 'bg-primary/5' : ''"
            :disabled="!!switching"
            @click="switchToClient(c.id)"
          >
            <div class="relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-200 text-[11px] font-bold text-slate-600">
              {{ initials(c.company || c.name) }}
              <span
                class="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white"
                :class="STATUS_DOT[c.status] ?? 'bg-slate-300'"
              ></span>
            </div>
            <div class="min-w-0 flex-1 text-left">
              <p class="truncate text-sm font-medium text-slate-800 leading-tight">
                {{ c.company || c.name }}
              </p>
              <p class="truncate text-xs text-slate-400 leading-tight">{{ c.email }}</p>
            </div>
            <Loader2 v-if="switching === c.id" class="h-4 w-4 flex-shrink-0 animate-spin text-primary" />
          </button>
        </div>
      </template>

      <p v-if="!hasAgencyAccess && filteredUserOrgs.length === 0" class="px-4 py-3 text-sm text-slate-400">
        Sin resultados
      </p>
    </template>
  </div>
</template>
