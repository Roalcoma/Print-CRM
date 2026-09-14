<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { Users, TrendingUp, Clock, DollarSign, Plus, Activity, RefreshCw } from 'lucide-vue-next';
import { agencyApi } from '../../agencyApi';

interface ActivityItem {
  id: string;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
  admin_name: string | null;
  client_name: string | null;
}

interface DashboardData {
  totalClients: number;
  activeClients: number;
  trialClients: number;
  monthlyRevenue: number;
  newThisMonth: number;
  recentActivity: ActivityItem[];
}

const router = useRouter();
const data = ref<DashboardData | null>(null);
const loading = ref(true);
const error = ref('');

async function load() {
  loading.value = true;
  error.value = '';
  try {
    data.value = await agencyApi.get<DashboardData>('/dashboard');
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Error al cargar';
  } finally {
    loading.value = false;
  }
}

onMounted(load);

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

function formatDate(dt: string) {
  return new Date(dt).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('es-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function actionColor(action: string) {
  if (action.includes('created') || action.includes('provisioned')) return 'bg-emerald-500';
  if (action.includes('cancelled')) return 'bg-red-500';
  if (action.includes('updated') || action.includes('changed')) return 'bg-[#F69008]';
  return 'bg-slate-400';
}
</script>

<template>
  <div class="space-y-6 p-4 sm:p-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-xl font-bold text-slate-900">Resumen</h2>
        <p class="text-sm text-slate-500 mt-0.5">Vista general de tu agencia</p>
      </div>
      <div class="flex gap-2">
        <button
          class="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600 hover:text-slate-900 hover:border-slate-400 transition-all cursor-pointer"
          @click="load"
        >
          <RefreshCw class="h-4 w-4" :class="loading ? 'animate-spin' : ''" />
          Actualizar
        </button>
        <button
          class="flex items-center gap-2 rounded-lg bg-[#F69008] hover:bg-[#D97706] px-4 py-2 text-sm font-semibold text-white transition-colors cursor-pointer shadow-lg shadow-[#F69008]/20"
          @click="router.push('/agency/clients')"
        >
          <Plus class="h-4 w-4" />
          Nuevo Cliente
        </button>
      </div>
    </div>

    <!-- Loading state -->
    <div v-if="loading && !data" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div v-for="i in 4" :key="i" class="h-28 rounded-xl bg-slate-200/60 animate-pulse"></div>
    </div>

    <!-- Error state -->
    <div v-if="error" class="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-400 text-sm">
      {{ error }}
    </div>

    <template v-if="data">
      <!-- Stat cards -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="rounded-xl border border-slate-200 bg-white p-5">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-xs text-slate-500 uppercase tracking-wide font-semibold">Total Clientes</p>
              <p class="mt-2 text-3xl font-bold text-slate-900">{{ data.totalClients }}</p>
              <p class="mt-1 text-xs text-slate-500">{{ data.newThisMonth }} nuevos este mes</p>
            </div>
            <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-[#F69008]/10 border border-[#F69008]/20">
              <Users class="h-5 w-5 text-[#F69008]" />
            </div>
          </div>
        </div>

        <div class="rounded-xl border border-slate-200 bg-white p-5">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-xs text-slate-500 uppercase tracking-wide font-semibold">Clientes Activos</p>
              <p class="mt-2 text-3xl font-bold text-slate-900">{{ data.activeClients }}</p>
              <p class="mt-1 text-xs text-emerald-500 font-medium">
                {{ data.totalClients > 0 ? Math.round((data.activeClients / data.totalClients) * 100) : 0 }}% del total
              </p>
            </div>
            <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-600/20 border border-emerald-600/30">
              <TrendingUp class="h-5 w-5 text-emerald-500" />
            </div>
          </div>
        </div>

        <div class="rounded-xl border border-slate-200 bg-white p-5">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-xs text-slate-500 uppercase tracking-wide font-semibold">En Trial</p>
              <p class="mt-2 text-3xl font-bold text-slate-900">{{ data.trialClients }}</p>
              <p class="mt-1 text-xs text-amber-500 font-medium">Conversión pendiente</p>
            </div>
            <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-600/20 border border-amber-600/30">
              <Clock class="h-5 w-5 text-amber-500" />
            </div>
          </div>
        </div>

        <div class="rounded-xl border border-slate-200 bg-white p-5">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-xs text-slate-500 uppercase tracking-wide font-semibold">Ingresos Mensuales</p>
              <p class="mt-2 text-3xl font-bold text-slate-900">{{ formatCurrency(data.monthlyRevenue) }}</p>
              <p class="mt-1 text-xs text-slate-500">MRR estimado</p>
            </div>
            <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-[#F69008]/10 border border-[#F69008]/20">
              <DollarSign class="h-5 w-5 text-[#F69008]" />
            </div>
          </div>
        </div>
      </div>

      <!-- Bottom grid -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <!-- Plan distribution -->
        <div class="rounded-xl border border-slate-200 bg-white p-5">
          <h3 class="text-sm font-semibold text-slate-700 mb-4">Distribución por Plan</h3>
          <div class="space-y-4">
            <div>
              <div class="flex justify-between text-xs text-slate-500 mb-1.5">
                <span>Starter</span>
                <span class="text-slate-700 font-medium">{{ data.totalClients > 0 ? Math.round(((data.totalClients - data.activeClients) / Math.max(data.totalClients,1)) * 100) : 0 }}%</span>
              </div>
              <div class="h-2 rounded-full bg-slate-100">
                <div
                  class="h-2 rounded-full bg-slate-300 transition-all duration-700"
                  :style="`width: ${data.totalClients > 0 ? Math.max(10, Math.round(((data.totalClients - data.activeClients) / data.totalClients) * 100)) : 0}%`"
                ></div>
              </div>
            </div>
            <div>
              <div class="flex justify-between text-xs text-slate-500 mb-1.5">
                <span>Pro</span>
                <span class="text-slate-700 font-medium">{{ data.totalClients > 0 ? Math.round((data.activeClients / Math.max(data.totalClients,1)) * 60) : 0 }}%</span>
              </div>
              <div class="h-2 rounded-full bg-slate-100">
                <div
                  class="h-2 rounded-full bg-[#F69008] transition-all duration-700"
                  :style="`width: ${data.totalClients > 0 ? Math.max(5, Math.round((data.activeClients / data.totalClients) * 60)) : 0}%`"
                ></div>
              </div>
            </div>
            <div>
              <div class="flex justify-between text-xs text-slate-500 mb-1.5">
                <span>Enterprise</span>
                <span class="text-slate-700 font-medium">{{ data.totalClients > 0 ? Math.round((data.activeClients / Math.max(data.totalClients,1)) * 40) : 0 }}%</span>
              </div>
              <div class="h-2 rounded-full bg-slate-100">
                <div
                  class="h-2 rounded-full bg-amber-700 transition-all duration-700"
                  :style="`width: ${data.totalClients > 0 ? Math.max(3, Math.round((data.activeClients / data.totalClients) * 40)) : 0}%`"
                ></div>
              </div>
            </div>
          </div>

          <div class="mt-5 pt-4 border-t border-slate-100">
            <div class="flex justify-between text-xs">
              <span class="text-slate-500">Activos</span>
              <span class="font-semibold text-emerald-500">{{ data.activeClients }}</span>
            </div>
            <div class="flex justify-between text-xs mt-1">
              <span class="text-slate-500">Trial</span>
              <span class="font-semibold text-amber-500">{{ data.trialClients }}</span>
            </div>
          </div>
        </div>

        <!-- Recent activity -->
        <div class="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-5">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-sm font-semibold text-slate-700">Actividad Reciente</h3>
            <Activity class="h-4 w-4 text-slate-400" />
          </div>

          <div v-if="data.recentActivity.length === 0" class="py-8 text-center text-slate-500 text-sm">
            Sin actividad reciente
          </div>

          <div v-else class="space-y-3">
            <div
              v-for="item in data.recentActivity"
              :key="item.id"
              class="flex items-start gap-3"
            >
              <div class="mt-1.5 flex-shrink-0">
                <div class="h-2 w-2 rounded-full" :class="actionColor(item.action)"></div>
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-sm text-slate-700 font-medium">
                  {{ formatAction(item.action) }}
                  <span v-if="item.client_name" class="text-slate-500 font-normal"> — {{ item.client_name }}</span>
                </p>
                <p class="text-xs text-slate-400 mt-0.5">{{ formatDate(item.created_at) }} · {{ item.admin_name ?? 'Sistema' }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
