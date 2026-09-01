<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import {
  Plus, Search, Pencil, Trash2, X, CalendarClock, Kanban,
  UserPlus, ChevronDown, Check, Calendar, Clock,
} from 'lucide-vue-next';
import { api } from '../api';
import type { Task, TaskStatus, User } from '../types';
import { TASK_STATUSES } from '../taskStatus';
import { useAuthStore } from '../stores/auth';
import Spinner from '../components/Spinner.vue';
import LoadingState from '../components/LoadingState.vue';
import Dropdown from '../components/Dropdown.vue';
import ViewToggle from '../components/ViewToggle.vue';
import StatusSelect from '../components/StatusSelect.vue';

const auth  = useAuthStore();
const tasks = ref<Task[]>([]);
const users = ref<User[]>([]);
const opps  = ref<{ id: string; title: string }[]>([]);
const loading = ref(true);
const assigneeFilter = ref('');
const search  = ref('');
const dragId  = ref<string | null>(null);
const stats   = ref({ today: 0, overdue: 0, pending: 0, done: 0, total: 0, done_pct: 0 });

// Vista tablero/lista (recordada en la cuenta).
const viewMode = ref<'board' | 'list'>(auth.preferences.taskView === 'list' ? 'list' : 'board');
watch(viewMode, v => auth.savePreferences({ taskView: v }));

// Tab activo en la vista lista: hoy | overdue | upcoming | done
const activeTab = ref<'today' | 'overdue' | 'upcoming' | 'done'>('today');

async function changeStatus(t: Task, status: TaskStatus) {
  t.status = status;
  await api.patch(`/tasks/${t.id}`, { status });
  await loadStats();
}

async function loadStats() {
  stats.value = await api.get('/tasks/stats');
}

async function load() {
  tasks.value = await api.get<Task[]>('/tasks');
}

