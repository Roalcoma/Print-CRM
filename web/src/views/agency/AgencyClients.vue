<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Plus, Search, ChevronRight, X, Copy, Check, Eye, EyeOff, Infinity } from 'lucide-vue-next';
import { agencyApi } from '../../agencyApi';

interface AgencyClient {
  id: string;
  organization_id: string | null;
  name: string;
  company: string | null;
  email: string;
  phone: string | null;
  country: string | null;
  plan: string;
  status: string;
  type: 'own' | 'client';
  trial_ends_at: string | null;
  monthly_value: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  org_name: string | null;
  user_count: string;
}

interface Credentials {
  email: string;
  password: string;
  organizationId: string;
  userId: string;
}

const router = useRouter();

// List state
const clients = ref<AgencyClient[]>([]);
const total = ref(0);
const loading = ref(true);
const error = ref('');
const q = ref('');
const filterStatus = ref('');
const filterPlan = ref('');
const filterType = ref('');
const page = ref(1);

// New account modal
const showModal = ref(false);
const submitting = ref(false);
const formError = ref('');
const credentials = ref<Credentials | null>(null);
const showCredentials = ref(false);
const showTempPass = ref(false);
const copied = ref(false);

const form = ref({
  name: '',
  company: '',
  email: '',
  phone: '',
  country: '',
  plan: 'starter' as 'starter' | 'pro' | 'enterprise',
  status: 'active' as 'active' | 'trial',
  type: 'client' as 'own' | 'client',
  monthlyValue: 0,
  notes: '',
  trialUnlimited: false,
  trialDays: 7,
});

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const params = new URLSearchParams({ page: String(page.value), limit: '20' });
    if (q.value) params.set('q', q.value);
    if (filterStatus.value) params.set('status', filterStatus.value);
    if (filterPlan.value) params.set('plan', filterPlan.value);
    if (filterType.value) params.set('type', filterType.value);
    const res = await agencyApi.get<{ clients: AgencyClient[]; total: number }>(`/clients?${params}`);
    clients.value = res.clients;
    total.value = res.total;
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Error al cargar';
  } finally {
    loading.value = false;
  }
}

onMounted(load);

// Debounce search
let searchTimer: ReturnType<typeof setTimeout>;
watch(q, () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { page.value = 1; load(); }, 350);
});
watch([filterStatus, filterPlan, filterType], () => { page.value = 1; load(); });

async function createClient() {
  formError.value = '';
  submitting.value = true;
  try {
    const trialDaysOverride = form.value.status === 'trial'
      ? (form.value.trialUnlimited ? 0 : form.value.trialDays)
      : undefined;
    const res = await agencyApi.post<{ client: AgencyClient; credentials: Credentials }>('/clients', {
      name: form.value.name,
      company: form.value.company || undefined,
      email: form.value.email,
      phone: form.value.phone || undefined,
      country: form.value.country || undefined,
      plan: form.value.plan,
      status: form.value.status,
      type: form.value.type,
      monthlyValue: Number(form.value.monthlyValue),
      notes: form.value.notes || undefined,
      trialDaysOverride,
    });
    credentials.value = res.credentials;
    showCredentials.value = true;
    await load();
  } catch (e) {
    formError.value = e instanceof Error ? e.message : 'Error al crear';
  } finally {
    submitting.value = false;
  }
}

function resetModal() {
  showModal.value = false;
  showCredentials.value = false;
  credentials.value = null;
  showTempPass.value = false;
  copied.value = false;
  formError.value = '';
  form.value = { name: '', company: '', email: '', phone: '', country: '', plan: 'starter', status: 'active', type: 'client', monthlyValue: 0, notes: '', trialUnlimited: false, trialDays: 7 };
}

async function copyPassword() {
  if (!credentials.value) return;
  await navigator.clipboard.writeText(credentials.value.password);
  copied.value = true;
  setTimeout(() => (copied.value = false), 2000);
}

function planBadge(plan: string) {
  const m: Record<string, string> = {
    starter: 'bg-slate-700 text-slate-300 border-slate-600',
    pro: 'bg-blue-900/60 text-blue-300 border-blue-700/60',
    enterprise: 'bg-purple-900/60 text-purple-300 border-purple-700/60',
  };
  return m[plan] ?? m.starter;
}

