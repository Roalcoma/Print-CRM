<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  ArrowLeft, Building2, Mail, Phone, Globe, FileText, Edit3,
  Activity, CreditCard, X, Check, ExternalLink, RefreshCw,
  Copy, Eye, EyeOff, Plus, Gift, Trash2, ChevronDown, Clock,
  ShieldCheck, User, Infinity,
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
  plan_id: string | null;
  plan_name: string | null;
  plan_price: string | null;
  plan_max_users: number | null;
  status: string;
  type: 'own' | 'client';
  trial_ends_at: string | null;
  monthly_value: string;
  notes: string | null;
  courtesy_extra_users: number;
  courtesy_full_access: boolean;
  created_at: string;
  updated_at: string;
  org_name: string | null;
}

interface Payment {
  id: string;
  client_id: string;
  amount_usd: string;
  status: 'pending' | 'paid' | 'overdue' | 'cancelled';
  method: string | null;
  period_start: string | null;
  period_end: string | null;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
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

interface AuditEntry {
  id: string;
  user_id: string | null;
  user_name: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  entity_name: string | null;
  details: Record<string, unknown> | null;
  ip: string | null;
  created_at: string;
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
const activeTab = ref<'crm' | 'activity' | 'billing' | 'audit'>('crm');

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
  type: 'client' as 'own' | 'client',
  monthlyValue: 0,
  notes: '',
  trialUnlimited: false,
  trialDays: 7,
});

// Audit
const auditEntries = ref<AuditEntry[]>([]);
const auditLoading = ref(false);
const auditTotal = ref(0);
const auditPage = ref(1);
const auditActionFilter = ref('');

// Payments
const payments = ref<Payment[]>([]);
const showPaymentModal = ref(false);
const savingPayment = ref(false);
const paymentForm = ref({
  amountUsd: 0,
  status: 'paid' as Payment['status'],
  method: '',
  periodStart: '',
  periodEnd: '',
  notes: '',
});

// Courtesy
const savingCourtesy = ref(false);
const courtesyForm = ref({ courtesyExtraUsers: 0, courtesyFullAccess: false });

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
    const trialDaysOverride = (res.client as AgencyClient & { trial_days_override?: number | null }).trial_days_override;
    editForm.value = {
      name: res.client.name,
      company: res.client.company ?? '',
      email: res.client.email,
      phone: res.client.phone ?? '',
      country: res.client.country ?? '',
      plan: res.client.plan,
      status: res.client.status,
      type: res.client.type,
      monthlyValue: Number(res.client.monthly_value),
      notes: res.client.notes ?? '',
      trialUnlimited: trialDaysOverride === 0,
      trialDays: trialDaysOverride ?? 7,
    };
    courtesyForm.value = {
      courtesyExtraUsers: res.client.courtesy_extra_users ?? 0,
      courtesyFullAccess: res.client.courtesy_full_access ?? false,
    };
    // Load payments separately
    const pmRes = await agencyApi.get<{ payments: Payment[] }>(`/clients/${id}/payments`);
    payments.value = pmRes.payments;
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Error al cargar';
  } finally {
    loading.value = false;
  }
}

onMounted(load);

async function loadAudit() {
  auditLoading.value = true;
  try {
    const params = new URLSearchParams({ page: String(auditPage.value), limit: '50' });
    if (auditActionFilter.value) params.set('action', auditActionFilter.value);
    const res = await agencyApi.get<{ entries: AuditEntry[]; total: number }>(`/clients/${id}/audit?${params}`);
    auditEntries.value = res.entries;
    auditTotal.value = res.total;
  } catch { /* silencioso */ } finally {
    auditLoading.value = false;
  }
}

async function saveEdit() {
  saveError.value = '';
  saving.value = true;
  try {
    const trialDaysOverride = editForm.value.trialUnlimited ? 0 : editForm.value.trialDays;
    const updated = await agencyApi.patch<AgencyClient>(`/clients/${id}`, {
      name: editForm.value.name,
      company: editForm.value.company || undefined,
      email: editForm.value.email,
      phone: editForm.value.phone || undefined,
      country: editForm.value.country || undefined,
      plan: editForm.value.plan,
      status: editForm.value.status,
      type: editForm.value.type,
      monthlyValue: Number(editForm.value.monthlyValue),
      notes: editForm.value.notes || undefined,
      trialDaysOverride,
    });
    // Actualiza el cliente en memoria sin recargar (evita el flash del skeleton)
    client.value = { ...client.value!, ...updated };
    showEdit.value = false;
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : 'Error al guardar';
  } finally {
    saving.value = false;
  }
}

