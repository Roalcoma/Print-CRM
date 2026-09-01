<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { Users, Kanban, DollarSign, TrendingUp, TrendingDown, CheckCircle2, Clock, Target, ListTodo, ArrowUpRight, ArrowDownRight } from 'lucide-vue-next';
import { api } from '../api';
import type { Contact, Pipeline, Opportunity, Task } from '../types';
import LoadingState from '../components/LoadingState.vue';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const loading = ref(true);

const contacts = ref(0);
const allOpps = ref<Opportunity[]>([]);
const tasks = ref<Task[]>([]);
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
  } finally {
    loading.value = false;
  }
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
      name: s.name,
      color: s.color,
      count: inStage.length,
      value: inStage.reduce((sum, o) => sum + Number(o.value), 0),
    };
  }).filter(s => s.count > 0);
});

const pendingTasks = computed(() => tasks.value.filter(t => t.status !== 'done').length);
const doneTasks    = computed(() => tasks.value.filter(t => t.status === 'done').length);

const money = (n: number) => n.toLocaleString('es-VE', { style: 'currency', currency: 'USD' });
const moneyShort = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
};
</script>

<template>
  <LoadingState v-if="loading" label="Cargando dashboard…" />
  <div v-else class="p-6 space-y-6">

    <!-- ── KPI Stat Cards (estilo Uxerflow) ─────────────────────────────────── -->
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">

      <!-- Contactos -->
      <div v-if="auth.can('contacts')" class="stat-card group">
        <div class="flex items-start justify-between">
          <div>
            <p class="text-sm font-medium text-slate-500">Contactos</p>
            <p class="stat-card__number mt-2">{{ contacts }}</p>
            <p class="stat-card__label">Total registrados</p>
          </div>
          <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 transition-colors group-hover:bg-blue-100">
            <Users class="h-5 w-5" />
          </div>
        </div>
        <div class="mt-3 flex items-center gap-2">
          <span class="badge-trend badge-trend--up">
            <ArrowUpRight class="h-3 w-3" />
            activos
          </span>
        </div>
      </div>

      <!-- Oportunidades abiertas -->
      <div v-if="auth.can('opportunities')" class="stat-card group">
        <div class="flex items-start justify-between">
          <div>
            <p class="text-sm font-medium text-slate-500">En pipeline</p>
            <p class="stat-card__number mt-2">{{ openOpps.length }}</p>
            <p class="stat-card__label">Oportunidades abiertas</p>
          </div>
          <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F69008]/10 text-[#D97706] transition-colors group-hover:bg-[#F69008]/20">
            <Kanban class="h-5 w-5" />
          </div>
        </div>
        <div class="mt-3 flex items-center gap-2">
          <span class="badge-trend badge-trend--up">
            <ArrowUpRight class="h-3 w-3" />
            {{ moneyShort(openValue) }} en valor
          </span>
        </div>
      </div>

      <!-- Tareas pendientes -->
      <div class="stat-card group">
        <div class="flex items-start justify-between">
          <div>
            <p class="text-sm font-medium text-slate-500">Tareas</p>
            <p class="stat-card__number mt-2">{{ pendingTasks }}</p>
            <p class="stat-card__label">Pendientes de {{ tasks.length }}</p>
          </div>
          <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 transition-colors group-hover:bg-amber-100">
            <ListTodo class="h-5 w-5" />
          </div>
        </div>
        <div class="mt-3 flex items-center gap-2">
          <span class="badge-trend" :class="doneTasks > 0 ? 'badge-trend--up' : 'badge-trend--down'">
            <component :is="doneTasks > 0 ? ArrowUpRight : ArrowDownRight" class="h-3 w-3" />
            {{ doneTasks }} completadas
          </span>
        </div>
      </div>

      <!-- Tasa de cierre -->
      <div v-if="auth.can('opportunities') && conversionRate !== null" class="stat-card group">
        <div class="flex items-start justify-between">
          <div>
            <p class="text-sm font-medium text-slate-500">Tasa de cierre</p>
            <p class="stat-card__number mt-2">{{ conversionRate }}<span class="text-lg font-semibold text-slate-400">%</span></p>
            <p class="stat-card__label">Ganadas / cerradas</p>
          </div>
          <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600 transition-colors group-hover:bg-violet-100">
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

      <!-- Fallback: tasa de cierre sin datos -->
      <div v-else-if="auth.can('opportunities') && conversionRate === null" class="stat-card group">
        <div class="flex items-start justify-between">
          <div>
            <p class="text-sm font-medium text-slate-500">Tasa de cierre</p>
            <p class="stat-card__number mt-2 text-slate-300">—</p>
            <p class="stat-card__label">Sin negociaciones cerradas</p>
          </div>
          <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-300">
            <Target class="h-5 w-5" />
          </div>
        </div>
      </div>
    </div>

    <!-- ── Segunda fila: resultados + distribución ───────────────────────────── -->
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-3" v-if="auth.can('opportunities')">

      <!-- Ganadas / Perdidas / En proceso -->
      <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
        <h2 class="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <DollarSign class="h-4 w-4 text-slate-400" />
          Resultados de negociaciones
        </h2>
        <div class="space-y-3">
          <div class="flex items-center gap-3 rounded-lg bg-emerald-50 p-3">
            <div class="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100">
              <TrendingUp class="h-4 w-4 text-emerald-600" />
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-xs font-medium text-emerald-700">Ganadas</p>
              <p class="text-sm font-bold text-emerald-800 truncate">{{ wonOpps.length }} — {{ money(wonValue) }}</p>
            </div>
          </div>
          <div class="flex items-center gap-3 rounded-lg bg-red-50 p-3">
            <div class="flex h-8 w-8 items-center justify-center rounded-full bg-red-100">
              <TrendingDown class="h-4 w-4 text-red-500" />
            </div>
            <div class="flex-1">
              <p class="text-xs font-medium text-red-600">Perdidas</p>
              <p class="text-sm font-bold text-red-700">{{ lostOpps.length }} oportunidades</p>
            </div>
          </div>
          <div class="flex items-center gap-3 rounded-lg bg-blue-50 p-3">
            <div class="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100">
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
        <div v-if="stageStats.length" class="space-y-3">
          <div v-for="s in stageStats" :key="s.name" class="flex items-center gap-3">
            <span class="h-2.5 w-2.5 flex-shrink-0 rounded-full" :style="{ background: s.color }"></span>
            <span class="w-32 truncate text-xs font-medium text-slate-600">{{ s.name }}</span>
            <div class="flex-1">
              <div class="h-2 w-full rounded-full bg-slate-100">
                <div
                  class="h-2 rounded-full transition-all duration-500"
                  :style="{ background: s.color, width: `${openOpps.length > 0 ? Math.round((s.count / openOpps.length) * 100) : 0}%` }"
                ></div>
              </div>
            </div>
            <span class="w-24 text-right text-xs font-medium text-slate-500">
              {{ s.count }} · {{ moneyShort(s.value) }}
            </span>
          </div>
        </div>
        <p v-else class="py-4 text-center text-sm text-slate-400">No hay oportunidades abiertas en este pipeline.</p>
      </div>
    </div>

    <!-- ── Tareas pendientes ──────────────────────────────────────────────────── -->
    <div v-if="tasks.length > 0" class="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50">
            <CheckCircle2 class="h-4 w-4 text-amber-600" />
          </div>
          <div>
            <p class="text-sm font-semibold text-slate-700">Tareas pendientes</p>
            <p class="text-xs text-slate-400">{{ pendingTasks }} de {{ tasks.length }} sin completar</p>
          </div>
        </div>
        <!-- Progress bar -->
        <div class="hidden sm:flex items-center gap-3">
          <div class="w-40 h-2 rounded-full bg-slate-100">
            <div
              class="h-2 rounded-full bg-emerald-500 transition-all duration-500"
              :style="{ width: tasks.length > 0 ? `${Math.round((doneTasks / tasks.length) * 100)}%` : '0%' }"
            ></div>
          </div>
          <span class="text-xs font-semibold text-emerald-600">
            {{ tasks.length > 0 ? Math.round((doneTasks / tasks.length) * 100) : 0 }}%
          </span>
        </div>
      </div>
    </div>

  </div>
</template>
