<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import {
  Users, Kanban, DollarSign, TrendingUp, TrendingDown, CheckCircle2,
  Clock, Target, ListTodo, ArrowUpRight, ArrowDownRight, Plus, ChevronRight,
} from 'lucide-vue-next';
import { useRouter } from 'vue-router';
import { api } from '../api';
import type { Contact, Pipeline, Opportunity, Task } from '../types';
import LoadingState from '../components/LoadingState.vue';
import { useAuthStore } from '../stores/auth';

const auth   = useAuthStore();
const router = useRouter();
const loading = ref(true);

const contacts = ref(0);
const allOpps  = ref<Opportunity[]>([]);
const tasks    = ref<Task[]>([]);
const pipeline = ref<Pipeline | null>(null);

onMounted(async () => {
  try {
    const fetches: Promise<unknown>[] = [];
    if (auth.can('contacts')) {
      fetches.push(
        api.get<Contact[]>('/contacts').then(r => { contacts.value = r.length; })
      );
    }
    if (auth.can('opportunities')) {
      fetches.push(
        api.get<Pipeline[]>('/pipelines').then(async ps => {
          if (!ps[0]) return;
          pipeline.value = ps[0];
          allOpps.value = await api.post<Opportunity[]>('/opportunities/query', { pipelineId: ps[0].id });
        })
      );
    }
    fetches.push(
      api.get<Task[]>('/tasks').then(r => { tasks.value = r; }).catch(() => {})
    );
    await Promise.all(fetches);
  } finally { loading.value = false; }
});

const openOpps = computed(() => allOpps.value.filter(o => o.status === 'open'));
const wonOpps  = computed(() => allOpps.value.filter(o => o.status === 'won'));
const lostOpps = computed(() => allOpps.value.filter(o => o.status === 'lost'));

const openValue = computed(() => openOpps.value.reduce((s, o) => s + Number(o.value), 0));
const wonValue  = computed(() => wonOpps.value.reduce((s, o) => s + Number(o.value), 0));

const conversionRate = computed(() => {
  const closed = wonOpps.value.length + lostOpps.value.length;
  return closed > 0 ? Math.round((wonOpps.value.length / closed) * 100) : null;
});

const stageStats = computed(() => {
  if (!pipeline.value) return [];
  return pipeline.value.stages.map(s => {
    const inStage = openOpps.value.filter(o => o.stage_id === s.id);
    return {
      name:  s.name,
      color: s.color,
      count: inStage.length,
      value: inStage.reduce((sum, o) => sum + Number(o.value), 0),
    };
  }).filter(s => s.count > 0);
});

const pendingTasks = computed(() => tasks.value.filter(t => t.status !== 'done').length);
const doneTasks    = computed(() => tasks.value.filter(t => t.status === 'done').length);

const greeting = computed(() => {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 18) return 'Buenas tardes';
  return 'Buenas noches';
});

const todayStr = computed(() =>
  new Date().toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long' })
);

const firstName = computed(() => (auth.user?.name ?? '').split(' ')[0] || 'allí');

const moneyShort = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
};

