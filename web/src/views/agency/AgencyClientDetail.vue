<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  ArrowLeft, Building2, Mail, Phone, Globe, FileText, Edit3,
  Activity, CreditCard, X, Check, ExternalLink, RefreshCw,
  Copy, Eye, EyeOff,
} from 'lucide-vue-next';
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
  trial_ends_at: string | null;
  monthly_value: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  org_name: string | null;
}

interface OrgUser {
  id: string;
  name: string;
  email: string;
  role: string;
  created_at: string;
}

interface ActivityItem {
  id: string;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
  admin_name: string | null;
}

interface Credentials {
  email: string;
  password: string;
  organizationId: string;
  userId: string;
}

const route = useRoute();
const router = useRouter();
const id = route.params.id as string;

const client = ref<AgencyClient | null>(null);
const orgUsers = ref<OrgUser[]>([]);
const activities = ref<ActivityItem[]>([]);
const loading = ref(true);
const error = ref('');
const activeTab = ref<'crm' | 'activity' | 'billing'>('crm');

// Edit modal
const showEdit = ref(false);
const saving = ref(false);
const saveError = ref('');
const editForm = ref({
  name: '',
  company: '',
  email: '',
  phone: '',
  country: '',
  plan: 'starter' as string,
  status: 'active' as string,
  monthlyValue: 0,
  notes: '',
});

// Provision
const provisioning = ref(false);
const provisionCreds = ref<Credentials | null>(null);
const showProvisionModal = ref(false);
const showProvPass = ref(false);
const copiedProv = ref(false);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await agencyApi.get<{ client: AgencyClient; orgUsers: OrgUser[]; activities: ActivityItem[] }>(`/clients/${id}`);
    client.value = res.client;
    orgUsers.value = res.orgUsers;
    activities.value = res.activities;
    // Pre-fill edit form
    editForm.value = {
      name: res.client.name,
      company: res.client.company ?? '',
      email: res.client.email,
      phone: res.client.phone ?? '',
      country: res.client.country ?? '',
      plan: res.client.plan,
      status: res.client.status,
      monthlyValue: Number(res.client.monthly_value),
      notes: res.client.notes ?? '',
    };
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Error al cargar';
  } finally {
    loading.value = false;
  }
}

onMounted(load);

async function saveEdit() {
  saveError.value = '';
  saving.value = true;
  try {
    await agencyApi.patch(`/clients/${id}`, {
      ...editForm.value,
      monthlyValue: Number(editForm.value.monthlyValue),
      company: editForm.value.company || undefined,
      phone: editForm.value.phone || undefined,
      country: editForm.value.country || undefined,
      notes: editForm.value.notes || undefined,
    });
    showEdit.value = false;
    await load();
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : 'Error al guardar';
  } finally {
    saving.value = false;
  }
}

async function provision() {
  provisioning.value = true;
  try {
    const res = await agencyApi.post<{ organizationId: string; credentials: Credentials }>(`/clients/${id}/provision`);
    provisionCreds.value = res.credentials;
    showProvisionModal.value = true;
    await load();
  } catch (e) {
    alert(e instanceof Error ? e.message : 'Error al provisionar');
  } finally {
    provisioning.value = false;
  }
}