async function addPayment() {
  savingPayment.value = true;
  try {
    const p = await agencyApi.post<Payment>(`/clients/${id}/payments`, {
      ...paymentForm.value,
      amountUsd: Number(paymentForm.value.amountUsd),
      periodStart: paymentForm.value.periodStart || undefined,
      periodEnd: paymentForm.value.periodEnd || undefined,
      notes: paymentForm.value.notes || undefined,
    });
    payments.value = [p, ...payments.value];
    showPaymentModal.value = false;
    paymentForm.value = { amountUsd: 0, status: 'paid', method: '', periodStart: '', periodEnd: '', notes: '' };
  } catch (e) {
    alert(e instanceof Error ? e.message : 'Error al registrar pago');
  } finally {
    savingPayment.value = false;
  }
}

async function deletePayment(pid: string) {
  if (!confirm('¿Eliminar este pago?')) return;
  await agencyApi.del(`/clients/${id}/payments/${pid}`);
  payments.value = payments.value.filter(p => p.id !== pid);
}

async function updatePaymentStatus(p: Payment, status: Payment['status']) {
  const updated = await agencyApi.patch<Payment>(`/clients/${id}/payments/${p.id}`, {
    status,
    paidAt: status === 'paid' ? new Date().toISOString() : undefined,
  });
  payments.value = payments.value.map(x => x.id === updated.id ? updated : x);
}