onMounted(async () => {
  try {
    [users.value, opps.value] = await Promise.all([
      api.get<User[]>('/users'),
      api.get<{ id: string; title: string }[]>('/opportunities'),
    ]);
    await Promise.all([load(), loadStats()]);
  } finally { loading.value = false; }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
const initials  = (n: string) => n.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
const userName  = (id: string) => users.value.find(u => u.id === id)?.name ?? '';
const fmtDate   = (iso: string) => new Date(iso).toLocaleDateString('es-VE', { day: '2-digit', month: 'short' });
const fmtTime   = (iso: string) => new Date(iso).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
const isOverdue = (t: Task) => t.status !== 'done' && t.status !== 'cancelled' && !!t.due_at && new Date(t.due_at) < new Date();
const isToday   = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();
const isActive  = (t: Task) => t.status !== 'done' && t.status !== 'cancelled';

const PRIORITY_META = {
  high:   { label: 'Alta',   color: 'bg-red-100 text-red-700',    border: 'border-l-red-400' },
  medium: { label: 'Media',  color: 'bg-amber-100 text-amber-700', border: 'border-l-amber-400' },
  low:    { label: 'Baja',   color: 'bg-slate-100 text-slate-500', border: 'border-l-slate-300' },
};
const TASK_TYPES = ['Llamada', 'Email', 'Reunión', 'Seguimiento', 'Revisión', 'Demo', 'Propuesta', 'Otro'];
const REMINDER_OPTIONS = [
  { value: '',      label: 'Sin recordatorio' },
  { value: '15min', label: '15 minutos antes' },
  { value: '30min', label: '30 minutos antes' },
  { value: '1h',    label: '1 hora antes' },
  { value: '2h',    label: '2 horas antes' },
  { value: '1d',    label: '1 día antes' },
  { value: '2d',    label: '2 días antes' },
  { value: '1w',    label: '1 semana antes' },
];
const PRIORITIES = [
  { value: 'high',   label: 'Alta' },
  { value: 'medium', label: 'Media' },
  { value: 'low',    label: 'Baja' },
] as const;

// ── Filtrado global (aplica a kanban y lista) ─────────────────────────────────
const filtered = computed(() => {
  const t = search.value.trim().toLowerCase();
  return tasks.value.filter(x =>
    (!assigneeFilter.value || x.assignees.some(a => a.id === assigneeFilter.value)) &&
    (!t || x.title.toLowerCase().includes(t)),
  );
});

// Columnas del kanban
function tasksOf(status: TaskStatus) { return filtered.value.filter(t => t.status === status); }

// Tabs de la vista lista
const tabTasks = computed(() => {
  const f = filtered.value;
  return {
    today:    f.filter(t => isActive(t) && !!t.due_at && isToday(t.due_at)),
    overdue:  f.filter(t => isActive(t) && !!t.due_at && !isToday(t.due_at) && isOverdue(t)),
    upcoming: f.filter(t => isActive(t) && (!t.due_at || (!isOverdue(t) && !isToday(t.due_at)))),
    done:     f.filter(t => t.status === 'done'),
  };
});
const currentTab = computed(() => tabTasks.value[activeTab.value]);

// ── Drag & drop ───────────────────────────────────────────────────────────────
function onDragStart(id: string) { dragId.value = id; }
async function onDrop(status: TaskStatus) {
  const id = dragId.value; dragId.value = null;
  if (!id) return;
  const t = tasks.value.find(x => x.id === id);
  if (!t || t.status === status) return;
  t.status = status;
  await api.patch(`/tasks/${id}`, { status });
  await loadStats();
}

// ── Modal crear/editar ────────────────────────────────────────────────────────
const showForm = ref(false);
const editing  = ref<Task | null>(null);
const saving   = ref(false);
const form = ref({
  title: '', description: '', status: 'pending' as TaskStatus,
  assignee_ids: [] as string[], opportunity_id: '',
  due_date: '', due_time: '',
  task_type: '', priority: 'medium' as 'high' | 'medium' | 'low', reminder: '',
});

function toLocalParts(iso: string | null) {
  if (!iso) return { date: '', time: '' };
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    time: `${p(d.getHours())}:${p(d.getMinutes())}`,
  };
}

const followerUsers   = computed(() => users.value.filter(u => form.value.assignee_ids.includes(u.id)));
const availableUsers  = computed(() => users.value.filter(u => !form.value.assignee_ids.includes(u.id)));
function addAssignee(id: string)    { if (!form.value.assignee_ids.includes(id)) form.value.assignee_ids.push(id); }
function removeAssignee(id: string) { form.value.assignee_ids = form.value.assignee_ids.filter(x => x !== id); }

function openCreate(status: TaskStatus = 'pending') {
  editing.value = null;
  form.value = { title: '', description: '', status, assignee_ids: [], opportunity_id: '', due_date: '', due_time: '09:00', task_type: '', priority: 'medium', reminder: '' };
  showForm.value = true;
}
function openEdit(t: Task) {
  editing.value = t;
  const { date, time } = toLocalParts(t.due_at);
  form.value = {
    title: t.title, description: t.description ?? '', status: t.status,
    assignee_ids: t.assignees.map(a => a.id),
    opportunity_id: t.opportunity_id ?? '',
    due_date: date, due_time: time,
    task_type: t.task_type ?? '', priority: t.priority ?? 'medium', reminder: t.reminder ?? '',
  };
  showForm.value = true;
}

function buildDueAt(): string | null {
  if (!form.value.due_date) return null;
  const time = form.value.due_time || '00:00';
  return new Date(`${form.value.due_date}T${time}`).toISOString();
}

async function save() {
  saving.value = true;
  try {
    const payload = {
      title:          form.value.title,
      description:    form.value.description || null,
      status:         form.value.status,
      assignee_ids:   form.value.assignee_ids,
      opportunity_id: form.value.opportunity_id || null,
      due_at:         buildDueAt(),
      task_type:      form.value.task_type || null,
      priority:       form.value.priority,
      reminder:       form.value.reminder || null,
    };
    if (editing.value) await api.patch(`/tasks/${editing.value.id}`, payload);
    else               await api.post('/tasks', payload);
    showForm.value = false;
    await Promise.all([load(), loadStats()]);
  } finally { saving.value = false; }
}

async function remove(t: Task) {
  if (!confirm('¿Eliminar esta tarea?')) return;
  await api.del(`/tasks/${t.id}`);
  tasks.value = tasks.value.filter(x => x.id !== t.id);
  showForm.value = false;
  await loadStats();
}
</script>

<template>
  <div class="flex h-full flex-col">

    <!-- Toolbar -->
    <div class="flex flex-wrap items-center gap-2.5 border-b border-slate-200 bg-white px-5 py-2.5 shadow-toolbar">
      <!-- View tabs -->
      <button class="view-tab" :class="viewMode === 'board' ? 'view-tab--active' : ''" @click="viewMode = 'board'">
        <Kanban class="h-3.5 w-3.5" /> Tablero
      </button>
      <button class="view-tab" :class="viewMode === 'list' ? 'view-tab--active' : ''" @click="viewMode = 'list'">
        <Calendar class="h-3.5 w-3.5" /> Lista
      </button>

      <div class="mx-1 h-5 w-px bg-slate-200"></div>

      <!-- Assignee filter -->
      <Dropdown width="220px">
        <template #trigger="{ open }">
          <button class="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-all hover:border-slate-300" :class="open && 'border-primary ring-2 ring-primary/20'">
            <template v-if="assigneeFilter">
              <span class="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-[#F69008] to-[#D97706] text-[9px] font-semibold text-white">{{ initials(userName(assigneeFilter)) }}</span>
              {{ userName(assigneeFilter) }}
            </template>
            <span v-else class="text-slate-500">Todos los responsables</span>
            <ChevronDown class="h-3.5 w-3.5 text-slate-400 transition-transform" :class="open && 'rotate-180'" />
          </button>
        </template>
        <button type="button" class="flex w-full cursor-pointer items-center justify-between rounded-md px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-slate-100" :class="!assigneeFilter ? 'text-primary' : 'text-slate-700'" @click="assigneeFilter = ''">
          Todos los responsables
          <Check v-if="!assigneeFilter" class="h-4 w-4" />
        </button>
        <button v-for="u in users" :key="u.id" type="button" class="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-slate-100" :class="assigneeFilter === u.id ? 'text-primary' : 'text-slate-700'" @click="assigneeFilter = u.id">
          <span class="flex items-center gap-2">
            <span class="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-[#F69008] to-[#D97706] text-[10px] font-semibold text-white">{{ initials(u.name) }}</span>
            {{ u.name }}
          </span>
          <Check v-if="assigneeFilter === u.id" class="h-4 w-4" />
        </button>
      </Dropdown>

      <!-- Search -->
      <div class="relative">
        <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input v-model="search" placeholder="Buscar tarea…" class="w-52 rounded-lg border border-slate-200 py-1.5 pl-9 pr-3 text-sm transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none" />
      </div>

      <div class="ml-auto flex items-center gap-2">
        <button
          class="flex cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-white shadow-sm shadow-primary/30 transition-all hover:bg-primary-dark hover:shadow-md hover:shadow-primary/40"
          @click="openCreate()"
        >
          <Plus class="h-4 w-4" /> Nueva tarea
        </button>
      </div>
    </div>

    <LoadingState v-if="loading" label="Cargando tareas…" />

    <!-- ── Tablero kanban ───────────────────────────────────────────────────── -->
    <div v-else-if="viewMode === 'board'" class="flex flex-1 gap-4 overflow-x-auto bg-slate-100/60 p-6">
      <div v-for="col in TASK_STATUSES" :key="col.key" class="flex w-80 flex-shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card" @dragover.prevent @drop="onDrop(col.key)">
        <!-- Column header — Flowlu style -->
        <div class="flex items-center justify-between border-b border-slate-100 px-4 py-3 bg-white">
          <div class="flex items-center gap-2">
            <span class="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0" :style="{ backgroundColor: col.color }"></span>
            <span class="text-sm font-semibold text-slate-800">{{ col.label }}</span>
            <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500">{{ tasksOf(col.key).length }}</span>
          </div>
          <button class="cursor-pointer rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-primary" @click="openCreate(col.key)">
            <Plus class="h-4 w-4" />
          </button>
        </div>

        <div class="flex-1 space-y-2.5 overflow-y-auto bg-slate-50/40 p-2.5">
          <div v-for="t in tasksOf(col.key)" :key="t.id" draggable="true"
            class="group cursor-grab rounded-md border border-l-4 border-slate-200 bg-white p-3 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-[#F69008]/30 hover:shadow-elevated active:cursor-grabbing"
            :class="PRIORITY_META[t.priority ?? 'medium'].border"
            @dragstart="onDragStart(t.id)" @click="openEdit(t)">
            <div class="flex items-start justify-between gap-2">
              <p class="text-sm font-medium" :class="t.status === 'done' ? 'text-slate-400 line-through' : 'text-slate-900'">{{ t.title }}</p>
              <div class="flex flex-shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                <button class="cursor-pointer rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-primary" @click.stop="openEdit(t)"><Pencil class="h-3.5 w-3.5" /></button>
                <button class="cursor-pointer rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" @click.stop="remove(t)"><Trash2 class="h-3.5 w-3.5" /></button>
              </div>
            </div>
            <!-- Badges -->
            <div class="mt-1.5 flex flex-wrap items-center gap-1">
              <span class="rounded-sm px-1.5 py-0.5 text-[10px] font-semibold" :class="PRIORITY_META[t.priority ?? 'medium'].color">{{ PRIORITY_META[t.priority ?? 'medium'].label }}</span>
              <span v-if="t.task_type" class="rounded-sm bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">{{ t.task_type }}</span>
            </div>
            <p v-if="t.description" class="mt-1.5 line-clamp-2 text-xs text-slate-500">{{ t.description }}</p>
            <div class="mt-2 flex items-center justify-between">
              <span v-if="t.due_at" class="flex items-center gap-1 text-xs" :class="isOverdue(t) ? 'font-medium text-red-600' : 'text-slate-400'">
                <CalendarClock class="h-3.5 w-3.5" /> {{ fmtDate(t.due_at) }} {{ fmtTime(t.due_at) }}
              </span>
              <span v-else></span>
              <div v-if="t.assignees.length" class="flex items-center -space-x-1.5">
                <span v-for="a in t.assignees.slice(0, 3)" :key="a.id" class="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-[#F69008] to-[#D97706] text-[9px] font-semibold text-white ring-2 ring-white" :title="a.name">{{ initials(a.name) }}</span>
                <span v-if="t.assignees.length > 3" class="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[9px] font-semibold text-slate-600 ring-2 ring-white">+{{ t.assignees.length - 3 }}</span>
              </div>
            </div>
            <p v-if="t.opportunity_title" class="mt-2 flex items-center gap-1 border-t border-slate-100 pt-2 text-[11px] text-slate-400"><Kanban class="h-3 w-3" /> {{ t.opportunity_title }}</p>
          </div>
          <p v-if="tasksOf(col.key).length === 0" class="py-6 text-center text-xs text-slate-400">Sin tareas</p>
          <!-- Quick Add -->
          <button class="kanban-quick-add" @click="openCreate(col.key)">
            <Plus class="h-3.5 w-3.5" /> Añadir tarea
          </button>
        </div>
      </div>
    </div>

    <!-- ── Vista lista ─────────────────────────────────────────────────────── -->
    <div v-else class="flex flex-1 flex-col overflow-hidden bg-slate-100/40">

      <!-- Stat cards (estilo Uxerflow) -->
      <div class="grid grid-cols-4 gap-4 px-6 pt-5 pb-2">
        <button
          class="group flex flex-col gap-1 rounded-xl border bg-white px-4 py-4 text-left shadow-card transition-all hover:shadow-elevated hover:-translate-y-0.5"
          :class="activeTab === 'today' ? 'border-amber-400 ring-2 ring-amber-100' : 'border-slate-200'"
          @click="activeTab = 'today'"
        >
          <div class="flex items-center justify-between w-full">
            <span class="flex items-center gap-1.5 text-xs font-semibold text-amber-600">
              <Calendar class="h-3.5 w-3.5" /> Hoy
            </span>
            <div class="flex h-7 w-7 items-center justify-center rounded-lg" :class="activeTab === 'today' ? 'bg-amber-100' : 'bg-slate-50'">
              <Clock class="h-3.5 w-3.5 text-amber-500" />
            </div>
          </div>
          <span class="text-2xl font-bold text-slate-900">{{ stats.today }}</span>
          <span class="text-[11px] text-slate-400">tareas para hoy</span>
        </button>

        <button
          class="group flex flex-col gap-1 rounded-xl border bg-white px-4 py-4 text-left shadow-card transition-all hover:shadow-elevated hover:-translate-y-0.5"
          :class="activeTab === 'overdue' ? 'border-red-400 ring-2 ring-red-100' : 'border-slate-200'"
          @click="activeTab = 'overdue'"
        >
          <div class="flex items-center justify-between w-full">
            <span class="flex items-center gap-1.5 text-xs font-semibold text-red-600">
              <Clock class="h-3.5 w-3.5" /> Atrasadas
            </span>
            <div class="flex h-7 w-7 items-center justify-center rounded-lg" :class="activeTab === 'overdue' ? 'bg-red-100' : 'bg-slate-50'">
              <Clock class="h-3.5 w-3.5 text-red-400" />
            </div>
          </div>
          <span class="text-2xl font-bold" :class="stats.overdue > 0 ? 'text-red-600' : 'text-slate-900'">{{ stats.overdue }}</span>
          <span class="text-[11px] text-slate-400">vencidas sin completar</span>
        </button>

        <button
          class="group flex flex-col gap-1 rounded-xl border bg-white px-4 py-4 text-left shadow-card transition-all hover:shadow-elevated hover:-translate-y-0.5"
          :class="activeTab === 'upcoming' ? 'border-primary ring-2 ring-primary/15' : 'border-slate-200'"
          @click="activeTab = 'upcoming'"
        >
          <div class="flex items-center justify-between w-full">
            <span class="text-xs font-semibold text-primary">Pendientes</span>
            <div class="flex h-7 w-7 items-center justify-center rounded-lg" :class="activeTab === 'upcoming' ? 'bg-[#F69008]/10' : 'bg-slate-50'">
              <Calendar class="h-3.5 w-3.5 text-primary" />
            </div>
          </div>
          <span class="text-2xl font-bold text-slate-900">{{ stats.pending }}</span>
          <span class="text-[11px] text-slate-400">próximas o sin fecha</span>
        </button>

        <button
          class="group flex flex-col gap-1 rounded-xl border bg-white px-4 py-4 text-left shadow-card transition-all hover:shadow-elevated hover:-translate-y-0.5"
          :class="activeTab === 'done' ? 'border-emerald-400 ring-2 ring-emerald-100' : 'border-slate-200'"
          @click="activeTab = 'done'"
        >
          <div class="flex items-center justify-between w-full">
            <span class="text-xs font-semibold text-emerald-600">Completadas</span>
            <span class="badge-trend badge-trend--up text-[10px]">{{ stats.done_pct }}%</span>
          </div>
          <span class="text-2xl font-bold text-slate-900">{{ stats.done }}</span>
          <span class="text-[11px] text-slate-400">finalizadas en total</span>
        </button>
      </div>

      <!-- Tabs -->
      <div class="border-b border-slate-200 bg-white px-6 pt-3">
        <div class="flex gap-1">
          <button v-for="tab in [
            { key: 'today',    label: 'Hoy',       count: tabTasks.today.length },
            { key: 'overdue',  label: 'Atrasadas', count: tabTasks.overdue.length },
            { key: 'upcoming', label: 'Próximas',  count: tabTasks.upcoming.length },
            { key: 'done',     label: 'Hechas',    count: tabTasks.done.length },
          ]" :key="tab.key" type="button"
            class="cursor-pointer px-4 py-2.5 text-sm font-medium transition-colors"
            :class="activeTab === tab.key
              ? 'border-b-2 border-primary text-primary'
              : 'text-slate-500 hover:text-slate-900'"
            @click="activeTab = tab.key as any">
            {{ tab.label }} <span class="ml-1 text-xs font-normal text-slate-400">({{ tab.count }})</span>
          </button>
        </div>
      </div>

      <!-- Listado -->
      <div class="flex-1 overflow-auto px-6 py-4">
        <div class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
          <div class="divide-y divide-slate-100">
            <div v-for="t in currentTab" :key="t.id"
              class="group flex items-center gap-3 border-l-4 px-4 py-3 transition-colors hover:bg-[#F69008]/5"
              :class="PRIORITY_META[t.priority ?? 'medium'].border">
              <!-- Checkbox circular -->
              <button class="flex h-5 w-5 flex-shrink-0 cursor-pointer items-center justify-center rounded-full border-2 transition-all"
                :class="t.status === 'done' ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 hover:border-primary'"
                @click="changeStatus(t, t.status === 'done' ? 'pending' : 'done')">
                <Check v-if="t.status === 'done'" class="h-3 w-3" />
              </button>

              <!-- Contenido -->
              <div class="min-w-0 flex-1 cursor-pointer" @click="openEdit(t)">
                <p class="truncate text-sm font-medium" :class="t.status === 'done' ? 'text-slate-400 line-through' : 'text-slate-900'">{{ t.title }}</p>
                <div class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <!-- Badges -->
                  <span class="rounded-sm px-1.5 py-0.5 text-[10px] font-semibold" :class="PRIORITY_META[t.priority ?? 'medium'].color">{{ PRIORITY_META[t.priority ?? 'medium'].label }}</span>
                  <span v-if="t.task_type" class="rounded-sm bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">{{ t.task_type }}</span>
                  <!-- Fecha y hora -->
                  <span v-if="t.due_at" class="flex items-center gap-1 text-xs" :class="isOverdue(t) ? 'font-medium text-red-600' : 'text-slate-400'">
                    <CalendarClock class="h-3.5 w-3.5" /> {{ fmtDate(t.due_at) }} · {{ fmtTime(t.due_at) }}
                  </span>
                  <!-- Oportunidad -->
                  <span v-if="t.opportunity_title" class="flex items-center gap-1 text-xs text-slate-400">
                    <Kanban class="h-3.5 w-3.5" /> {{ t.opportunity_title }}
                  </span>
                </div>
              </div>

              <!-- Avatares -->
              <div v-if="t.assignees.length" class="flex flex-shrink-0 items-center -space-x-1.5">
                <span v-for="a in t.assignees.slice(0, 3)" :key="a.id" class="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[#F69008] to-[#D97706] text-[10px] font-semibold text-white ring-2 ring-white" :title="a.name">{{ initials(a.name) }}</span>
                <span v-if="t.assignees.length > 3" class="flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-600 ring-2 ring-white">+{{ t.assignees.length - 3 }}</span>
              </div>

              <StatusSelect :model-value="t.status" @update:model-value="s => changeStatus(t, s)" />
              <div class="flex items-center gap-1">
                <button class="cursor-pointer rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-primary" @click="openEdit(t)"><Pencil class="h-4 w-4" /></button>
                <button class="cursor-pointer rounded-md p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600" @click="remove(t)"><Trash2 class="h-4 w-4" /></button>
              </div>
            </div>
            <div v-if="currentTab.length === 0" class="px-4 py-12 text-center text-slate-400">Sin tareas en esta categoría</div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Modal crear/editar ─────────────────────────────────────────────── -->
    <Transition name="modal">
    <div v-if="showForm" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" @click.self="showForm = false">
      <div class="modal-panel flex max-h-[92vh] w-full max-w-lg flex-col rounded-md bg-white shadow-modal">
        <div class="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 class="text-base font-semibold text-slate-900">{{ editing ? 'Editar tarea' : 'Nueva tarea' }}</h2>
          <button class="cursor-pointer rounded-md p-1 text-slate-400 hover:bg-slate-100" @click="showForm = false"><X class="h-5 w-5" /></button>
        </div>

        <form class="flex-1 space-y-4 overflow-auto px-6 py-5" @submit.prevent="save">
          <!-- Título -->
          <div>
            <label class="mb-1 block text-sm font-medium text-slate-700">Nombre de la tarea *</label>
            <input v-model="form.title" required class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none" />
          </div>

          <!-- Tipo + Prioridad -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="mb-1 block text-sm font-medium text-slate-700">Tipo</label>
              <select v-model="form.task_type" class="w-full cursor-pointer rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none">
                <option value="">Sin tipo</option>
                <option v-for="tp in TASK_TYPES" :key="tp" :value="tp">{{ tp }}</option>
              </select>
            </div>
            <div>
              <label class="mb-1 block text-sm font-medium text-slate-700">Prioridad</label>
              <select v-model="form.priority" class="w-full cursor-pointer rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none">
                <option v-for="p in PRIORITIES" :key="p.value" :value="p.value">{{ p.label }}</option>
              </select>
            </div>
          </div>

          <!-- Fecha + Hora -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="mb-1 block text-sm font-medium text-slate-700">Fecha *</label>
              <input v-model="form.due_date" type="date" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none" />
            </div>
            <div>
              <label class="mb-1 block text-sm font-medium text-slate-700">Hora</label>
              <input v-model="form.due_time" type="time" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none" />
            </div>
          </div>

          <!-- Oportunidad asociada -->
          <div>
            <label class="mb-1 block text-sm font-medium text-slate-700">Oportunidad asociada (opcional)</label>
            <select v-model="form.opportunity_id" class="w-full cursor-pointer rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none">
              <option value="">Sin oportunidad</option>
              <option v-for="o in opps" :key="o.id" :value="o.id">{{ o.title }}</option>
            </select>
          </div>

          <!-- Recordatorio -->
          <div>
            <label class="mb-1 block text-sm font-medium text-slate-700">Recordatorio</label>
            <select v-model="form.reminder" class="w-full cursor-pointer rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none">
              <option v-for="r in REMINDER_OPTIONS" :key="r.value" :value="r.value">{{ r.label }}</option>
            </select>
          </div>

          <!-- Responsables -->
          <div>
            <label class="mb-1 block text-sm font-medium text-slate-700">Responsables</label>
            <div class="flex flex-wrap items-center gap-2 rounded-md border border-slate-300 bg-white p-2 shadow-sm">
              <span v-for="u in followerUsers" :key="u.id" class="flex items-center gap-1.5 rounded-full bg-slate-100 py-0.5 pl-0.5 pr-2 text-xs font-medium text-slate-700">
                <span class="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-[#F69008] to-[#D97706] text-[9px] font-semibold text-white">{{ initials(u.name) }}</span>
                {{ u.name }}
                <button type="button" class="cursor-pointer text-slate-400 hover:text-red-500" @click="removeAssignee(u.id)"><X class="h-3 w-3" /></button>
              </span>
              <Dropdown v-if="availableUsers.length" width="220px">
                <template #trigger>
                  <button type="button" class="flex cursor-pointer items-center gap-1 rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-500 transition-colors hover:border-primary hover:text-primary"><UserPlus class="h-3.5 w-3.5" /> Añadir</button>
                </template>
                <button v-for="u in availableUsers" :key="u.id" type="button" class="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-100" @click="addAssignee(u.id)">
                  <span class="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-[#F69008] to-[#D97706] text-[10px] font-semibold text-white">{{ initials(u.name) }}</span>
                  {{ u.name }}
                </button>
              </Dropdown>
              <span v-if="!followerUsers.length && !availableUsers.length" class="px-1 text-xs text-slate-400">No hay usuarios</span>
            </div>
          </div>

          <!-- Descripción / Notas -->
          <div>
            <label class="mb-1 block text-sm font-medium text-slate-700">Notas</label>
            <textarea v-model="form.description" rows="3" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"></textarea>
          </div>
        </form>

        <div class="flex items-center justify-between border-t border-slate-200 px-6 py-4">
          <button v-if="editing" class="cursor-pointer rounded-md px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50" @click="remove(editing!)">Eliminar</button>
          <div class="ml-auto flex gap-2">
            <button class="cursor-pointer rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100" @click="showForm = false">Cancelar</button>
            <button :disabled="saving || !form.title.trim()" class="flex cursor-pointer items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-primary/30 transition-all hover:bg-primary-dark hover:shadow-md disabled:opacity-60" @click="save">
              <Spinner v-if="saving" :size="16" light /> {{ saving ? 'Guardando…' : editing ? 'Guardar' : 'Crear tarea' }}
            </button>
          </div>
        </div>
      </div>
    </div>
    </Transition>

  </div>
</template>