const moneyFull = (n: number) => {
  if (n === 0) return '$0';
  return `$${n.toLocaleString('es-VE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};
</script>

<template>
  <LoadingState v-if="loading" label="Cargando dashboard…" />
  <div v-else class="flex h-full flex-col overflow-y-auto">

    <!-- ── Banner de bienvenida ──────────────────────────────────────────────── -->
    <div class="flex-shrink-0 border-b border-slate-200 bg-white px-6 py-4">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-[11px] font-medium capitalize text-slate-400">{{ todayStr }}</p>
          <h1 class="mt-0.5 text-[18px] font-bold text-slate-900">{{ greeting }}, {{ firstName }}</h1>
        </div>
        <div class="flex items-center gap-2">
          <button
            v-if="auth.can('contacts')"
            class="dash-quick-btn"
            @click="router.push('/contacts')"
          >
            <Users class="h-3.5 w-3.5" />
            Nuevo contacto
          </button>
          <button
            v-if="auth.can('opportunities')"
            class="dash-quick-btn dash-quick-btn--primary"
            @click="router.push('/opportunities')"
          >
            <Plus class="h-3.5 w-3.5" />
            Nueva oportunidad
          </button>
        </div>
      </div>
    </div>

    <!-- ── Cuerpo ─────────────────────────────────────────────────────────────── -->
    <div class="flex-1 space-y-5 p-6">

      <!-- KPI Cards -->
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">

        <!-- Contactos -->
        <div
          v-if="auth.can('contacts')"
          class="stat-card group cursor-pointer"
          @click="router.push('/contacts')"
        >
          <div class="flex items-start justify-between">
            <div>
              <p class="text-sm font-medium text-slate-500">Contactos</p>
              <p class="stat-card__number mt-2">{{ contacts }}</p>
              <p class="stat-card__label">Total registrados</p>
            </div>
            <div class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 transition-colors group-hover:bg-blue-100">
              <Users class="h-5 w-5" />
            </div>
          </div>
          <div class="mt-3 flex items-center justify-between">
            <span class="badge-trend badge-trend--up">
              <ArrowUpRight class="h-3 w-3" />
              activos
            </span>
            <ChevronRight class="h-3.5 w-3.5 text-slate-300 transition-colors group-hover:text-slate-500" />
          </div>
        </div>

        <!-- En pipeline -->
        <div
          v-if="auth.can('opportunities')"
          class="stat-card group cursor-pointer"
          @click="router.push('/opportunities')"
        >
          <div class="flex items-start justify-between">
            <div>
              <p class="text-sm font-medium text-slate-500">En pipeline</p>
              <p class="stat-card__number mt-2">{{ openOpps.length }}</p>
              <p class="stat-card__label">Oportunidades abiertas</p>
            </div>
            <div class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#F69008]/10 text-[#D97706] transition-colors group-hover:bg-[#F69008]/20">
              <Kanban class="h-5 w-5" />
            </div>
          </div>
          <div class="mt-3 flex items-center justify-between">
            <span class="badge-trend badge-trend--up">
              <ArrowUpRight class="h-3 w-3" />
              {{ moneyShort(openValue) }} en valor
            </span>
            <ChevronRight class="h-3.5 w-3.5 text-slate-300 transition-colors group-hover:text-slate-500" />
          </div>
        </div>

        <!-- Tareas -->
        <div
          class="stat-card group cursor-pointer"
          @click="router.push('/tasks')"
        >
          <div class="flex items-start justify-between">
            <div>
              <p class="text-sm font-medium text-slate-500">Tareas</p>
              <p class="stat-card__number mt-2">{{ pendingTasks }}</p>
              <p class="stat-card__label">Pendientes de {{ tasks.length }}</p>
            </div>
            <div class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 transition-colors group-hover:bg-amber-100">
              <ListTodo class="h-5 w-5" />
            </div>
          </div>
          <div class="mt-3 flex items-center justify-between">
            <span class="badge-trend" :class="doneTasks > 0 ? 'badge-trend--up' : 'badge-trend--down'">
              <component :is="doneTasks > 0 ? ArrowUpRight : ArrowDownRight" class="h-3 w-3" />
              {{ doneTasks }} completadas
            </span>
            <ChevronRight class="h-3.5 w-3.5 text-slate-300 transition-colors group-hover:text-slate-500" />
          </div>
        </div>

        <!-- Tasa de cierre — con datos -->
        <div v-if="auth.can('opportunities') && conversionRate !== null" class="stat-card group">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-sm font-medium text-slate-500">Tasa de cierre</p>
              <p class="stat-card__number mt-2">
                {{ conversionRate }}<span class="text-lg font-semibold text-slate-400">%</span>
              </p>
              <p class="stat-card__label">Ganadas / cerradas</p>
            </div>
            <div class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600 transition-colors group-hover:bg-violet-100">
              <Target class="h-5 w-5" />
            </div>
          </div>
          <div class="mt-3 flex items-center gap-2">
            <span class="badge-trend" :class="conversionRate >= 50 ? 'badge-trend--up' : 'badge-trend--down'">
              <component :is="conversionRate >= 50 ? ArrowUpRight : ArrowDownRight" class="h-3 w-3" />
              {{ wonOpps.length }} ganadas
            </span>
          </div>
        </div>

        <!-- Tasa de cierre — sin datos -->
        <div v-else-if="auth.can('opportunities') && conversionRate === null" class="stat-card">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-sm font-medium text-slate-500">Tasa de cierre</p>
              <p class="stat-card__number mt-2 text-slate-300">—</p>
              <p class="stat-card__label">Sin negociaciones cerradas</p>
            </div>
            <div class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-300">
              <Target class="h-5 w-5" />
            </div>
          </div>
        </div>
      </div>

      <!-- Segunda fila: resultados + distribución -->
      <div v-if="auth.can('opportunities')" class="grid grid-cols-1 gap-4 lg:grid-cols-3">

        <!-- Resultados -->
        <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
          <h2 class="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <DollarSign class="h-4 w-4 text-slate-400" />
            Resultados de negociaciones
          </h2>
          <div class="space-y-3">
            <div class="flex items-center gap-3 rounded-lg bg-emerald-50 p-3">
              <div class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100">
                <TrendingUp class="h-4 w-4 text-emerald-600" />
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-xs font-medium text-emerald-700">Ganadas</p>
                <p class="truncate text-sm font-bold text-emerald-800">
                  {{ wonOpps.length }}
                  <span class="font-normal text-emerald-600"> — {{ moneyFull(wonValue) }}</span>
                </p>
              </div>
            </div>
            <div class="flex items-center gap-3 rounded-lg bg-red-50 p-3">
              <div class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-red-100">
                <TrendingDown class="h-4 w-4 text-red-500" />
              </div>
              <div class="flex-1">
                <p class="text-xs font-medium text-red-600">Perdidas</p>
                <p class="text-sm font-bold text-red-700">{{ lostOpps.length }} oportunidades</p>
              </div>
            </div>
            <div class="flex items-center gap-3 rounded-lg bg-blue-50 p-3">
              <div class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-100">
                <Clock class="h-4 w-4 text-blue-600" />
              </div>
              <div class="flex-1">
                <p class="text-xs font-medium text-blue-700">En proceso</p>
                <p class="text-sm font-bold text-blue-800">{{ openOpps.length }} oportunidades</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Distribución por etapa -->
        <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-card lg:col-span-2">
          <h2 class="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Kanban class="h-4 w-4 text-slate-400" />
            Distribución por etapa
          </h2>
          <div v-if="stageStats.length" class="space-y-4">
            <div v-for="s in stageStats" :key="s.name" class="flex items-center gap-3">
              <span class="h-2.5 w-2.5 flex-shrink-0 rounded-full" :style="{ background: s.color }"></span>
              <span class="w-32 truncate text-xs font-medium text-slate-600">{{ s.name }}</span>
              <div class="flex-1">
                <div class="h-2 w-full rounded-full bg-slate-100">
                  <div
                    class="h-2 rounded-full transition-all duration-700"
                    :style="{
                      background: s.color,
                      width: `${openOpps.length > 0 ? Math.round((s.count / openOpps.length) * 100) : 0}%`
                    }"
                  ></div>
                </div>
              </div>
              <span class="w-24 text-right text-xs font-medium text-slate-500">
                {{ s.count }} · {{ moneyShort(s.value) }}
              </span>
            </div>
          </div>
          <div v-else class="flex flex-col items-center justify-center py-10 text-center">
            <Kanban class="mb-2 h-8 w-8 text-slate-200" />
            <p class="text-sm text-slate-400">No hay oportunidades abiertas en este pipeline.</p>
          </div>
        </div>
      </div>

      <!-- Progreso de tareas -->
      <div v-if="tasks.length > 0" class="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-amber-50">
              <CheckCircle2 class="h-4 w-4 text-amber-600" />
            </div>
            <div>
              <p class="text-sm font-semibold text-slate-700">Progreso de tareas</p>
              <p class="text-xs text-slate-400">{{ pendingTasks }} de {{ tasks.length }} sin completar</p>
            </div>
          </div>
          <div class="flex items-center gap-4">
            <div class="hidden items-center gap-3 sm:flex">
              <div class="h-2 w-48 rounded-full bg-slate-100">
                <div
                  class="h-2 rounded-full bg-emerald-500 transition-all duration-700"
                  :style="{ width: tasks.length > 0 ? `${Math.round((doneTasks / tasks.length) * 100)}%` : '0%' }"
                ></div>
              </div>
              <span class="w-8 text-right text-xs font-semibold text-emerald-600">
                {{ tasks.length > 0 ? Math.round((doneTasks / tasks.length) * 100) : 0 }}%
              </span>
            </div>
            <button
              class="flex cursor-pointer items-center gap-1 text-xs font-medium text-primary hover:text-primary-dark"
              @click="router.push('/tasks')"
            >
              Ver todas <ChevronRight class="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<style>
.dash-quick-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.4375rem 0.875rem;
  border-radius: 0.5rem;
  border: 1.5px solid #E2E8F0;
  background: #ffffff;
  font-size: 0.8125rem;
  font-weight: 500;
  color: #475569;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}
.dash-quick-btn:hover {
  border-color: #F69008;
  color: #D97706;
  background: rgba(246, 144, 8, 0.05);
}
.dash-quick-btn--primary {
  background: #F69008;
  border-color: #F69008;
  color: #ffffff;
  font-weight: 600;
  box-shadow: 0 1px 4px rgba(246, 144, 8, 0.35);
}
.dash-quick-btn--primary:hover {
  background: #D97706;
  border-color: #D97706;
  color: #ffffff;
}
</style>