async function saveCourtesy() {
  savingCourtesy.value = true;
  try {
    const updated = await agencyApi.patch<AgencyClient>(`/clients/${id}/courtesy`, courtesyForm.value);
    client.value = { ...client.value!, ...updated };
  } catch (e) {
    alert(e instanceof Error ? e.message : 'Error al guardar regalía');
  } finally {
    savingCourtesy.value = false;
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

const PAYMENT_STATUS: Record<string, { label: string; cls: string }> = {
  paid:      { label: 'Pagado',    cls: 'bg-emerald-900/60 text-emerald-300 border-emerald-700/60' },
  pending:   { label: 'Pendiente', cls: 'bg-amber-900/60 text-amber-300 border-amber-700/60' },
  overdue:   { label: 'Vencido',   cls: 'bg-red-900/60 text-red-300 border-red-700/60' },
  cancelled: { label: 'Cancelado', cls: 'bg-slate-700/60 text-slate-400 border-slate-600/60' },
};

function roleBadge(role: string) {
  const m: Record<string, string> = { owner: 'text-violet-400', admin: 'text-blue-400', member: 'text-slate-400' };
  return m[role] ?? 'text-slate-400';
}

const AUDIT_ACTION_LABELS: Record<string, string> = {
  login: 'Inicio de sesión',
  'contact.created': 'Contacto creado',
  'contact.updated': 'Contacto actualizado',
  'contact.deleted': 'Contacto eliminado',
  'opportunity.created': 'Oportunidad creada',
  'opportunity.updated': 'Oportunidad actualizada',
  'opportunity.stage_changed': 'Etapa cambiada',
  'opportunity.deleted': 'Oportunidad eliminada',
  'task.created': 'Tarea creada',
  'task.updated': 'Tarea actualizada',
  'task.status_changed': 'Estado de tarea cambiado',
  'task.deleted': 'Tarea eliminada',
  'user.created': 'Usuario creado',
  'user.updated': 'Usuario actualizado',
  'user.deleted': 'Usuario eliminado',
};

function auditActionLabel(action: string) {
  return AUDIT_ACTION_LABELS[action] ?? action;
}

function auditActionDot(action: string) {
  if (action.includes('created') || action === 'login') return 'bg-emerald-500';
  if (action.includes('deleted')) return 'bg-red-500';
  if (action.includes('updated') || action.includes('changed')) return 'bg-blue-500';
  return 'bg-slate-500';
}

function auditActionBadge(action: string) {
  if (action.includes('created') || action === 'login') return 'bg-emerald-900/50 text-emerald-300 border-emerald-700/50';
  if (action.includes('deleted')) return 'bg-red-900/50 text-red-300 border-red-700/50';
  if (action.includes('updated') || action.includes('changed')) return 'bg-blue-900/50 text-blue-300 border-blue-700/50';
  return 'bg-slate-800/60 text-slate-400 border-slate-700/60';
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
      Cuentas CRM
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
                <span
                  class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium"
                  :class="client.type === 'own'
                    ? 'bg-sky-900/60 text-sky-300 border-sky-700/60'
                    : 'bg-slate-700/60 text-slate-300 border-slate-600/60'"
                >
                  {{ client.type === 'own' ? 'Propia' : 'Cliente' }}
                </span>
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
          <div class="flex border-b border-slate-800/60 overflow-x-auto">
            <button
              v-for="tab in [
                { key: 'crm', label: 'CRM', icon: Building2 },
                { key: 'activity', label: 'Actividad', icon: Activity },
                { key: 'billing', label: 'Facturación', icon: CreditCard },
                { key: 'audit', label: 'Auditoría', icon: ShieldCheck },
              ]"
              :key="tab.key"
              class="flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors cursor-pointer border-b-2 whitespace-nowrap"
              :class="activeTab === tab.key
                ? 'border-violet-500 text-violet-300 bg-violet-900/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'"
              @click="activeTab = tab.key as typeof activeTab; if (tab.key === 'audit' && auditEntries.length === 0) loadAudit()"
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

          <!-- Audit tab -->
          <div v-if="activeTab === 'audit'" class="p-5">
            <div class="flex items-center justify-between mb-4 gap-3 flex-wrap">
              <p class="text-xs text-slate-500 uppercase tracking-wide font-semibold">Registro de auditoría del CRM</p>
              <div class="flex items-center gap-2">
                <select
                  v-model="auditActionFilter"
                  class="rounded-lg border border-slate-700 bg-slate-800/60 px-2 py-1.5 text-xs text-slate-300 focus:border-violet-500 focus:outline-none cursor-pointer"
                  @change="auditPage = 1; loadAudit()"
                >
                  <option value="">Todas las acciones</option>
                  <option value="login">Login</option>
                  <option value="contact.created">Contacto creado</option>
                  <option value="contact.updated">Contacto actualizado</option>
                  <option value="contact.deleted">Contacto eliminado</option>
                  <option value="opportunity.created">Oportunidad creada</option>
                  <option value="opportunity.stage_changed">Etapa cambiada</option>
                  <option value="opportunity.deleted">Oportunidad eliminada</option>
                  <option value="task.created">Tarea creada</option>
                  <option value="task.status_changed">Estado de tarea cambiado</option>
                  <option value="task.deleted">Tarea eliminada</option>
                </select>
                <button
                  class="rounded-lg border border-slate-700 p-1.5 text-slate-400 hover:text-slate-200 hover:border-slate-600 transition-all cursor-pointer"
                  title="Actualizar"
                  @click="loadAudit()"
                ><RefreshCw class="h-3.5 w-3.5" :class="auditLoading ? 'animate-spin' : ''" /></button>
              </div>
            </div>

            <div v-if="!client.organization_id" class="py-8 text-center text-slate-500 text-sm">
              Este cliente no tiene CRM provisionado. Sin datos de auditoría.
            </div>

            <div v-else-if="auditLoading && auditEntries.length === 0" class="space-y-2">
              <div v-for="i in 5" :key="i" class="h-12 rounded-lg bg-slate-800/40 animate-pulse"></div>
            </div>

            <div v-else-if="auditEntries.length === 0" class="py-8 text-center">
              <ShieldCheck class="mx-auto h-10 w-10 text-slate-700 mb-3" />
              <p class="text-slate-500 text-sm">Sin registros de auditoría aún</p>
            </div>

            <div v-else class="space-y-1.5">
              <div
                v-for="entry in auditEntries"
                :key="entry.id"
                class="flex items-start gap-3 rounded-lg bg-slate-800/30 border border-slate-700/30 px-3 py-2.5 text-xs"
              >
                <div class="flex-shrink-0 mt-0.5">
                  <div class="h-2 w-2 rounded-full mt-1" :class="auditActionDot(entry.action)"></div>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span
                      class="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold"
                      :class="auditActionBadge(entry.action)"
                    >{{ auditActionLabel(entry.action) }}</span>
                    <span v-if="entry.entity_name" class="text-slate-300 font-medium truncate max-w-[180px]">{{ entry.entity_name }}</span>
                  </div>
                  <div class="flex items-center gap-3 mt-1 text-slate-500 flex-wrap">
                    <span v-if="entry.user_name" class="flex items-center gap-1">
                      <User class="h-3 w-3" />{{ entry.user_name }}
                    </span>
                    <span class="flex items-center gap-1">
                      <Clock class="h-3 w-3" />{{ formatDate(entry.created_at) }}
                    </span>
                    <span v-if="entry.ip" class="font-mono text-[10px]">{{ entry.ip }}</span>
                  </div>
                  <div v-if="entry.details && Object.keys(entry.details).length > 0" class="mt-1 font-mono text-[10px] text-slate-600 bg-slate-800/50 rounded px-2 py-0.5 truncate">
                    {{ JSON.stringify(entry.details) }}
                  </div>
                </div>
              </div>

              <!-- Pagination -->
              <div v-if="auditTotal > 50" class="flex items-center justify-between pt-3">
                <span class="text-xs text-slate-500">{{ auditTotal }} registros en total</span>
                <div class="flex gap-2">
                  <button
                    :disabled="auditPage === 1"
                    class="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 disabled:opacity-40 cursor-pointer transition-colors"
                    @click="auditPage--; loadAudit()"
                  >Anterior</button>
                  <button
                    :disabled="auditPage * 50 >= auditTotal"
                    class="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 disabled:opacity-40 cursor-pointer transition-colors"
                    @click="auditPage++; loadAudit()"
                  >Siguiente</button>
                </div>
              </div>
            </div>
          </div>

          <!-- Billing tab -->
          <div v-if="activeTab === 'billing'" class="p-5 space-y-6">

            <!-- Plan + stats -->
            <div class="grid grid-cols-2 gap-4">
              <div class="rounded-lg bg-slate-800/40 border border-slate-700/40 p-4">
                <p class="text-xs text-slate-500 uppercase tracking-wide font-semibold mb-2">Plan</p>
                <p class="text-base font-bold text-white">{{ client.plan_name ?? planLabel(client.plan) }}</p>
                <p class="text-xs text-slate-500 mt-0.5">
                  ${{ client.plan_price ?? client.monthly_value }}/mes ·
                  {{ client.plan_max_users != null
                    ? (client.plan_max_users >= 999 ? 'usuarios ilimitados' : `owner + ${client.plan_max_users} usuario${client.plan_max_users !== 1 ? 's' : ''}`)
                    : '' }}
                </p>
              </div>
              <div class="rounded-lg bg-slate-800/40 border border-slate-700/40 p-4">
                <p class="text-xs text-slate-500 uppercase tracking-wide font-semibold mb-2">Pagos registrados</p>
                <p class="text-2xl font-bold text-emerald-400">
                  {{ formatCurrency(payments.filter(p => p.status === 'paid').reduce((s, p) => s + Number(p.amount_usd), 0)) }}
                </p>
                <p class="text-xs text-slate-500 mt-0.5">{{ payments.filter(p => p.status === 'paid').length }} pago(s)</p>
              </div>
            </div>

            <!-- Regalías -->
            <div class="rounded-lg border border-violet-700/30 bg-violet-900/10 p-4 space-y-3">
              <div class="flex items-center gap-2">
                <Gift class="h-4 w-4 text-violet-400" />
                <p class="text-sm font-semibold text-violet-300">Regalías</p>
              </div>
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="mb-1 block text-xs text-slate-400">Usuarios extra de cortesía</label>
                  <input v-model.number="courtesyForm.courtesyExtraUsers" type="number" min="0"
                    class="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 focus:border-violet-500 focus:outline-none" />
                </div>
                <div class="flex flex-col justify-end">
                  <label class="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" v-model="courtesyForm.courtesyFullAccess" class="rounded border-slate-600 bg-slate-800 accent-violet-500 h-4 w-4" />
                    <span class="text-sm text-slate-300">Acceso completo al CRM</span>
                  </label>
                </div>
              </div>
              <button
                :disabled="savingCourtesy"
                class="rounded-lg bg-violet-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-60 transition-colors cursor-pointer"
                @click="saveCourtesy"
              >{{ savingCourtesy ? 'Guardando…' : 'Guardar regalías' }}</button>
            </div>

            <!-- Historial de pagos -->
            <div>
              <div class="flex items-center justify-between mb-3">
                <p class="text-xs text-slate-500 uppercase tracking-wide font-semibold">Historial de pagos</p>
                <button
                  class="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500 transition-colors cursor-pointer"
                  @click="showPaymentModal = true"
                >
                  <Plus class="h-3.5 w-3.5" />
                  Registrar pago
                </button>
              </div>

              <div v-if="payments.length === 0" class="py-6 text-center text-slate-500 text-sm">
                Sin pagos registrados aún
              </div>

              <div v-else class="space-y-2">
                <div
                  v-for="p in payments"
                  :key="p.id"
                  class="flex items-center gap-3 rounded-lg bg-slate-800/40 border border-slate-700/40 px-3 py-2.5"
                >
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                      <span class="text-sm font-semibold text-white">${{ Number(p.amount_usd).toFixed(2) }}</span>
                      <span
                        class="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold"
                        :class="PAYMENT_STATUS[p.status]?.cls ?? ''"
                      >{{ PAYMENT_STATUS[p.status]?.label }}</span>
                    </div>
                    <p class="text-xs text-slate-500 mt-0.5">
                      {{ formatDate(p.created_at) }}
                      <span v-if="p.method"> · {{ p.method }}</span>
                      <span v-if="p.period_start"> · {{ p.period_start }} → {{ p.period_end }}</span>
                    </p>
                    <p v-if="p.notes" class="text-xs text-slate-600 mt-0.5 italic">{{ p.notes }}</p>
                  </div>
                  <div class="flex items-center gap-1 flex-shrink-0">
                    <button
                      v-if="p.status !== 'paid'"
                      class="rounded p-1 text-slate-500 hover:text-emerald-400 hover:bg-slate-700 cursor-pointer transition-colors"
                      title="Marcar como pagado"
                      @click="updatePaymentStatus(p, 'paid')"
                    ><Check class="h-3.5 w-3.5" /></button>
                    <button
                      v-if="p.status === 'pending'"
                      class="rounded p-1 text-slate-500 hover:text-red-400 hover:bg-slate-700 cursor-pointer transition-colors"
                      title="Marcar como vencido"
                      @click="updatePaymentStatus(p, 'overdue')"
                    ><ChevronDown class="h-3.5 w-3.5" /></button>
                    <button
                      class="rounded p-1 text-slate-500 hover:text-red-400 hover:bg-slate-700 cursor-pointer transition-colors"
                      title="Eliminar"
                      @click="deletePayment(p.id)"
                    ><Trash2 class="h-3.5 w-3.5" /></button>
                  </div>
                </div>
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
            <h3 class="font-bold text-white">Editar Cuenta CRM</h3>
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
            <!-- Tipo de cuenta -->
            <div>
              <label class="mb-1 block text-xs font-medium text-slate-400">Tipo de cuenta</label>
              <div class="grid grid-cols-2 gap-2">
                <button
                  v-for="opt in [{ value: 'client', label: 'Cliente' }, { value: 'own', label: 'Propia' }]"
                  :key="opt.value"
                  type="button"
                  class="rounded-lg border px-3 py-2 text-sm font-medium transition-all cursor-pointer"
                  :class="editForm.type === opt.value
                    ? 'border-violet-500 bg-violet-900/20 text-violet-300'
                    : 'border-slate-700 text-slate-400 hover:border-slate-600'"
                  @click="editForm.type = opt.value as 'own' | 'client'"
                >{{ opt.label }}</button>
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

            <!-- Días de trial -->
            <div>
              <label class="mb-1 block text-xs font-medium text-slate-400">Días de trial</label>
              <div class="flex items-center gap-3">
                <div v-if="!editForm.trialUnlimited" class="flex-1">
                  <input
                    v-model.number="editForm.trialDays"
                    type="number" min="1" max="99"
                    class="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 focus:border-violet-500 focus:outline-none"
                    placeholder="7"
                  />
                </div>
                <div v-else class="flex-1 flex items-center gap-2 rounded-lg border border-amber-700/40 bg-amber-900/10 px-3 py-2">
                  <Infinity class="h-4 w-4 text-amber-400" />
                  <span class="text-sm text-amber-300">Ilimitado</span>
                </div>
                <button
                  type="button"
                  class="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all cursor-pointer whitespace-nowrap"
                  :class="editForm.trialUnlimited
                    ? 'border-amber-600/60 bg-amber-900/20 text-amber-300'
                    : 'border-slate-700 text-slate-400 hover:border-slate-600'"
                  @click="editForm.trialUnlimited = !editForm.trialUnlimited"
                >
                  <Infinity class="h-3.5 w-3.5" />
                  Sin límite
                </button>
              </div>
              <p class="mt-1 text-[10px] text-slate-500">Se aplica cuando el estado es "Trial". 0 = sin límite de tiempo.</p>
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

    <!-- Add payment modal -->
    <Teleport to="body">
      <div v-if="showPaymentModal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="showPaymentModal = false"></div>
        <div class="relative z-10 w-full max-w-md rounded-2xl border border-slate-700/60 bg-slate-900 shadow-2xl">
          <div class="flex items-center justify-between border-b border-slate-800/60 px-6 py-4">
            <h3 class="font-bold text-white">Registrar pago</h3>
            <button class="text-slate-500 hover:text-slate-300 cursor-pointer" @click="showPaymentModal = false">
              <X class="h-5 w-5" />
            </button>
          </div>
          <form class="p-6 space-y-4" @submit.prevent="addPayment">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="mb-1 block text-xs font-medium text-slate-400">Monto (USD) *</label>
                <div class="relative">
                  <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                  <input v-model.number="paymentForm.amountUsd" type="number" min="0" step="0.01" required
                    class="w-full rounded-lg border border-slate-700 bg-slate-800/60 pl-7 pr-3 py-2 text-sm text-slate-200 focus:border-violet-500 focus:outline-none" />
                </div>
              </div>
              <div>
                <label class="mb-1 block text-xs font-medium text-slate-400">Estado</label>
                <select v-model="paymentForm.status"
                  class="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 focus:border-violet-500 focus:outline-none cursor-pointer">
                  <option value="paid">Pagado</option>
                  <option value="pending">Pendiente</option>
                  <option value="overdue">Vencido</option>
                </select>
              </div>
            </div>
            <div>
              <label class="mb-1 block text-xs font-medium text-slate-400">Método de pago</label>
              <input v-model="paymentForm.method" placeholder="Transferencia, efectivo, Zelle…"
                class="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 focus:border-violet-500 focus:outline-none" />
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="mb-1 block text-xs font-medium text-slate-400">Período desde</label>
                <input v-model="paymentForm.periodStart" type="date"
                  class="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 focus:border-violet-500 focus:outline-none" />
              </div>
              <div>
                <label class="mb-1 block text-xs font-medium text-slate-400">Período hasta</label>
                <input v-model="paymentForm.periodEnd" type="date"
                  class="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 focus:border-violet-500 focus:outline-none" />
              </div>
            </div>
            <div>
              <label class="mb-1 block text-xs font-medium text-slate-400">Notas</label>
              <textarea v-model="paymentForm.notes" rows="2" placeholder="Referencia, observaciones…"
                class="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 focus:border-violet-500 focus:outline-none resize-none"></textarea>
            </div>
            <div class="flex gap-2 pt-1">
              <button type="button" class="flex-1 rounded-lg border border-slate-700 py-2 text-sm text-slate-400 hover:text-slate-200 cursor-pointer" @click="showPaymentModal = false">Cancelar</button>
              <button type="submit" :disabled="savingPayment"
                class="flex-1 rounded-lg bg-violet-600 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-60 cursor-pointer transition-colors">
                {{ savingPayment ? 'Guardando…' : 'Registrar pago' }}
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