async function copyProvPass() {
  if (!provisionCreds.value) return;
  await navigator.clipboard.writeText(provisionCreds.value.password);
  copiedProv.value = true;
  setTimeout(() => (copiedProv.value = false), 2000);
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
  return new Date(dt).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatCurrency(v: string | number) {
  return new Intl.NumberFormat('es-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(v));
}

function formatAction(action: string) {
  const map: Record<string, string> = {
    client_created: 'Cliente creado',
    client_updated: 'Cliente actualizado',
    client_cancelled: 'Cliente cancelado',
    crm_provisioned: 'CRM provisionado',
    plan_changed: 'Plan cambiado',
  };
  return map[action] ?? action;
}

function actionDot(action: string) {
  if (action.includes('created') || action.includes('provisioned')) return 'bg-emerald-500';
  if (action.includes('cancelled')) return 'bg-red-500';
  if (action.includes('updated') || action.includes('changed')) return 'bg-violet-500';
  return 'bg-slate-500';
}

async function openCRM() {
  if (!client.value?.organization_id) {
    alert('Este cliente no tiene CRM provisionado. Usa "Provisionar CRM" primero.');
    return;
  }
  try {
    const res = await agencyApi.post<{
      token: string;
      client: { id: string; name: string; company: string | null; email: string };
    }>(`/clients/${id}/impersonate`);

    const { setToken } = await import('../../api');
    setToken(res.token);
    localStorage.setItem('crm_impersonated_client', JSON.stringify(res.client));
    window.location.href = '/dashboard';
  } catch (e) {
    alert(e instanceof Error ? e.message : 'Error al acceder al CRM');
  }
}

function roleBadge(role: string) {
  const m: Record<string, string> = { owner: 'text-violet-400', admin: 'text-blue-400', member: 'text-slate-400' };
  return m[role] ?? 'text-slate-400';
}
</script>

<template>
  <div class="space-y-5 p-4 sm:p-6">
    <!-- Back -->
    <button
      class="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
      @click="router.push('/agency/clients')"
    >
      <ArrowLeft class="h-4 w-4" />
      Clientes
    </button>

    <!-- Loading -->
    <div v-if="loading" class="space-y-4">
      <div class="h-24 rounded-xl bg-slate-800/50 animate-pulse"></div>
      <div class="h-64 rounded-xl bg-slate-800/50 animate-pulse"></div>
    </div>

    <!-- Error -->
    <div v-if="error" class="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-400 text-sm">{{ error }}</div>

    <template v-if="client">
      <!-- Header -->
      <div class="rounded-xl border border-slate-800/60 bg-slate-900/60 p-6">
        <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div class="flex items-start gap-4">
            <div class="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 text-xl font-bold text-white shadow-lg shadow-violet-900/50">
              {{ client.name.charAt(0).toUpperCase() }}
            </div>
            <div>
              <h2 class="text-2xl font-bold text-white">{{ client.name }}</h2>
              <p v-if="client.company" class="text-slate-400 text-sm mt-0.5">{{ client.company }}</p>
              <div class="flex flex-wrap gap-2 mt-2">
                <span class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium" :class="planBadge(client.plan)">
                  {{ planLabel(client.plan) }}
                </span>
                <span class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium" :class="statusBadge(client.status)">
                  {{ statusLabel(client.status) }}
                </span>
                <span class="text-xs text-slate-500 flex items-center">
                  {{ formatCurrency(client.monthly_value) }}/mes
                </span>
              </div>
            </div>
          </div>
          <div class="flex gap-2 flex-shrink-0">
            <button
              class="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-300 hover:text-white hover:border-slate-600 transition-all cursor-pointer"
              @click="showEdit = true"
            >
              <Edit3 class="h-4 w-4" />
              Editar
            </button>
            <button
              v-if="client.organization_id"
              class="flex items-center gap-2 rounded-lg border border-indigo-700/60 bg-indigo-900/30 px-3 py-2 text-sm text-indigo-300 hover:bg-indigo-900/50 transition-all cursor-pointer"
              @click="openCRM"
            >
              <ExternalLink class="h-4 w-4" />
              Acceder al CRM
            </button>
          </div>
        </div>
      </div>

      <!-- Body: left + right -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <!-- Left: client details -->
        <div class="rounded-xl border border-slate-800/60 bg-slate-900/60 p-5 space-y-4">
          <h3 class="text-sm font-semibold text-slate-400 uppercase tracking-wide">Información</h3>

          <div class="space-y-3 text-sm">
            <div class="flex items-start gap-2.5">
              <Mail class="h-4 w-4 text-slate-500 mt-0.5 flex-shrink-0" />
              <span class="text-slate-300 break-all">{{ client.email }}</span>
            </div>
            <div v-if="client.phone" class="flex items-start gap-2.5">
              <Phone class="h-4 w-4 text-slate-500 mt-0.5 flex-shrink-0" />
              <span class="text-slate-300">{{ client.phone }}</span>
            </div>
            <div v-if="client.country" class="flex items-start gap-2.5">
              <Globe class="h-4 w-4 text-slate-500 mt-0.5 flex-shrink-0" />
              <span class="text-slate-300">{{ client.country }}</span>
            </div>
            <div v-if="client.notes" class="flex items-start gap-2.5">
              <FileText class="h-4 w-4 text-slate-500 mt-0.5 flex-shrink-0" />
              <span class="text-slate-400 text-xs leading-relaxed">{{ client.notes }}</span>
            </div>
          </div>

          <div class="pt-3 border-t border-slate-800/60 space-y-2 text-xs text-slate-500">
            <div class="flex justify-between">
              <span>Creado</span>
              <span class="text-slate-400">{{ formatDate(client.created_at) }}</span>
            </div>
            <div class="flex justify-between">
              <span>Actualizado</span>
              <span class="text-slate-400">{{ formatDate(client.updated_at) }}</span>
            </div>
            <div v-if="client.trial_ends_at" class="flex justify-between">
              <span>Trial hasta</span>
              <span class="text-amber-400">{{ formatDate(client.trial_ends_at) }}</span>
            </div>
          </div>
        </div>

        <!-- Right: tabs -->
        <div class="lg:col-span-2 rounded-xl border border-slate-800/60 bg-slate-900/60 overflow-hidden">
          <!-- Tab bar -->
          <div class="flex border-b border-slate-800/60">
            <button
              v-for="tab in [{ key: 'crm', label: 'CRM', icon: Building2 }, { key: 'activity', label: 'Actividad', icon: Activity }, { key: 'billing', label: 'Facturación', icon: CreditCard }]"
              :key="tab.key"
              class="flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors cursor-pointer border-b-2"
              :class="activeTab === tab.key
                ? 'border-violet-500 text-violet-300 bg-violet-900/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'"
              @click="activeTab = tab.key as typeof activeTab"
            >
              <component :is="tab.icon" class="h-4 w-4" />
              {{ tab.label }}
            </button>
          </div>

          <!-- CRM tab -->
          <div v-if="activeTab === 'crm'" class="p-5">
            <div v-if="!client.organization_id" class="py-6 text-center">
              <Building2 class="mx-auto h-10 w-10 text-slate-700 mb-3" />
              <p class="text-slate-500 text-sm mb-4">No hay organización CRM vinculada</p>
              <button
                :disabled="provisioning"
                class="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-60 transition-colors cursor-pointer"
                @click="provision"
              >
                <RefreshCw class="h-4 w-4" :class="provisioning ? 'animate-spin' : ''" />
                {{ provisioning ? 'Provisionando…' : 'Provisionar CRM' }}
              </button>
            </div>

            <div v-else class="space-y-5">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-xs text-slate-500 uppercase tracking-wide font-semibold mb-1">Organización</p>
                  <p class="text-slate-200 font-medium">{{ client.org_name ?? 'Sin nombre' }}</p>
                  <p class="text-xs text-slate-500 font-mono mt-0.5">{{ client.organization_id }}</p>
                </div>
                <button
                  :disabled="provisioning"
                  class="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 hover:border-slate-600 transition-all cursor-pointer disabled:opacity-60"
                  @click="provision"
                >
                  <RefreshCw class="h-3 w-3" :class="provisioning ? 'animate-spin' : ''" />
                  Re-provisionar
                </button>
              </div>

              <!-- Users list -->
              <div>
                <p class="text-xs text-slate-500 uppercase tracking-wide font-semibold mb-3">
                  Usuarios ({{ orgUsers.length }})
                </p>
                <div v-if="orgUsers.length === 0" class="text-sm text-slate-600 italic">Sin usuarios</div>
                <div v-else class="space-y-2">
                  <div
                    v-for="u in orgUsers"
                    :key="u.id"
                    class="flex items-center gap-3 rounded-lg bg-slate-800/40 border border-slate-700/40 px-3 py-2.5"
                  >
                    <div class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-bold text-slate-200">
                      {{ u.name.charAt(0).toUpperCase() }}
                    </div>
                    <div class="min-w-0 flex-1">
                      <p class="text-sm font-medium text-slate-200 truncate">{{ u.name }}</p>
                      <p class="text-xs text-slate-500 truncate">{{ u.email }}</p>
                    </div>
                    <span class="text-xs font-medium flex-shrink-0" :class="roleBadge(u.role)">{{ u.role }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Activity tab -->
          <div v-if="activeTab === 'activity'" class="p-5">
            <div v-if="activities.length === 0" class="py-8 text-center text-slate-500 text-sm">
              Sin actividad registrada
            </div>
            <div v-else class="relative">
              <div class="absolute left-2 top-0 bottom-0 w-px bg-slate-800"></div>
              <div class="space-y-4 pl-8">
                <div v-for="item in activities" :key="item.id" class="relative">
                  <div class="absolute -left-6 top-1 flex h-4 w-4 items-center justify-center">
                    <div class="h-2 w-2 rounded-full" :class="actionDot(item.action)"></div>
                  </div>
                  <p class="text-sm font-medium text-slate-300">{{ formatAction(item.action) }}</p>
                  <p class="text-xs text-slate-500 mt-0.5">
                    {{ formatDate(item.created_at) }}
                    <span v-if="item.admin_name"> · {{ item.admin_name }}</span>
                  </p>
                  <div v-if="item.details && Object.keys(item.details).length > 0" class="mt-1.5 text-xs text-slate-600 font-mono bg-slate-800/50 rounded px-2 py-1">
                    {{ JSON.stringify(item.details) }}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Billing tab -->
          <div v-if="activeTab === 'billing'" class="p-5 space-y-5">
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div class="rounded-lg bg-slate-800/40 border border-slate-700/40 p-4">
                <p class="text-xs text-slate-500 uppercase tracking-wide font-semibold mb-2">Plan Actual</p>
                <span class="inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold" :class="planBadge(client.plan)">
                  {{ planLabel(client.plan) }}
                </span>
              </div>
              <div class="rounded-lg bg-slate-800/40 border border-slate-700/40 p-4">
                <p class="text-xs text-slate-500 uppercase tracking-wide font-semibold mb-2">MRR</p>
                <p class="text-2xl font-bold text-emerald-400">{{ formatCurrency(client.monthly_value) }}</p>
                <p class="text-xs text-slate-600 mt-0.5">por mes</p>
              </div>
            </div>

            <div>
              <p class="text-xs text-slate-500 uppercase tracking-wide font-semibold mb-3">Cambiar Plan</p>
              <div class="grid grid-cols-3 gap-2">
                <button
                  v-for="plan in ['starter', 'pro', 'enterprise']"
                  :key="plan"
                  class="rounded-lg border py-2.5 text-sm font-medium transition-all cursor-pointer"
                  :class="client.plan === plan
                    ? 'border-violet-500 bg-violet-900/20 text-violet-300'
                    : 'border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200'"
                  @click="editForm.plan = plan; saveEdit()"
                >
                  {{ planLabel(plan) }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Edit Modal -->
    <Teleport to="body">
      <div v-if="showEdit" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="showEdit = false"></div>
        <div class="relative z-10 w-full max-w-lg rounded-2xl border border-slate-700/60 bg-slate-900 shadow-2xl">
          <div class="flex items-center justify-between border-b border-slate-800/60 px-6 py-4">
            <h3 class="font-bold text-white">Editar Cliente</h3>
            <button class="text-slate-500 hover:text-slate-300 cursor-pointer" @click="showEdit = false">
              <X class="h-5 w-5" />
            </button>
          </div>
          <form class="p-6 space-y-4 max-h-[70vh] overflow-y-auto" @submit.prevent="saveEdit">
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label class="mb-1 block text-xs font-medium text-slate-400">Nombre</label>
                <input v-model="editForm.name" required class="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 focus:border-violet-500 focus:outline-none" />
              </div>
              <div>
                <label class="mb-1 block text-xs font-medium text-slate-400">Empresa</label>
                <input v-model="editForm.company" class="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 focus:border-violet-500 focus:outline-none" />
              </div>
            </div>
            <div>
              <label class="mb-1 block text-xs font-medium text-slate-400">Email</label>
              <input v-model="editForm.email" type="email" required class="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 focus:border-violet-500 focus:outline-none" />
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="mb-1 block text-xs font-medium text-slate-400">Teléfono</label>
                <input v-model="editForm.phone" class="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 focus:border-violet-500 focus:outline-none" />
              </div>
              <div>
                <label class="mb-1 block text-xs font-medium text-slate-400">País</label>
                <input v-model="editForm.country" class="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 focus:border-violet-500 focus:outline-none" />
              </div>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="mb-1 block text-xs font-medium text-slate-400">Plan</label>
                <select v-model="editForm.plan" class="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 focus:border-violet-500 focus:outline-none cursor-pointer">
                  <option value="starter">Starter</option>
                  <option value="pro">Pro</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
              <div>
                <label class="mb-1 block text-xs font-medium text-slate-400">Estado</label>
                <select v-model="editForm.status" class="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 focus:border-violet-500 focus:outline-none cursor-pointer">
                  <option value="active">Activo</option>
                  <option value="trial">Trial</option>
                  <option value="suspended">Suspendido</option>
                  <option value="cancelled">Cancelado</option>
                </select>
              </div>
            </div>
            <div>
              <label class="mb-1 block text-xs font-medium text-slate-400">Valor mensual (USD)</label>
              <input v-model.number="editForm.monthlyValue" type="number" min="0" class="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 focus:border-violet-500 focus:outline-none" />
            </div>
            <div>
              <label class="mb-1 block text-xs font-medium text-slate-400">Notas</label>
              <textarea v-model="editForm.notes" rows="3" class="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 focus:border-violet-500 focus:outline-none resize-none"></textarea>
            </div>
            <div v-if="saveError" class="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{{ saveError }}</div>
            <div class="flex gap-2 pt-1">
              <button type="button" class="flex-1 rounded-lg border border-slate-700 py-2 text-sm text-slate-400 hover:text-slate-200 cursor-pointer" @click="showEdit = false">Cancelar</button>
              <button type="submit" :disabled="saving" class="flex-1 rounded-lg bg-violet-600 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-60 cursor-pointer transition-colors">
                {{ saving ? 'Guardando…' : 'Guardar' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>

    <!-- Provision credentials modal -->
    <Teleport to="body">
      <div v-if="showProvisionModal && provisionCreds" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="showProvisionModal = false"></div>
        <div class="relative z-10 w-full max-w-sm rounded-2xl border border-slate-700/60 bg-slate-900 shadow-2xl p-6">
          <div class="flex items-center gap-3 mb-5">
            <div class="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20 border border-emerald-500/30">
              <Check class="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <h3 class="font-bold text-white">CRM provisionado</h3>
              <p class="text-xs text-slate-400">Credenciales actualizadas</p>
            </div>
          </div>
          <div class="space-y-3 rounded-xl bg-slate-800/60 border border-slate-700/60 p-4 mb-4">
            <div>
              <p class="text-xs text-slate-500 mb-1">Email</p>
              <p class="font-mono text-sm text-slate-200">{{ provisionCreds.email }}</p>
            </div>
            <div>
              <p class="text-xs text-slate-500 mb-1">Contraseña temporal</p>
              <div class="flex items-center gap-2">
                <p class="font-mono text-sm text-slate-200">{{ showProvPass ? provisionCreds.password : '••••••••' }}</p>
                <button class="text-slate-500 hover:text-slate-300 cursor-pointer" @click="showProvPass = !showProvPass">
                  <Eye v-if="!showProvPass" class="h-4 w-4" />
                  <EyeOff v-else class="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
          <div class="flex gap-2">
            <button class="flex-1 flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-800 py-2 text-sm text-slate-300 hover:text-white cursor-pointer" @click="copyProvPass">
              <Copy class="h-4 w-4" />
              {{ copiedProv ? '¡Copiado!' : 'Copiar' }}
            </button>
            <button class="flex-1 rounded-lg bg-violet-600 py-2 text-sm font-semibold text-white hover:bg-violet-500 cursor-pointer" @click="showProvisionModal = false">Listo</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
