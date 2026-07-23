<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { Plus, Search, Pencil, Trash2, X, CalendarClock, Kanban, UserPlus } from 'lucide-vue-next';
import { api } from '../api';
import type { Task, TaskStatus, User } from '../types';
import { TASK_STATUSES, statusBadge } from '../taskStatus';
import { useAuthStore } from '../stores/auth';
import Spinner from '../components/Spinner.vue';
import LoadingState from '../components/LoadingState.vue';
import Dropdown from '../components/Dropdown.vue';
import ViewToggle from '../components/ViewToggle.vue';

const auth = useAuthStore();
const tasks = ref<Task[]>([]);
const users = ref<User[]>([]);
const loading = ref(true);
const assigneeFilter = ref('');
const search = ref('');
const dragId = ref<string | null>(null);

// Vista tablero/lista (recordada en la cuenta).
const viewMode = ref<'board' | 'list'>(auth.preferences.taskView === 'list' ? 'list' : 'board');
watch(viewMode, v => auth.savePreferences({ taskView: v }));
async function changeStatus(t: Task, status: TaskStatus) {
  t.status = status;
  await api.patch(`/tasks/${t.id}`, { status });
}

async function load() { tasks.value = await api.get<Task[]>('/tasks'); }
onMounted(async () => {
  try { users.value = await api.get<User[]>('/users'); await load(); }
  finally { loading.value = false; }
});

