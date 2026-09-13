<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { Search, Building2, ArrowLeft, Loader2 } from 'lucide-vue-next';
import { agencyApi, getAgencyToken } from '../agencyApi';
import { setToken } from '../api';

interface AgencyClient {
  id: string;
  name: string;
  company: string | null;
  email: string;
  status: string;
  organization_id: string | null;
}

const props = defineProps<{
  currentClientId?: string;
}>();

const emit = defineEmits<{ close: [] }>();

const router = useRouter();
const q = ref('');
const clients = ref<AgencyClient[]>([]);
const loading = ref(false);
const switching = ref<string | null>(null);

const hasAgencyAccess = computed(() => !!getAgencyToken());

onMounted(async () => {
  if (!hasAgencyAccess.value) return;
  loading.value = true;
  try {
    const res = await agencyApi.get<{ clients: AgencyClient[] }>('/clients?limit=100');
    clients.value = res.clients;
  } catch { /* sin acceso de agencia */ }
  finally { loading.value = false; }
});

const filtered = computed(() => {
  const s = q.value.toLowerCase().trim();
  if (!s) return clients.value;
  return clients.value.filter(c =>
    c.name.toLowerCase().includes(s) ||
    (c.company ?? '').toLowerCase().includes(s) ||
    c.email.toLowerCase().includes(s),
  );
});

function initials(c: AgencyClient) {
  const n = c.company || c.name;
  return n.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

const STATUS_DOT: Record<string, string> = {
  active: 'bg-emerald-400',
  trial:  'bg-amber-400',
  suspended: 'bg-red-400',
  cancelled: 'bg-slate-400',
};

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

    <!-- Agency view switch -->
    <button
      class="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-primary hover:bg-primary/5 transition-colors cursor-pointer"
      @click="goToAgency"
    >
      <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100">
        <Building2 class="h-4 w-4 text-violet-600" />
      </div>
      <span>Vista de agencia</span>
      <ArrowLeft class="ml-auto h-3.5 w-3.5 text-slate-400" />
    </button>

    <div class="mx-3 h-px bg-slate-100"></div>

    <!-- Clients list -->
    <div class="max-h-72 overflow-y-auto py-1.5">
      <p class="px-4 pt-1 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
        Todas las cuentas
      </p>

      <div v-if="loading" class="flex justify-center py-6">
        <Loader2 class="h-5 w-5 animate-spin text-slate-300" />
      </div>

      <template v-else>
        <button
          v-for="c in filtered"
          :key="c.id"
          class="flex w-full items-center gap-3 px-4 py-2.5 transition-colors hover:bg-slate-50 cursor-pointer"
          :class="c.id === currentClientId ? 'bg-primary/5' : ''"
          :disabled="!!switching"
          @click="switchToClient(c.id)"
        >
          <!-- Avatar -->
          <div class="relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-200 text-[11px] font-bold text-slate-600">
            {{ initials(c) }}
            <span
              class="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white"
              :class="STATUS_DOT[c.status] ?? 'bg-slate-300'"
            ></span>
          </div>

          <!-- Info -->
          <div class="min-w-0 flex-1 text-left">
            <p class="truncate text-sm font-medium text-slate-800 leading-tight">
              {{ c.company || c.name }}
            </p>
            <p class="truncate text-xs text-slate-400 leading-tight">{{ c.email }}</p>
          </div>

          <!-- Spinner when switching -->
          <Loader2 v-if="switching === c.id" class="h-4 w-4 flex-shrink-0 animate-spin text-primary" />
        </button>

        <p v-if="!loading && filtered.length === 0" class="px-4 py-3 text-sm text-slate-400">
          Sin resultados
        </p>
      </template>
    </div>
  </div>
</template>