function statusBadge(status: string) {
  const m: Record<string, string> = {
    active: 'bg-emerald-900/60 text-emerald-300 border-emerald-700/60',
    trial: 'bg-amber-900/60 text-amber-300 border-amber-700/60',
    suspended: 'bg-orange-900/60 text-orange-300 border-orange-700/60',
    cancelled: 'bg-red-900/60 text-red-300 border-red-700/60',
  };
  return m[status] ?? m.active;
}

function statusLabel(s: string) {
  const m: Record<string, string> = { active: 'Activo', trial: 'Trial', suspended: 'Suspendido', cancelled: 'Cancelado' };
  return m[s] ?? s;
}

function planLabel(p: string) {
  return p.charAt(0).toUpperCase() + p.slice(1);
}

function formatDate(dt: string) {
  return new Date(dt).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatCurrency(v: string | number) {
  return new Intl.NumberFormat('es-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(v));
}

const totalPages = computed(() => Math.ceil(total.value / 20));
</script>

<template>
  <div class="space-y-5 p-4 sm:p-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-xl font-bold text-white">Cuentas CRM</h2>
        <p class="text-sm text-slate-400 mt-0.5">{{ total }} cuentas en total</p>
      </div>
      <button
        class="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 transition-colors cursor-pointer shadow-lg shadow-violet-900/40"
        @click="showModal = true"
      >
        <Plus class="h-4 w-4" />
        Nueva Cuenta
      </button>
    </div>

    <!-- Filters -->
    <div class="flex flex-wrap gap-3">
      <div class="relative flex-1 min-w-[200px] max-w-sm">
        <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          v-model="q"
          placeholder="Buscar cuentas…"
          class="w-full rounded-lg border border-slate-700 bg-slate-800/60 py-2 pl-9 pr-3 text-sm text-slate-200 placeholder-slate-500 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 focus:outline-none transition-all"
        />
      </div>
      <select
        v-model="filterStatus"
        class="rounded-lg border border-slate-700 bg-slate-800/60 py-2 pl-3 pr-8 text-sm text-slate-300 focus:border-violet-500 focus:outline-none cursor-pointer"
      >
        <option value="">Todos los estados</option>
        <option value="active">Activo</option>
        <option value="trial">Trial</option>
        <option value="suspended">Suspendido</option>
        <option value="cancelled">Cancelado</option>
      </select>
      <select
        v-model="filterPlan"
        class="rounded-lg border border-slate-700 bg-slate-800/60 py-2 pl-3 pr-8 text-sm text-slate-300 focus:border-violet-500 focus:outline-none cursor-pointer"
      >
        <option value="">Todos los planes</option>
        <option value="starter">Starter</option>
        <option value="pro">Pro</option>
        <option value="enterprise">Enterprise</option>
      </select>
      <select
        v-model="filterType"
        class="rounded-lg border border-slate-700 bg-slate-800/60 py-2 pl-3 pr-8 text-sm text-slate-300 focus:border-violet-500 focus:outline-none cursor-pointer"
      >
        <option value="">Todos los tipos</option>
        <option value="own">Propias</option>
        <option value="client">Clientes</option>
      </select>
    </div>

    <!-- Error -->
    <div v-if="error" class="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-400 text-sm">{{ error }}</div>

    <!-- Table -->
    <div class="rounded-xl border border-slate-800/60 bg-slate-900/60 overflow-hidden overflow-x-auto">
      <!-- Loading skeleton -->
      <div v-if="loading && clients.length === 0" class="p-4 space-y-3">
        <div v-for="i in 5" :key="i" class="h-10 rounded-lg bg-slate-800/50 animate-pulse"></div>
      </div>

      <table v-else class="w-full text-sm">
        <thead>
          <tr class="border-b border-slate-800/60">
            <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Cuenta</th>
            <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Tipo</th>
            <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Plan</th>
            <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Estado</th>
            <th class="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Valor/mes</th>
            <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Creado</th>
            <th class="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="clients.length === 0">
            <td colspan="8" class="py-12 text-center text-slate-500">
              No hay cuentas aún.
              <button class="ml-1 text-violet-400 hover:text-violet-300 cursor-pointer" @click="showModal = true">Crear la primera</button>
            </td>
          </tr>
          <tr
            v-for="client in clients"
            :key="client.id"
            class="border-b border-slate-800/40 hover:bg-slate-800/30 cursor-pointer transition-colors"
            @click="router.push(`/agency/clients/${client.id}`)"
          >
            <td class="px-4 py-3">
              <p class="font-medium text-slate-200">{{ client.company || client.name }}</p>
              <p class="text-xs text-slate-500">{{ client.email }}</p>
            </td>
            <td class="px-4 py-3">
              <span
                class="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium"
                :class="client.type === 'own'
                  ? 'bg-sky-900/60 text-sky-300 border-sky-700/60'
                  : 'bg-slate-700/60 text-slate-300 border-slate-600/60'"
              >
                {{ client.type === 'own' ? 'Propia' : 'Cliente' }}
              </span>
            </td>
            <td class="px-4 py-3">
              <span class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium" :class="planBadge(client.plan)">
                {{ planLabel(client.plan) }}
              </span>
            </td>
            <td class="px-4 py-3">
              <span class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium" :class="statusBadge(client.status)">
                {{ statusLabel(client.status) }}
              </span>
            </td>
            <td class="px-4 py-3 text-right font-semibold text-slate-300">{{ formatCurrency(client.monthly_value) }}</td>
            <td class="px-4 py-3 text-slate-500 text-xs">{{ formatDate(client.created_at) }}</td>
            <td class="px-4 py-3">
              <ChevronRight class="h-4 w-4 text-slate-600" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="flex items-center justify-center gap-2">
      <button
        v-for="p in totalPages"
        :key="p"
        class="h-8 w-8 rounded-lg text-sm font-medium transition-colors cursor-pointer"
        :class="p === page ? 'bg-violet-600 text-white' : 'text-slate-400 hover:bg-slate-800'"
        @click="page = p; load()"
      >{{ p }}</button>
    </div>

    <!-- New Client Modal -->
    <Teleport to="body">
      <div v-if="showModal" class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="resetModal"></div>

        <div class="relative z-10 w-full max-w-lg rounded-2xl border border-slate-700/60 bg-slate-900 shadow-2xl">
          <!-- Credentials view -->
          <div v-if="showCredentials && credentials" class="p-6">
            <div class="flex items-center gap-3 mb-5">
              <div class="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20 border border-emerald-500/30">
                <Check class="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <h3 class="font-bold text-white">CRM provisionado</h3>
                <p class="text-xs text-slate-400">Comparte estas credenciales con el cliente</p>
              </div>
            </div>

            <div class="space-y-3 rounded-xl bg-slate-800/60 border border-slate-700/60 p-4">
              <div>
                <p class="text-xs text-slate-500 mb-1">Email de acceso</p>
                <p class="font-mono text-sm text-slate-200">{{ credentials.email }}</p>
              </div>
              <div>
                <p class="text-xs text-slate-500 mb-1">Contraseña temporal</p>
                <div class="flex items-center gap-2">
                  <p class="font-mono text-sm text-slate-200">{{ showTempPass ? credentials.password : '••••••••' }}</p>
                  <button class="text-slate-500 hover:text-slate-300 cursor-pointer transition-colors" @click="showTempPass = !showTempPass">
                    <Eye v-if="!showTempPass" class="h-4 w-4" />
                    <EyeOff v-else class="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            <div class="mt-4 flex gap-2">
              <button
                class="flex-1 flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-800 py-2 text-sm text-slate-300 hover:text-white transition-colors cursor-pointer"
                @click="copyPassword"
              >
                <Copy class="h-4 w-4" />
                {{ copied ? '¡Copiado!' : 'Copiar contraseña' }}
              </button>
              <button
                class="flex-1 rounded-lg bg-violet-600 py-2 text-sm font-semibold text-white hover:bg-violet-500 transition-colors cursor-pointer"
                @click="resetModal"
              >
                Listo
              </button>
            </div>
          </div>

          <!-- Form view -->
          <div v-else>
            <div class="flex items-center justify-between border-b border-slate-800/60 px-6 py-4">
              <h3 class="font-bold text-white">Nueva Cuenta CRM</h3>
              <button class="text-slate-500 hover:text-slate-300 cursor-pointer transition-colors" @click="resetModal">
                <X class="h-5 w-5" />
              </button>
            </div>

            <form class="p-6 space-y-4" @submit.prevent="createClient">
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label class="mb-1 block text-xs font-medium text-slate-400">Nombre *</label>
                  <input v-model="form.name" required
                    class="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 focus:outline-none" />
                </div>
                <div>
                  <label class="mb-1 block text-xs font-medium text-slate-400">Empresa</label>
                  <input v-model="form.company"
                    class="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 focus:outline-none" />
                </div>
              </div>

              <div>
                <label class="mb-1 block text-xs font-medium text-slate-400">Email *</label>
                <input v-model="form.email" type="email" required
                  class="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 focus:outline-none" />
              </div>

              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label class="mb-1 block text-xs font-medium text-slate-400">Teléfono</label>
                  <input v-model="form.phone"
                    class="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 focus:outline-none" />
                </div>
                <div>
                  <label class="mb-1 block text-xs font-medium text-slate-400">País</label>
                  <input v-model="form.country"
                    class="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 focus:outline-none" />
                </div>
              </div>

              <!-- Tipo de cuenta -->
              <div>
                <label class="mb-1 block text-xs font-medium text-slate-400">Tipo de cuenta</label>
                <div class="grid grid-cols-2 gap-2">
                  <button
                    v-for="opt in [{ value: 'client', label: 'Cliente', desc: 'Cuenta de un cliente externo' }, { value: 'own', label: 'Propia', desc: 'Pruebas o negocio propio' }]"
                    :key="opt.value"
                    type="button"
                    class="rounded-lg border px-3 py-2.5 text-left transition-all cursor-pointer"
                    :class="form.type === opt.value
                      ? 'border-violet-500 bg-violet-900/20 text-violet-300'
                      : 'border-slate-700 text-slate-400 hover:border-slate-600'"
                    @click="form.type = opt.value as 'own' | 'client'"
                  >
                    <p class="text-sm font-semibold">{{ opt.label }}</p>
                    <p class="text-xs opacity-70 mt-0.5">{{ opt.desc }}</p>
                  </button>
                </div>
              </div>

              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label class="mb-1 block text-xs font-medium text-slate-400">Plan</label>
                  <select v-model="form.plan"
                    class="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 focus:border-violet-500 focus:outline-none cursor-pointer">
                    <option value="starter">Starter</option>
                    <option value="pro">Pro</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </div>
                <div>
                  <label class="mb-1 block text-xs font-medium text-slate-400">Estado</label>
                  <select v-model="form.status"
                    class="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 focus:border-violet-500 focus:outline-none cursor-pointer">
                    <option value="active">Activo</option>
                    <option value="trial">Trial</option>
                  </select>
                </div>
              </div>

              <!-- Días de trial (solo si status = trial) -->
              <div v-if="form.status === 'trial'">
                <label class="mb-1 block text-xs font-medium text-slate-400">Días de trial</label>
                <div class="flex items-center gap-3">
                  <div v-if="!form.trialUnlimited" class="flex-1">
                    <input
                      v-model.number="form.trialDays"
                      type="number" min="1" max="99"
                      class="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 focus:outline-none"
                      placeholder="7"
                    />
                  </div>
                  <div v-else class="flex-1 flex items-center gap-2 rounded-lg border border-amber-700/40 bg-amber-900/10 px-3 py-2">
                    <Infinity class="h-4 w-4 text-amber-400" />
                    <span class="text-sm text-amber-300">Sin vencimiento</span>
                  </div>
                  <button
                    type="button"
                    class="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all cursor-pointer whitespace-nowrap"
                    :class="form.trialUnlimited
                      ? 'border-amber-600/60 bg-amber-900/20 text-amber-300'
                      : 'border-slate-700 text-slate-400 hover:border-slate-600'"
                    @click="form.trialUnlimited = !form.trialUnlimited"
                  >
                    <Infinity class="h-3.5 w-3.5" />
                    Sin límite
                  </button>
                </div>
              </div>

              <div>
                <label class="mb-1 block text-xs font-medium text-slate-400">Valor mensual (USD)</label>
                <input v-model.number="form.monthlyValue" type="number" min="0" step="1"
                  class="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 focus:outline-none" />
              </div>

              <div>
                <label class="mb-1 block text-xs font-medium text-slate-400">Notas</label>
                <textarea v-model="form.notes" rows="2"
                  class="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 focus:outline-none resize-none"></textarea>
              </div>

              <div v-if="formError" class="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{{ formError }}</div>

              <div class="flex gap-2 pt-1">
                <button type="button" class="flex-1 rounded-lg border border-slate-700 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors cursor-pointer" @click="resetModal">
                  Cancelar
                </button>
                <button type="submit" :disabled="submitting"
                  class="flex-1 rounded-lg bg-violet-600 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-60 disabled:cursor-not-allowed transition-colors cursor-pointer">
                  {{ submitting ? 'Creando…' : 'Crear cuenta CRM' }}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
