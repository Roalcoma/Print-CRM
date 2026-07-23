<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { Plus, Search, Pencil, Trash2, X, Check, CalendarClock, Kanban } from 'lucide-vue-next';
import { api } from '../api';
import type { Task, User } from '../types';
import Spinner from '../components/Spinner.vue';
import LoadingState from '../components/LoadingState.vue';

const tasks = ref<Task[]>([]);
const users = ref<User[]>([]);
const loading = ref(true);
const statusFilter = ref<'pending' | 'done' | ''>('pending');
const assigneeFilter = ref('');
const search = ref('');

async function load() {
  const qs = new URLSearchParams();
  if (statusFilter.value) qs.set('status', statusFilter.value);
  if (assigneeFilter.value) qs.set('assigneeId', assigneeFilter.value);
  tasks.value = await api.get<Task[]>(`/tasks${qs.toString() ? `?${qs}` : ''}`);
}
onMounted(async () => {
  try {
    users.value = await api.get<User[]>('/users');
    await load();
  } finally { loading.value = false; }
});

const filtered = computed(() => {
  const t = search.value.trim().toLowerCase();
  return t ? tasks.value.filter(x => x.title.toLowerCase().includes(t)) : tasks.value;
});

const initials = (n: string) => n.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
const fmtDue = (iso: string) => new Date(iso).toLocaleString('es-VE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const isOverdue = (t: Task) => t.status === 'pending' && t.due_at && new Date(t.due_at) < new Date();

async function toggleDone(t: Task) {
  const updated = await api.patch<Task>(`/tasks/${t.id}`, { status: t.status === 'done' ? 'pending' : 'done' });
  // Si el filtro es "pendientes", al completar desaparece; recargamos para respetar el filtro.
  if (statusFilter.value) await load();
  else Object.assign(t, updated);
}

// ── Modal crear/editar ────────────────────────────────────────────────────────
const showForm = ref(false);
const editing = ref<Task | null>(null);
const saving = ref(false);
const form = ref({ title: '', description: '', assignee_id: '', due_at: '' });

// ISO <-> valor de <input type="datetime-local">
function toLocalInput(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function openCreate() {
  editing.value = null;
  form.value = { title: '', description: '', assignee_id: '', due_at: '' };
  showForm.value = true;
}
function openEdit(t: Task) {
  editing.value = t;
  form.value = { title: t.title, description: t.description ?? '', assignee_id: t.assignee_id ?? '', due_at: toLocalInput(t.due_at) };
  showForm.value = true;
}
async function save() {
  saving.value = true;
  try {
    const payload = {
      title: form.value.title,
      description: form.value.description || null,
      assignee_id: form.value.assignee_id || null,
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
  <div class="p-8">
    <div class="mx-auto max-w-5xl">
      <div class="mb-6 flex items-center justify-between">
        <div>
          <h2 class="text-xl font-semibold text-slate-900">Tareas</h2>
          <p class="mt-1 text-sm text-slate-500">Organiza y asigna tareas a tu equipo con fechas de vencimiento.</p>
        </div>
        <button class="flex flex-shrink-0 cursor-pointer items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-primary/30 transition-all hover:bg-primary-dark hover:shadow-md" @click="openCreate">
          <Plus class="h-4 w-4" /> Nueva tarea
        </button>
      </div>

      <!-- Toolbar -->
      <div class="mb-4 flex flex-wrap items-center gap-3">
        <select v-model="statusFilter" @change="load" class="cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none">
          <option value="pending">Pendientes</option>
          <option value="done">Completadas</option>
          <option value="">Todas</option>
        </select>
        <select v-model="assigneeFilter" @change="load" class="cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none">
          <option value="">Todos los responsables</option>
          <option v-for="u in users" :key="u.id" :value="u.id">{{ u.name }}</option>
        </select>
        <div class="relative flex-1 sm:max-w-xs">
          <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input v-model="search" placeholder="Buscar tarea…" class="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none" />
        </div>
      </div>

      <LoadingState v-if="loading" label="Cargando tareas…" />

      <div v-else class="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-card">
        <div class="divide-y divide-slate-100">
          <div v-for="t in filtered" :key="t.id" class="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-indigo-50/40">
            <!-- Completar -->
            <button
              class="flex h-5 w-5 flex-shrink-0 cursor-pointer items-center justify-center rounded-full border-2 transition-colors"
              :class="t.status === 'done' ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 hover:border-primary'"
              :title="t.status === 'done' ? 'Marcar pendiente' : 'Completar'"
              @click="toggleDone(t)"
            >
              <Check v-if="t.status === 'done'" class="h-3 w-3" />
            </button>

            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium" :class="t.status === 'done' ? 'text-slate-400 line-through' : 'text-slate-900'">{{ t.title }}</p>
              <div class="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                <span v-if="t.due_at" class="flex items-center gap-1" :class="isOverdue(t) && 'font-medium text-red-600'">
                  <CalendarClock class="h-3.5 w-3.5" /> {{ fmtDue(t.due_at) }}
                </span>
                <span v-if="t.opportunity_title" class="flex items-center gap-1"><Kanban class="h-3.5 w-3.5" /> {{ t.opportunity_title }}</span>
              </div>
            </div>

            <!-- Responsable -->
            <div v-if="t.assignee_name" class="flex items-center gap-2" :title="t.assignee_name">
              <div class="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-[10px] font-semibold text-white shadow-sm">{{ initials(t.assignee_name) }}</div>
            </div>
            <span v-else class="text-xs text-slate-400">Sin asignar</span>

            <div class="flex items-center gap-1">
              <button class="cursor-pointer rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-primary" title="Editar" @click="openEdit(t)"><Pencil class="h-4 w-4" /></button>
              <button class="cursor-pointer rounded-md p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600" title="Eliminar" @click="remove(t)"><Trash2 class="h-4 w-4" /></button>
            </div>
          </div>
          <div v-if="filtered.length === 0" class="px-4 py-12 text-center text-slate-400">
            {{ search ? 'Ninguna tarea coincide.' : statusFilter === 'pending' ? 'No hay tareas pendientes. ¡Todo al día!' : 'No hay tareas.' }}
          </div>
        </div>
      </div>
    </div>

    <!-- Modal crear/editar -->
    <Transition name="modal">
    <div v-if="showForm" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" @click.self="showForm = false">
      <div class="modal-panel flex max-h-[90vh] w-full max-w-md flex-col rounded-md bg-white shadow-modal">
        <div class="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div class="flex items-center gap-3">
            <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm"><Check class="h-5 w-5" /></div>
            <h2 class="text-base font-semibold text-slate-900">{{ editing ? 'Editar tarea' : 'Nueva tarea' }}</h2>
          </div>
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
              <label class="mb-1 block text-sm font-medium text-slate-700">Responsable</label>
              <select v-model="form.assignee_id" class="w-full cursor-pointer rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none">
                <option value="">Sin asignar</option>
                <option v-for="u in users" :key="u.id" :value="u.id">{{ u.name }}</option>
              </select>
            </div>
            <div>
              <label class="mb-1 block text-sm font-medium text-slate-700">Vencimiento</label>
              <input v-model="form.due_at" type="datetime-local" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none" />
            </div>
          </div>
        </form>

        <div class="flex items-center justify-end gap-2 border-t border-slate-200 px-6 py-4">
          <button class="cursor-pointer rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100" @click="showForm = false">Cancelar</button>
          <button :disabled="saving || !form.title.trim()" class="flex cursor-pointer items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-primary/30 transition-all hover:bg-primary-dark hover:shadow-md disabled:opacity-60" @click="save"><Spinner v-if="saving" :size="16" light /> {{ saving ? 'Guardando…' : editing ? 'Guardar' : 'Crear tarea' }}</button>
        </div>
      </div>
    </div>
    </Transition>
  </div>
</template>