const initials = (n: string) => n.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
const fmtDue = (iso: string) => new Date(iso).toLocaleString('es-VE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const isOverdue = (t: Task) => t.status !== 'done' && t.status !== 'cancelled' && t.due_at && new Date(t.due_at) < new Date();

const filtered = computed(() => {
  const t = search.value.trim().toLowerCase();
  return tasks.value.filter(x =>
    (!assigneeFilter.value || x.assignees.some(a => a.id === assigneeFilter.value)) &&
    (!t || x.title.toLowerCase().includes(t)),
  );
});
function tasksOf(status: TaskStatus) { return filtered.value.filter(t => t.status === status); }

// Drag & drop entre columnas de estado.
function onDragStart(id: string) { dragId.value = id; }
async function onDrop(status: TaskStatus) {
  const id = dragId.value; dragId.value = null;
  if (!id) return;
  const t = tasks.value.find(x => x.id === id);
  if (!t || t.status === status) return;
  t.status = status; // optimista
  await api.patch(`/tasks/${id}`, { status });
}

// ── Modal crear/editar ────────────────────────────────────────────────────────
const showForm = ref(false);
const editing = ref<Task | null>(null);
const saving = ref(false);
const form = ref({ title: '', description: '', status: 'pending' as TaskStatus, assignee_ids: [] as string[], due_at: '' });

function toLocalInput(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
const followerUsers = computed(() => users.value.filter(u => form.value.assignee_ids.includes(u.id)));
const availableUsers = computed(() => users.value.filter(u => !form.value.assignee_ids.includes(u.id)));
function addAssignee(id: string) { if (!form.value.assignee_ids.includes(id)) form.value.assignee_ids.push(id); }
function removeAssignee(id: string) { form.value.assignee_ids = form.value.assignee_ids.filter(x => x !== id); }

function openCreate(status: TaskStatus = 'pending') {
  editing.value = null;
  form.value = { title: '', description: '', status, assignee_ids: [], due_at: '' };
  showForm.value = true;
}
function openEdit(t: Task) {
  editing.value = t;
  form.value = { title: t.title, description: t.description ?? '', status: t.status, assignee_ids: t.assignees.map(a => a.id), due_at: toLocalInput(t.due_at) };
  showForm.value = true;
}
async function save() {
  saving.value = true;
  try {
    const payload = {
      title: form.value.title, description: form.value.description || null, status: form.value.status,
      assignee_ids: form.value.assignee_ids,
      due_at: form.value.due_at ? new Date(form.value.due_at).toISOString() : null,
    };
    if (editing.value) await api.patch(`/tasks/${editing.value.id}`, payload);
    else await api.post('/tasks', payload);
    showForm.value = false;
    await load();
  } finally { saving.value = false; }
}
async function remove(t: Task) {
  if (!confirm('¿Eliminar esta tarea?')) return;
  await api.del(`/tasks/${t.id}`);
  await load();
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-6 py-3 shadow-toolbar">
      <div>
        <h2 class="text-base font-semibold text-slate-900">Tareas</h2>
      </div>
      <select v-model="assigneeFilter" class="ml-2 cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none">
        <option value="">Todos los responsables</option>
        <option v-for="u in users" :key="u.id" :value="u.id">{{ u.name }}</option>
      </select>
      <div class="relative">
        <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input v-model="search" placeholder="Buscar tarea…" class="w-56 rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none" />
      </div>
      <ViewToggle v-model="viewMode" class="ml-auto" />
      <button class="flex cursor-pointer items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-primary/30 transition-all hover:bg-primary-dark hover:shadow-md" @click="openCreate()">
        <Plus class="h-4 w-4" /> Nueva tarea
      </button>
    </div>

    <LoadingState v-if="loading" label="Cargando tareas…" />

    <!-- Tablero -->
    <div v-else-if="viewMode === 'board'" class="flex flex-1 gap-4 overflow-x-auto bg-slate-100/60 p-6">
      <div v-for="col in TASK_STATUSES" :key="col.key" class="flex w-80 flex-shrink-0 flex-col overflow-hidden rounded-md border border-slate-200 bg-white shadow-card" @dragover.prevent @drop="onDrop(col.key)">
        <div class="flex items-center justify-between px-4 py-3" :style="{ backgroundColor: col.color }">
          <div class="flex items-center gap-2">
            <span class="text-sm font-semibold text-slate-800">{{ col.label }}</span>
            <span class="rounded-sm bg-white/70 px-1.5 py-0.5 text-xs font-semibold text-slate-600">{{ tasksOf(col.key).length }}</span>
          </div>
          <button class="cursor-pointer rounded p-0.5 text-slate-600 transition-colors hover:bg-white/60" title="Nueva tarea" @click="openCreate(col.key)"><Plus class="h-4 w-4" /></button>
        </div>

        <div class="flex-1 space-y-2.5 overflow-y-auto bg-slate-50/50 p-2.5">
          <div v-for="t in tasksOf(col.key)" :key="t.id" draggable="true"
            class="group cursor-grab rounded-md border border-slate-200 bg-white p-3 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-elevated active:cursor-grabbing"
            @dragstart="onDragStart(t.id)" @click="openEdit(t)">
            <div class="flex items-start justify-between gap-2">
              <p class="text-sm font-medium" :class="t.status === 'done' ? 'text-slate-400 line-through' : 'text-slate-900'">{{ t.title }}</p>
              <div class="flex flex-shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                <button class="cursor-pointer rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-primary" @click.stop="openEdit(t)"><Pencil class="h-3.5 w-3.5" /></button>
                <button class="cursor-pointer rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" @click.stop="remove(t)"><Trash2 class="h-3.5 w-3.5" /></button>
              </div>
            </div>
            <p v-if="t.description" class="mt-1 line-clamp-2 text-xs text-slate-500">{{ t.description }}</p>
            <div class="mt-2 flex items-center justify-between">
              <span v-if="t.due_at" class="flex items-center gap-1 text-xs" :class="isOverdue(t) ? 'font-medium text-red-600' : 'text-slate-400'"><CalendarClock class="h-3.5 w-3.5" /> {{ fmtDue(t.due_at) }}</span>
              <span v-else></span>
              <div v-if="t.assignees.length" class="flex items-center -space-x-1.5">
                <span v-for="a in t.assignees.slice(0, 3)" :key="a.id" class="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-[9px] font-semibold text-white ring-2 ring-white" :title="a.name">{{ initials(a.name) }}</span>
                <span v-if="t.assignees.length > 3" class="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[9px] font-semibold text-slate-600 ring-2 ring-white">+{{ t.assignees.length - 3 }}</span>
              </div>
            </div>
            <p v-if="t.opportunity_title" class="mt-2 flex items-center gap-1 border-t border-slate-100 pt-2 text-[11px] text-slate-400"><Kanban class="h-3 w-3" /> {{ t.opportunity_title }}</p>
          </div>
          <p v-if="tasksOf(col.key).length === 0" class="py-6 text-center text-xs text-slate-400">Sin tareas</p>
        </div>
      </div>
    </div>

    <!-- Vista de lista -->
    <div v-else class="flex-1 overflow-auto bg-slate-100/40 p-6">
      <div class="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-card">
        <div class="divide-y divide-slate-100">
          <div v-for="t in filtered" :key="t.id" class="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-indigo-50/40">
            <div class="min-w-0 flex-1 cursor-pointer" @click="openEdit(t)">
              <p class="truncate text-sm font-medium" :class="t.status === 'done' ? 'text-slate-400 line-through' : 'text-slate-900'">{{ t.title }}</p>
              <div class="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                <span v-if="t.due_at" class="flex items-center gap-1" :class="isOverdue(t) && 'font-medium text-red-600'"><CalendarClock class="h-3.5 w-3.5" /> {{ fmtDue(t.due_at) }}</span>
                <span v-if="t.opportunity_title" class="flex items-center gap-1"><Kanban class="h-3.5 w-3.5" /> {{ t.opportunity_title }}</span>
              </div>
            </div>
            <div v-if="t.assignees.length" class="flex items-center -space-x-1.5">
              <span v-for="a in t.assignees.slice(0, 3)" :key="a.id" class="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-[10px] font-semibold text-white ring-2 ring-white" :title="a.name">{{ initials(a.name) }}</span>
              <span v-if="t.assignees.length > 3" class="flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-600 ring-2 ring-white">+{{ t.assignees.length - 3 }}</span>
            </div>
            <select :value="t.status" class="cursor-pointer rounded-md border border-slate-300 px-2 py-1 text-xs font-medium shadow-sm focus:outline-none" :class="statusBadge(t.status)" @change="changeStatus(t, ($event.target as HTMLSelectElement).value as TaskStatus)">
              <option v-for="s in TASK_STATUSES" :key="s.key" :value="s.key">{{ s.label }}</option>
            </select>
            <div class="flex items-center gap-1">
              <button class="cursor-pointer rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-primary" title="Editar" @click="openEdit(t)"><Pencil class="h-4 w-4" /></button>
              <button class="cursor-pointer rounded-md p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600" title="Eliminar" @click="remove(t)"><Trash2 class="h-4 w-4" /></button>
            </div>
          </div>
          <div v-if="filtered.length === 0" class="px-4 py-12 text-center text-slate-400">Sin tareas</div>
        </div>
      </div>
    </div>

    <!-- Modal crear/editar -->
    <Transition name="modal">
    <div v-if="showForm" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" @click.self="showForm = false">
      <div class="modal-panel flex max-h-[90vh] w-full max-w-md flex-col rounded-md bg-white shadow-modal">
        <div class="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 class="text-base font-semibold text-slate-900">{{ editing ? 'Editar tarea' : 'Nueva tarea' }}</h2>
          <button class="cursor-pointer rounded-md p-1 text-slate-400 hover:bg-slate-100" @click="showForm = false"><X class="h-5 w-5" /></button>
        </div>

        <form class="flex-1 space-y-4 overflow-auto px-6 py-5" @submit.prevent="save">
          <div>
            <label class="mb-1 block text-sm font-medium text-slate-700">Título *</label>
            <input v-model="form.title" required class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none" />
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium text-slate-700">Descripción</label>
            <textarea v-model="form.description" rows="3" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"></textarea>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="mb-1 block text-sm font-medium text-slate-700">Estado</label>
              <select v-model="form.status" class="w-full cursor-pointer rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none">
                <option v-for="s in TASK_STATUSES" :key="s.key" :value="s.key">{{ s.label }}</option>
              </select>
            </div>
            <div>
              <label class="mb-1 block text-sm font-medium text-slate-700">Vencimiento</label>
              <input v-model="form.due_at" type="datetime-local" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none" />
            </div>
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium text-slate-700">Responsables</label>
            <div class="flex flex-wrap items-center gap-2 rounded-md border border-slate-300 bg-white p-2 shadow-sm">
              <span v-for="u in followerUsers" :key="u.id" class="flex items-center gap-1.5 rounded-full bg-slate-100 py-0.5 pl-0.5 pr-2 text-xs font-medium text-slate-700">
                <span class="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-[9px] font-semibold text-white">{{ initials(u.name) }}</span>
                {{ u.name }}
                <button type="button" class="cursor-pointer text-slate-400 hover:text-red-500" @click="removeAssignee(u.id)"><X class="h-3 w-3" /></button>
              </span>
              <Dropdown v-if="availableUsers.length" width="220px">
                <template #trigger>
                  <button type="button" class="flex cursor-pointer items-center gap-1 rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-500 transition-colors hover:border-primary hover:text-primary"><UserPlus class="h-3.5 w-3.5" /> Añadir</button>
                </template>
                <button v-for="u in availableUsers" :key="u.id" type="button" class="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-100" @click="addAssignee(u.id)">
                  <span class="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-[10px] font-semibold text-white">{{ initials(u.name) }}</span>
                  {{ u.name }}
                </button>
              </Dropdown>
              <span v-if="!followerUsers.length && !availableUsers.length" class="px-1 text-xs text-slate-400">No hay usuarios</span>
            </div>
          </div>
        </form>

        <div class="flex items-center justify-between border-t border-slate-200 px-6 py-4">
          <button v-if="editing" class="cursor-pointer rounded-md px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50" @click="remove(editing); showForm = false">Eliminar</button>
          <div class="ml-auto flex gap-2">
            <button class="cursor-pointer rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100" @click="showForm = false">Cancelar</button>
            <button :disabled="saving || !form.title.trim()" class="flex cursor-pointer items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-primary/30 transition-all hover:bg-primary-dark hover:shadow-md disabled:opacity-60" @click="save"><Spinner v-if="saving" :size="16" light /> {{ saving ? 'Guardando…' : editing ? 'Guardar' : 'Crear tarea' }}</button>
          </div>
        </div>
      </div>
    </div>
    </Transition>
  </div>
</template>
