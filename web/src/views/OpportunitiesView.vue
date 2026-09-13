<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { Plus, Search, Filter, Download, Upload, X, Trash2, MoreVertical, ChevronDown, Check, UserRound, Briefcase, Kanban, StickyNote, UserPlus, Link2, SlidersHorizontal, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-vue-next';
import { api, getToken } from '../api';
import type { Pipeline, Opportunity, FilterCondition, FilterOp, Note, User, Task, TaskStatus } from '../types';
import { ListTodo, CalendarClock } from 'lucide-vue-next';
import OppTabs from '../components/OppTabs.vue';
import Dropdown from '../components/Dropdown.vue';
import Spinner from '../components/Spinner.vue';
import LoadingState from '../components/LoadingState.vue';
import OpportunityCard from '../components/OpportunityCard.vue';
import CustomizeCardPanel from '../components/CustomizeCardPanel.vue';
import ViewToggle from '../components/ViewToggle.vue';
import StatusSelect from '../components/StatusSelect.vue';
import { normalizeCardConfig, type CardConfig } from '../cardConfig';
import { useAuthStore } from '../stores/auth';

const KNOWN_SOURCES = ['whatsapp','facebook','instagram','tiktok','google','linkedin','referido','sitio_web','email','llamada'];

const pipelines = ref<Pipeline[]>([]);
const users = ref<User[]>([]);
const currentId = ref<string>('');
const opps = ref<Opportunity[]>([]);
const dragId = ref<string | null>(null);
const loading = ref(true);
const reloading = ref(false);

// Personalización de tarjetas (persistida en la cuenta del usuario).
const router = useRouter();
const auth = useAuthStore();
const cardConfig = computed<CardConfig>(() => normalizeCardConfig(auth.preferences.cardConfig));
const showCustomize = ref(false);
async function applyCardConfig(c: CardConfig) {
  showCustomize.value = false;
  await auth.savePreferences({ cardConfig: c });
}

// Vista tablero/lista (recordada en la cuenta).
const viewMode = ref<'board' | 'list'>(auth.preferences.oppView === 'list' ? 'list' : 'board');
watch(viewMode, v => auth.savePreferences({ oppView: v }));
const stageById = computed(() => {
  const m: Record<string, { name: string; color: string }> = {};
  (current.value?.stages ?? []).forEach(s => { m[s.id] = { name: s.name, color: s.color }; });
  return m;
});
const statusBadgeCls: Record<string, string> = { open: 'bg-blue-50 text-blue-600', won: 'bg-emerald-50 text-emerald-600', lost: 'bg-red-50 text-red-600' };
const statusLbl: Record<string, string> = { open: 'Abierta', won: 'Ganada', lost: 'Perdida' };

const search = ref('');
const showFilters = ref(false);    // sidebar de filtros
const match = ref<'AND' | 'OR'>('AND');
const conditions = ref<FilterCondition[]>([]);

// ── Quick-filter sidebar state ────────────────────────────────────────────────
const qf = ref({
  statuses:      [] as string[],
  stageIds:      [] as string[],
  owner_id:      '',
  value_min:     '',
  value_max:     '',
  source:        '',
  business_name: '',
  contact:       '',
  tags:          '',
  created_from:  '',
  created_to:    '',
});

const activeQfCount = computed(() => {
  const q = qf.value;
  return [
    q.statuses.length > 0, q.stageIds.length > 0, !!q.owner_id,
    !!q.value_min || !!q.value_max, !!q.source, !!q.business_name,
    !!q.contact, !!q.tags, !!q.created_from || !!q.created_to,
  ].filter(Boolean).length;
});

function toggleQfStatus(v: string) {
  const i = qf.value.statuses.indexOf(v);
  if (i >= 0) qf.value.statuses.splice(i, 1); else qf.value.statuses.push(v);
}
function toggleQfStage(id: string) {
  const i = qf.value.stageIds.indexOf(id);
  if (i >= 0) qf.value.stageIds.splice(i, 1); else qf.value.stageIds.push(id);
}
function applyQf() {
  conditions.value = [];
  qf.value.statuses.forEach(s  => conditions.value.push({ field: 'status',        op: 'is',       value: s }));
  qf.value.stageIds.forEach(id => conditions.value.push({ field: 'stage',         op: 'is',       value: id }));
  if (qf.value.owner_id)      conditions.value.push({ field: 'owner_id',      op: 'is',       value: qf.value.owner_id });
  if (qf.value.value_min)     conditions.value.push({ field: 'value',         op: 'gte',      value: qf.value.value_min });
  if (qf.value.value_max)     conditions.value.push({ field: 'value',         op: 'lte',      value: qf.value.value_max });
  if (qf.value.source)        conditions.value.push({ field: 'source',        op: 'contains', value: qf.value.source });
  if (qf.value.business_name) conditions.value.push({ field: 'business_name', op: 'contains', value: qf.value.business_name });
  if (qf.value.contact)       conditions.value.push({ field: 'contact',       op: 'contains', value: qf.value.contact });
  if (qf.value.tags)          conditions.value.push({ field: 'tags',          op: 'contains', value: qf.value.tags });
  if (qf.value.created_from)  conditions.value.push({ field: 'created_at',    op: 'after',    value: qf.value.created_from });
  if (qf.value.created_to)    conditions.value.push({ field: 'created_at',    op: 'before',   value: qf.value.created_to });
  const hasMulti = qf.value.statuses.length > 1 || qf.value.stageIds.length > 1;
  match.value = hasMulti ? 'OR' : 'AND';
  loadOpps();
  showFilters.value = false;
}
function clearQf() {
  qf.value = {
    statuses: [], stageIds: [], owner_id: '', value_min: '', value_max: '',
    source: '', business_name: '', contact: '', tags: '', created_from: '', created_to: '',
  };
  conditions.value = [];
  match.value = 'AND';
  loadOpps();
}

const current = computed(() => pipelines.value.find(p => p.id === currentId.value) ?? null);
const totalLeads = computed(() => opps.value.length);
const money = (n: number) => n.toLocaleString('es-VE', { style: 'currency', currency: 'USD' });
const dateTime = (d: string) => new Date(d).toLocaleString('es-VE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// ── Catálogo de campos filtrables ─────────────────────────────────────────────
const FIELDS = [
  { key: 'title', label: 'Título', type: 'text' },
  { key: 'value', label: 'Valor', type: 'number' },
  { key: 'status', label: 'Estado', type: 'enum' },
  { key: 'stage', label: 'Etapa', type: 'stage' },
  { key: 'contact', label: 'Contacto', type: 'text' },
  { key: 'created_at', label: 'Fecha de creación', type: 'date' },
] as const;
const OPS_BY_TYPE: Record<string, FilterOp[]> = {
  text: ['contains', 'not_contains', 'is', 'is_not', 'is_empty', 'is_not_empty'],
  number: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'],
  enum: ['is', 'is_not'], stage: ['is', 'is_not'], date: ['after', 'before'],
};
const OP_LABEL: Record<FilterOp, string> = {
  contains: 'contiene', not_contains: 'no contiene', is: 'es', is_not: 'no es',
  is_empty: 'está vacío', is_not_empty: 'no está vacío',
  eq: '=', neq: '≠', gt: '>', gte: '≥', lt: '<', lte: '≤', after: 'después de', before: 'antes de',
};
const NO_VALUE: FilterOp[] = ['is_empty', 'is_not_empty'];
const STATUS_OPTS = [{ v: 'open', l: 'Abierta' }, { v: 'won', l: 'Ganada' }, { v: 'lost', l: 'Perdida' }];
function fieldType(key: string) { return FIELDS.find(f => f.key === key)?.type ?? 'text'; }

// ── Carga ──────────────────────────────────────────────────────────────────────
async function loadPipelines() {
  pipelines.value = await api.get<Pipeline[]>('/pipelines');
  if ((!currentId.value || !current.value) && pipelines.value[0]) currentId.value = pipelines.value[0].id;
}
// ── Sort ──────────────────────────────────────────────────────────────────────
const SORT_OPTIONS = [
  { key: 'title',             label: 'Nombre de oportunidad' },
  { key: 'status',            label: 'Estado' },
  { key: 'value',             label: 'Valor' },
  { key: 'source',            label: 'Fuente' },
  { key: 'created_at',        label: 'Fecha de creación' },
  { key: 'updated_at',        label: 'Última actualización' },
  { key: 'last_stage_change', label: 'Último cambio de etapa' },
];
// Sort — persistido en localStorage; default: más reciente primero
const OPPS_PREF_KEY = 'crm.opps.sort';
function loadOppSort() {
  try { return JSON.parse(localStorage.getItem(OPPS_PREF_KEY) || '{}'); } catch { return {}; }
}
const _os = loadOppSort();
const sortBy  = ref<string>(_os.sortBy  ?? 'created_at');
const sortDir = ref<'asc' | 'desc'>(_os.sortDir ?? 'desc');
const hasSort = computed(() => sortBy.value !== 'created_at' || sortDir.value !== 'desc');

function saveOppSort() {
  localStorage.setItem(OPPS_PREF_KEY, JSON.stringify({ sortBy: sortBy.value, sortDir: sortDir.value }));
}
function clearSort() {
  sortBy.value = 'created_at'; sortDir.value = 'desc';
  saveOppSort(); loadOpps();
}
function toggleSortDir() {
  sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
  saveOppSort(); loadOpps();
}
function selectSort(key: string) {
  if (sortBy.value === key) { toggleSortDir(); return; }
  sortBy.value = key; sortDir.value = 'desc';
  saveOppSort(); loadOpps();
}

async function loadOpps() {
  if (!currentId.value) return;
  reloading.value = true;
  const filters = conditions.value
    .filter(c => c.field && c.op && (NO_VALUE.includes(c.op) || (c.value !== '' && c.value != null)))
    .map(c => ({ field: c.field, op: c.op, value: fieldType(c.field) === 'number' ? Number(c.value) : c.value }));
  try {
    opps.value = await api.post<Opportunity[]>('/opportunities/query', {
      pipelineId: currentId.value, search: search.value || undefined, match: match.value, filters,
      sort_by: sortBy.value || undefined, sort_dir: sortDir.value,
    });
  } finally {
    reloading.value = false;
  }
}
function onSourceChange(e: Event) {
  const v = (e.target as HTMLSelectElement).value;
  form.value.source = v === 'otro' ? '' : v;
  if (v === 'otro') nextTick(() => { (document.getElementById('source-custom') as HTMLInputElement | null)?.focus(); });
}

onMounted(async () => {
  try {
    users.value = await api.get<User[]>('/users');
    await loadPipelines();
    await loadOpps();
  } finally {
    loading.value = false;
  }
});
watch(currentId, loadOpps);

// Nº de condiciones realmente aplicadas (con valor válido).
const activeFilterCount = computed(() => conditions.value.filter(
  c => c.field && c.op && (NO_VALUE.includes(c.op) || (c.value !== '' && c.value != null)),
).length);
function clearFilters() { conditions.value = []; loadOpps(); }

let searchTimer: ReturnType<typeof setTimeout>;
function onSearch() { clearTimeout(searchTimer); searchTimer = setTimeout(loadOpps, 250); }

// ── Kanban helpers ───────────────────────────────────────────────────────────
function stageOpps(stageId: string) { return opps.value.filter(o => o.stage_id === stageId); }
function stageSum(stageId: string) { return money(stageOpps(stageId).reduce((s, o) => s + Number(o.value), 0)); }

// ── Drag & drop ──────────────────────────────────────────────────────────────
function onDragStart(id: string) { dragId.value = id; }
async function onDrop(stageId: string) {
  const id = dragId.value; dragId.value = null;
  if (!id) return;
  const opp = opps.value.find(o => o.id === id);
  if (!opp || opp.stage_id === stageId) return;
  opp.stage_id = stageId;
  await api.patch(`/opportunities/${id}`, { stage_id: stageId });
}

// ── Filtros ──────────────────────────────────────────────────────────────────
function addCondition() { conditions.value.push({ field: 'title', op: 'contains', value: '' }); }
function removeCondition(i: number) { conditions.value.splice(i, 1); loadOpps(); }
function onFieldChange(c: FilterCondition) { c.op = OPS_BY_TYPE[fieldType(c.field)][0]; c.value = ''; loadOpps(); }

// ── Import / Export CSV ──────────────────────────────────────────────────────
const fileInput = ref<HTMLInputElement | null>(null);
async function exportCsv() {
  const res = await fetch(`/api/opportunities/export/csv?pipelineId=${currentId.value}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url; a.download = 'oportunidades.csv'; a.click();
  URL.revokeObjectURL(url);
}
async function onImportFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const csv = await file.text();
  const res = await api.post<{ imported: number; errors: string[] }>('/opportunities/import', { pipelineId: currentId.value, csv });
  alert(`Importadas: ${res.imported}${res.errors.length ? `\nErrores:\n${res.errors.join('\n')}` : ''}`);
  if (fileInput.value) fileInput.value.value = '';
  await loadOpps();
}

// ── Formulario completo (estilo GHL) ─────────────────────────────────────────
const showForm = ref(false);
const modalTab = ref<'detalles' | 'notas' | 'tareas'>('detalles');
const editing = ref<Opportunity | null>(null);
const saving = ref(false);
const tagInput = ref('');
const notes = ref<Note[]>([]);
const newNote = ref('');

// Tareas de la oportunidad (tab Tareas, solo si el usuario tiene el módulo).
const oppTasks = ref<Task[]>([]);
const newTask = ref({ title: '', description: '', assignee_ids: [] as string[], due_at: '' });
const newTaskAssignees = computed(() => users.value.filter(u => newTask.value.assignee_ids.includes(u.id)));
const newTaskAvailable = computed(() => users.value.filter(u => !newTask.value.assignee_ids.includes(u.id)));
function addTaskAssignee(id: string) { if (!newTask.value.assignee_ids.includes(id)) newTask.value.assignee_ids.push(id); }
function removeTaskAssignee(id: string) { newTask.value.assignee_ids = newTask.value.assignee_ids.filter(x => x !== id); }

async function loadOppTasks(oppId: string) {
  if (!auth.can('tasks')) return;
  oppTasks.value = await api.get<Task[]>(`/tasks?opportunityId=${oppId}`);
}
async function addOppTask() {
  if (!editing.value || !newTask.value.title.trim()) return;
  await api.post('/tasks', {
    title: newTask.value.title,
    description: newTask.value.description || null,
    opportunity_id: editing.value.id,
    assignee_ids: newTask.value.assignee_ids,
    due_at: newTask.value.due_at ? new Date(newTask.value.due_at).toISOString() : null,
  });
  newTask.value = { title: '', description: '', assignee_ids: [], due_at: '' };
  await loadOppTasks(editing.value.id);
}
async function changeOppTaskStatus(t: Task, status: TaskStatus) {
  await api.patch(`/tasks/${t.id}`, { status });
  await loadOppTasks(editing.value!.id);
}
async function removeOppTask(t: Task) {
  await api.del(`/tasks/${t.id}`);
  await loadOppTasks(editing.value!.id);
}
const taskInitials = (n: string) => n.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
const fmtTaskDue = (iso: string) => new Date(iso).toLocaleString('es-VE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

const blankForm = () => ({
  title: '', value: 0, status: 'open', pipeline_id: currentId.value, stage_id: current.value?.stages[0]?.id ?? '',
  source: '', business_name: '', tags: [] as string[], owner_id: '', follower_ids: [] as string[],
  contact_name: '', contact_email: '', contact_phone: '',
});
const form = ref(blankForm());

// Seguidores del formulario
const followerUsers = computed(() => users.value.filter(u => form.value.follower_ids.includes(u.id)));
const availableFollowers = computed(() => users.value.filter(u => !form.value.follower_ids.includes(u.id)));
function addFollower(id: string) { if (!form.value.follower_ids.includes(id)) form.value.follower_ids.push(id); }
function removeFollower(id: string) { form.value.follower_ids = form.value.follower_ids.filter(x => x !== id); }
const userInitials = (name: string) => name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

function openCreate() {
  editing.value = null;
  modalTab.value = 'detalles';
  form.value = blankForm();
  showForm.value = true;
}
function openConversation(contactId: string) {
  router.push({ path: '/conversations', query: { contact_id: contactId } });
}

async function openEdit(o: Opportunity, tab: 'detalles' | 'notas' = 'detalles') {
  editing.value = o;
  modalTab.value = tab;
  form.value = {
    title: o.title, value: Number(o.value), status: o.status, pipeline_id: o.pipeline_id, stage_id: o.stage_id,
    source: o.source ?? '', business_name: o.business_name ?? '', tags: [...(o.tags ?? [])], owner_id: o.owner_id ?? '',
    follower_ids: (o.followers ?? []).map(f => f.id),
    contact_name: [o.contact_first_name, o.contact_last_name].filter(Boolean).join(' '),
    contact_email: o.contact_email ?? '', contact_phone: o.contact_phone ?? '',
  };
  showForm.value = true;
  notes.value = await api.get<Note[]>(`/opportunities/${o.id}/notes`);
  await loadOppTasks(o.id);
}
const formPipeline = computed(() => pipelines.value.find(p => p.id === form.value.pipeline_id) ?? null);
function onFormPipelineChange() { form.value.stage_id = formPipeline.value?.stages[0]?.id ?? ''; }

// Avatar e indicador de contacto (nuevo vs. existente vinculado).
const contactInitials = computed(() => {
  const n = form.value.contact_name.trim();
  if (!n) return '?';
  return n.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
});
const isExistingContact = computed(() => !!editing.value?.contact_first_name);
const hasContactData = computed(() => !!(form.value.contact_name || form.value.contact_email || form.value.contact_phone));

function addTag() {
  const t = tagInput.value.trim();
  if (t && !form.value.tags.includes(t)) form.value.tags.push(t);
  tagInput.value = '';
}
function removeTag(i: number) { form.value.tags.splice(i, 1); }

async function saveForm() {
  saving.value = true;
  try {
    const payload = {
      pipeline_id: form.value.pipeline_id, stage_id: form.value.stage_id, title: form.value.title,
      value: Number(form.value.value), status: form.value.status,
      source: form.value.source || null, business_name: form.value.business_name || null,
      tags: form.value.tags, owner_id: form.value.owner_id || null, follower_ids: form.value.follower_ids,
      contact_name: form.value.contact_name || null, contact_email: form.value.contact_email || null, contact_phone: form.value.contact_phone || null,
    };
    if (editing.value) await api.patch(`/opportunities/${editing.value.id}`, payload);
    else await api.post('/opportunities', payload);
    showForm.value = false;
    await loadOpps();
  } finally { saving.value = false; }
}
async function deleteOpp() {
  if (!editing.value || !confirm('¿Eliminar esta oportunidad?')) return;
  await api.del(`/opportunities/${editing.value.id}`);
  showForm.value = false;
  await loadOpps();
}
async function addNote() {
  if (!editing.value || !newNote.value.trim()) return;
  await api.post(`/opportunities/${editing.value.id}/notes`, { body: newNote.value.trim() });
  newNote.value = '';
  notes.value = await api.get<Note[]>(`/opportunities/${editing.value.id}/notes`);
}
async function deleteNote(id: string) {
  await api.del(`/opportunities/notes/${id}`);
  notes.value = notes.value.filter(n => n.id !== id);
}
</script>

<template>
  <div class="flex h-full flex-col">
    <OppTabs />

    <!-- Toolbar superior: tabs de vista + controles -->
    <div class="z-[4] border-b border-slate-200 bg-white shadow-toolbar">

      <!-- Fila 1 MÓVIL: view tabs a todo ancho | Fila 1 DESKTOP: tabs + pipeline + acciones -->
      <div class="flex items-center gap-0 px-3 pt-1 sm:px-4">
        <!-- View tabs (Tablero / Lista) -->
        <button class="view-tab" :class="viewMode === 'board' ? 'view-tab--active' : ''" @click="viewMode = 'board'">
          <Kanban class="h-3.5 w-3.5" /> Tablero
        </button>
        <button class="view-tab" :class="viewMode === 'list' ? 'view-tab--active' : ''" @click="viewMode = 'list'">
          <SlidersHorizontal class="h-3.5 w-3.5" /> Lista
        </button>

        <!-- Divider + pipeline + acciones (solo en ≥ sm, en móvil van en fila 2) -->
        <div class="hidden items-center gap-0 sm:flex sm:flex-1">
          <div class="mx-3 h-5 w-px flex-shrink-0 bg-slate-200"></div>

          <!-- Pipeline selector -->
          <Dropdown width="240px">
            <template #trigger="{ open }">
              <button class="flex min-w-0 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-all hover:border-slate-300 hover:shadow-sm" :class="open && 'border-primary ring-2 ring-primary/20'">
                <span class="h-2 w-2 flex-shrink-0 rounded-full bg-primary"></span>
                <span class="max-w-[200px] truncate">{{ current?.name ?? 'Pipeline' }}</span>
                <ChevronDown class="h-3.5 w-3.5 flex-shrink-0 text-slate-400 transition-transform" :class="open && 'rotate-180'" />
              </button>
            </template>
            <template #default="{ close }">
              <button v-for="p in pipelines" :key="p.id"
                class="flex w-full cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-slate-100"
                :class="p.id === currentId ? 'text-primary' : 'text-slate-700'"
                @click="currentId = p.id; close()">
                {{ p.name }}
                <Check v-if="p.id === currentId" class="h-4 w-4" />
              </button>
            </template>
          </Dropdown>

          <span class="ml-2 flex-shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500">{{ totalLeads }}</span>

          <!-- Right actions (desktop) -->
          <div class="ml-auto flex flex-shrink-0 items-center gap-1.5 py-2">
            <div class="relative hidden md:block">
              <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input v-model="search" @input="onSearch" placeholder="Buscar oportunidades…" class="w-40 rounded-lg border border-slate-200 py-1.5 pl-9 pr-3 text-sm transition-all focus:border-primary focus:shadow-sm focus:ring-2 focus:ring-primary/20 focus:outline-none lg:w-52" />
            </div>
            <button class="btn btn-sm" :class="showFilters || activeQfCount ? 'btn-secondary btn-secondary--active' : 'btn-secondary'" @click="showFilters = true">
              <Filter class="h-4 w-4" /> Filtros
              <span v-if="activeQfCount" class="rounded-full bg-primary px-1.5 text-xs font-bold text-white">{{ activeQfCount }}</span>
            </button>
            <Dropdown align="right" width="260px">
              <template #trigger="{ open }">
                <button class="btn btn-sm" :class="hasSort || open ? 'btn-secondary btn-secondary--active' : 'btn-secondary'">
                  <ArrowUpDown class="h-4 w-4" /> Ordenar
                  <span v-if="hasSort" class="rounded-full bg-primary px-1.5 text-xs font-bold text-white">1</span>
                </button>
              </template>
              <div class="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <p class="text-[13px] font-semibold text-slate-800">Ordenar por</p>
                <button v-if="hasSort" class="cursor-pointer text-[11px] font-medium text-primary hover:underline" @click="clearSort">Limpiar</button>
              </div>
              <div class="py-1.5">
                <button v-for="opt in SORT_OPTIONS" :key="opt.key"
                  class="flex w-full cursor-pointer items-center justify-between px-4 py-2 text-[13px] transition-colors"
                  :class="sortBy === opt.key ? 'bg-primary/5 font-semibold text-primary' : 'text-slate-700 hover:bg-slate-50'"
                  @click="selectSort(opt.key)">
                  <span>{{ opt.label }}</span>
                  <span v-if="sortBy === opt.key" class="flex items-center gap-1 text-[11px] font-medium">
                    <component :is="sortDir === 'asc' ? ArrowUp : ArrowDown" class="h-3.5 w-3.5" />
                    {{ sortDir === 'asc' ? 'A → Z' : 'Z → A' }}
                  </span>
                </button>
              </div>
            </Dropdown>
            <Dropdown align="right" width="180px">
              <template #trigger="{ open }">
                <button class="cursor-pointer rounded-lg border border-slate-200 p-2 text-slate-400 transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700" :class="open && 'border-primary text-primary'" aria-label="Más acciones">
                  <MoreVertical class="h-4 w-4" />
                </button>
              </template>
              <button class="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100" @click="exportCsv">
                <Download class="h-4 w-4 text-slate-400" /> Exportar CSV
              </button>
              <button class="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100" @click="fileInput?.click()">
                <Upload class="h-4 w-4 text-slate-400" /> Importar CSV
              </button>
              <div class="my-1 border-t border-slate-100"></div>
              <button class="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100" @click="showCustomize = true">
                <SlidersHorizontal class="h-4 w-4 text-slate-400" /> Personalizar tarjetas
              </button>
            </Dropdown>
            <input ref="fileInput" type="file" accept=".csv" class="hidden" @change="onImportFile" />
            <button class="btn btn-primary btn-sm" @click="openCreate">
              <Plus class="h-4 w-4" /> Crear
            </button>
          </div>
        </div>

        <!-- Acciones móviles (solo < sm, junto a los tabs) -->
        <div class="ml-auto flex flex-shrink-0 items-center gap-1 py-1.5 sm:hidden">
          <button class="btn btn-sm" :class="showFilters || activeQfCount ? 'btn-secondary btn-secondary--active' : 'btn-secondary'" @click="showFilters = true">
            <Filter class="h-4 w-4" />
            <span v-if="activeQfCount" class="rounded-full bg-primary px-1.5 text-xs font-bold text-white">{{ activeQfCount }}</span>
          </button>
          <Dropdown align="right" width="200px">
            <template #trigger="{ open }">
              <button class="cursor-pointer rounded-lg border border-slate-200 p-1.5 text-slate-400 transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700" :class="open && 'border-primary text-primary'" aria-label="Más">
                <MoreVertical class="h-4 w-4" />
              </button>
            </template>
            <p class="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Ordenar por</p>
            <button v-for="opt in SORT_OPTIONS" :key="opt.key"
              class="flex w-full cursor-pointer items-center justify-between px-3 py-2 text-[13px] transition-colors"
              :class="sortBy === opt.key ? 'font-semibold text-primary' : 'text-slate-700 hover:bg-slate-50'"
              @click="selectSort(opt.key)">
              <span>{{ opt.label }}</span>
              <component v-if="sortBy === opt.key" :is="sortDir === 'asc' ? ArrowUp : ArrowDown" class="h-3.5 w-3.5" />
            </button>
            <div class="my-1 border-t border-slate-100"></div>
            <button class="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100" @click="exportCsv">
              <Download class="h-4 w-4 text-slate-400" /> Exportar CSV
            </button>
            <button class="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100" @click="showCustomize = true">
              <SlidersHorizontal class="h-4 w-4 text-slate-400" /> Personalizar tarjetas
            </button>
          </Dropdown>
          <input ref="fileInput" type="file" accept=".csv" class="hidden" @change="onImportFile" />
          <button class="btn btn-primary btn-sm" @click="openCreate">
            <Plus class="h-4 w-4" />
          </button>
        </div>
      </div>

      <!-- Fila 2 MÓVIL: pipeline selector + count (solo < sm) -->
      <div class="flex items-center gap-2 border-t border-slate-100 px-3 py-2 sm:hidden">
        <Dropdown width="240px">
          <template #trigger="{ open }">
            <button class="flex min-w-0 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 transition-all hover:border-slate-300" :class="open && 'border-primary ring-2 ring-primary/20'">
              <span class="h-2 w-2 flex-shrink-0 rounded-full bg-primary"></span>
              <span class="max-w-[180px] truncate">{{ current?.name ?? 'Pipeline' }}</span>
              <ChevronDown class="h-3.5 w-3.5 flex-shrink-0 text-slate-400 transition-transform" :class="open && 'rotate-180'" />
            </button>
          </template>
          <template #default="{ close }">
            <button v-for="p in pipelines" :key="p.id"
              class="flex w-full cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-slate-100"
              :class="p.id === currentId ? 'text-primary' : 'text-slate-700'"
              @click="currentId = p.id; close()">
              {{ p.name }}
              <Check v-if="p.id === currentId" class="h-4 w-4" />
            </button>
          </template>
        </Dropdown>
        <span class="flex-shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500">{{ totalLeads }} oportunidades</span>
      </div>

      <!-- Fila 2: filter chips activos -->
      <div v-if="activeFilterCount > 0" class="flex flex-wrap items-center gap-2 px-4 pb-2">
        <span class="text-xs font-medium text-slate-400">Filtros activos:</span>
        <div v-for="(c, i) in conditions.filter(c => c.field && c.op && (NO_VALUE.includes(c.op) || (c.value !== '' && c.value != null)))" :key="i"
          class="toolbar-chip toolbar-chip--active"
          @click="removeCondition(conditions.indexOf(c))"
        >
          <span>{{ FIELDS.find(f => f.key === c.field)?.label ?? c.field }}: {{ c.value }}</span>
          <span class="toolbar-chip__remove"><X class="h-3 w-3" /></span>
        </div>
        <button class="text-xs font-medium text-slate-400 hover:text-red-600 transition-colors" @click="clearFilters">Limpiar todo</button>
      </div>
    </div>

    <!-- Sidebar de filtros (estilo GHL) -->
    <Teleport to="body">
      <Transition name="filter-sidebar">
        <div v-if="showFilters" class="fixed inset-0 z-50 flex justify-end" @click.self="showFilters = false">
          <!-- Backdrop -->
          <div class="absolute inset-0 bg-black/20 backdrop-blur-[1px]" @click="showFilters = false"></div>

          <!-- Panel -->
          <div class="relative flex h-full w-[340px] flex-col bg-white shadow-2xl">
            <!-- Header -->
            <div class="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div class="flex items-center gap-2.5">
                <Filter class="h-4 w-4 text-primary" />
                <span class="text-[15px] font-semibold text-slate-900">Filtros</span>
                <span v-if="activeQfCount" class="rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-white">{{ activeQfCount }}</span>
              </div>
              <button class="cursor-pointer rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700" @click="showFilters = false">
                <X style="height:18px;width:18px" />
              </button>
            </div>

            <!-- Body -->
            <div class="flex-1 overflow-y-auto px-5 py-4 space-y-6">

              <!-- Estado -->
              <div>
                <p class="mb-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Estado</p>
                <div class="flex flex-wrap gap-2">
                  <button
                    v-for="s in STATUS_OPTS" :key="s.v"
                    class="qf-chip"
                    :class="qf.statuses.includes(s.v) ? 'qf-chip--on' : ''"
                    @click="toggleQfStatus(s.v)"
                  >{{ s.l }}</button>
                </div>
              </div>

              <!-- Etapa -->
              <div>
                <p class="mb-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Etapa</p>
                <div class="space-y-1.5">
                  <label
                    v-for="stage in current?.stages ?? []" :key="stage.id"
                    class="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-50"
                  >
                    <span
                      class="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition-colors"
                      :style="qf.stageIds.includes(stage.id)
                        ? { background: stage.color, borderColor: stage.color }
                        : { borderColor: '#CBD5E1', background: 'white' }"
                      @click.prevent="toggleQfStage(stage.id)"
                    >
                      <Check v-if="qf.stageIds.includes(stage.id)" class="h-2.5 w-2.5 text-white" />
                    </span>
                    <span class="h-2 w-2 rounded-full flex-shrink-0" :style="{ background: stage.color }"></span>
                    <span class="text-[13px] text-slate-700">{{ stage.name }}</span>
                    <input type="checkbox" class="sr-only" :checked="qf.stageIds.includes(stage.id)" @change="toggleQfStage(stage.id)" />
                  </label>
                </div>
              </div>

              <!-- Responsable -->
              <div>
                <p class="mb-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Responsable</p>
                <select v-model="qf.owner_id" class="qf-input w-full">
                  <option value="">Cualquiera</option>
                  <option v-for="u in users" :key="u.id" :value="u.id">{{ u.name }}</option>
                </select>
              </div>

              <!-- Valor -->
              <div>
                <p class="mb-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Valor (USD)</p>
                <div class="flex items-center gap-2">
                  <input v-model="qf.value_min" type="number" placeholder="Mínimo" class="qf-input flex-1 min-w-0" />
                  <span class="text-slate-300 text-sm">—</span>
                  <input v-model="qf.value_max" type="number" placeholder="Máximo" class="qf-input flex-1 min-w-0" />
                </div>
              </div>

              <!-- Origen -->
              <div>
                <p class="mb-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Origen</p>
                <select v-model="qf.source" class="qf-input w-full cursor-pointer">
                  <option value="">Todas las fuentes</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="facebook">Facebook</option>
                  <option value="instagram">Instagram</option>
                  <option value="tiktok">TikTok</option>
                  <option value="google">Google</option>
                  <option value="linkedin">LinkedIn</option>
                  <option value="referido">Referido</option>
                  <option value="sitio_web">Sitio web</option>
                  <option value="email">Email</option>
                  <option value="llamada">Llamada telefónica</option>
                </select>
              </div>

              <!-- Empresa -->
              <div>
                <p class="mb-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Empresa</p>
                <input v-model="qf.business_name" type="text" placeholder="Nombre de la empresa" class="qf-input w-full" />
              </div>

              <!-- Contacto -->
              <div>
                <p class="mb-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Contacto</p>
                <input v-model="qf.contact" type="text" placeholder="Nombre del contacto" class="qf-input w-full" />
              </div>

              <!-- Etiquetas -->
              <div>
                <p class="mb-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Etiquetas</p>
                <input v-model="qf.tags" type="text" placeholder="Ej. vip, caliente" class="qf-input w-full" />
              </div>

              <!-- Fecha de creación -->
              <div>
                <p class="mb-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Fecha de creación</p>
                <div class="space-y-2">
                  <div class="flex items-center gap-2">
                    <span class="w-12 text-right text-[11px] text-slate-400">Desde</span>
                    <input v-model="qf.created_from" type="date" class="qf-input flex-1 min-w-0" />
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="w-12 text-right text-[11px] text-slate-400">Hasta</span>
                    <input v-model="qf.created_to" type="date" class="qf-input flex-1 min-w-0" />
                  </div>
                </div>
              </div>

            </div>

            <!-- Footer -->
            <div class="flex items-center gap-2 border-t border-slate-100 px-5 py-3.5">
              <button class="btn btn-ghost" @click="clearQf">Limpiar</button>
              <button class="btn btn-primary ml-auto" @click="applyQf">Aplicar filtros</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Tablero kanban -->
    <LoadingState v-if="loading" label="Cargando oportunidades…" />
    <div v-else-if="viewMode === 'board'" class="flex flex-1 gap-3 overflow-x-auto bg-slate-100/60 p-3 sm:gap-4 sm:p-6">
      <div
        v-for="stage in current?.stages ?? []"
        :key="stage.id"
        class="flex w-[calc(100vw-3.5rem)] flex-shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card sm:w-80"
        @dragover.prevent
        @drop="onDrop(stage.id)"
      >
        <!-- Kanban column header — estilo GHL/Flowlu -->
        <div
          class="flex-shrink-0 rounded-t-xl px-4 pb-3 pt-3.5"
          :style="{
            borderTop: `3px solid ${stage.color}`,
            background: `color-mix(in srgb, ${stage.color} 12%, #ffffff)`,
          }"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-[13px] font-semibold text-slate-800 leading-tight">{{ stage.name }}</span>
              <span
                class="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold text-slate-800"
                :style="{ backgroundColor: stage.color }"
              >{{ stageOpps(stage.id).length }}</span>
            </div>
            <span class="text-xs font-semibold text-slate-600">{{ stageSum(stage.id) }}</span>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto bg-slate-50/40 p-2.5">
          <TransitionGroup name="list" tag="div" class="space-y-2.5">
            <OpportunityCard
              v-for="opp in stageOpps(stage.id)"
              :key="opp.id"
              :opp="opp"
              :config="cardConfig"
              draggable="true"
              class="cursor-grab active:cursor-grabbing"
              @dragstart="onDragStart(opp.id)"
              @click="openEdit(opp)"
              @action="(tab: 'detalles' | 'notas') => openEdit(opp, tab)"
              @open-conversation="openConversation"
            />
          </TransitionGroup>
          <p v-if="stageOpps(stage.id).length === 0" class="py-8 text-center text-xs text-slate-400">Sin oportunidades</p>

          <!-- Quick Add button (estilo Flowlu) -->
          <button
            class="kanban-quick-add"
            @click="openCreate"
          >
            <Plus class="h-3.5 w-3.5" />
            Añadir oportunidad
          </button>
        </div>
      </div>
    </div>

    <!-- Vista de lista -->
    <div v-else class="flex-1 overflow-auto bg-slate-100/40 p-6">
      <div class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
        <table class="data-table w-full text-sm">
          <thead>
            <tr class="border-b border-slate-200 bg-slate-50 text-left">
              <th class="sortable px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Oportunidad</th>
              <th class="sortable px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Etapa</th>
              <th class="sortable px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Valor</th>
              <th class="sortable px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Estado</th>
              <th class="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Contacto</th>
              <th class="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Responsable</th>
              <th class="sortable px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Creado</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr
              v-for="opp in opps"
              :key="opp.id"
              class="group cursor-pointer transition-colors hover:bg-[#F69008]/5"
              @click="openEdit(opp)"
            >
              <td class="px-4 py-3">
                <span class="font-semibold text-slate-900 group-hover:text-primary transition-colors">{{ opp.title }}</span>
                <p v-if="opp.business_name" class="text-xs text-slate-400 mt-0.5">{{ opp.business_name }}</p>
              </td>
              <td class="px-3 py-3">
                <span class="rounded-full px-2.5 py-0.5 text-xs font-medium text-slate-700" :style="{ backgroundColor: (stageById[opp.stage_id]?.color ?? '#e2e8f0') + '33', color: stageById[opp.stage_id]?.color ?? '#475569' }">
                  {{ stageById[opp.stage_id]?.name ?? '—' }}
                </span>
              </td>
              <td class="px-3 py-3 font-semibold text-emerald-600">{{ money(Number(opp.value)) }}</td>
              <td class="px-3 py-3">
                <span class="rounded-full px-2.5 py-0.5 text-[11px] font-semibold" :class="statusBadgeCls[opp.status]">{{ statusLbl[opp.status] }}</span>
              </td>
              <td class="px-3 py-3 text-slate-600">{{ [opp.contact_first_name, opp.contact_last_name].filter(Boolean).join(' ') || '—' }}</td>
              <td class="px-3 py-3 text-slate-600">{{ opp.owner_name || '—' }}</td>
              <td class="px-3 py-3 text-xs text-slate-400">{{ new Date(opp.created_at).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' }) }}</td>
            </tr>
            <tr v-if="opps.length === 0">
              <td colspan="7" class="px-4 py-12 text-center text-slate-400">Sin oportunidades para mostrar</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal formulario completo -->
    <Transition name="modal">
    <div v-if="showForm" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" @click.self="showForm = false">
      <div class="modal-panel flex max-h-[92vh] w-full max-w-2xl flex-col rounded-md bg-white shadow-modal">
        <div class="flex items-start justify-between border-b border-slate-200 bg-gradient-to-b from-slate-50 to-white px-6 py-4">
          <div class="flex items-center gap-3">
            <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-[#F69008] to-[#D97706] text-white shadow-sm shadow-[#F69008]/30">
              <Kanban class="h-5 w-5" />
            </div>
            <div>
              <h2 class="text-base font-semibold text-slate-900">{{ editing ? form.title || 'Editar oportunidad' : 'Nueva oportunidad' }}</h2>
              <p class="text-xs text-slate-500">{{ editing ? 'Actualiza los datos de la oportunidad y su contacto' : 'Crea la oportunidad junto con su contacto' }}</p>
            </div>
          </div>
          <button class="cursor-pointer rounded-md p-1 text-slate-400 hover:bg-slate-100" @click="showForm = false"><X class="h-5 w-5" /></button>
        </div>

        <!-- Tabs del modal -->
        <div class="flex gap-1 border-b border-slate-200 px-6">
          <button class="flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors" :class="modalTab === 'detalles' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800'" @click="modalTab = 'detalles'"><Briefcase class="h-4 w-4" /> Detalles</button>
          <button v-if="editing" class="flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors" :class="modalTab === 'notas' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800'" @click="modalTab = 'notas'"><StickyNote class="h-4 w-4" /> Notas <span class="ml-0.5 rounded-full bg-slate-100 px-1.5 text-xs text-slate-500">{{ notes.length }}</span></button>
          <button v-if="editing && auth.can('tasks')" class="flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors" :class="modalTab === 'tareas' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800'" @click="modalTab = 'tareas'"><ListTodo class="h-4 w-4" /> Tareas <span class="ml-0.5 rounded-full bg-slate-100 px-1.5 text-xs text-slate-500">{{ oppTasks.length }}</span></button>
        </div>

        <div class="flex-1 overflow-auto px-6 py-5">
          <!-- DETALLES -->
          <form v-show="modalTab === 'detalles'" class="space-y-6" @submit.prevent="saveForm">
            <!-- Datos del contacto -->
            <section class="rounded-lg border border-slate-200 bg-slate-50/60 p-4 shadow-sm">
              <div class="mb-3 flex items-center justify-between">
                <h3 class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <UserRound class="h-4 w-4" /> Datos del contacto
                </h3>
                <span v-if="isExistingContact" class="flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-600"><Link2 class="h-3 w-3" /> Contacto vinculado</span>
                <span v-else-if="hasContactData" class="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-600"><UserPlus class="h-3 w-3" /> Se creará un contacto</span>
              </div>
              <div class="flex gap-4">
                <div class="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#F69008] to-[#D97706] text-lg font-semibold text-white shadow-sm">{{ contactInitials }}</div>
                <div class="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label class="mb-1 block text-xs font-medium text-slate-600">Nombre</label>
                    <input v-model="form.contact_name" placeholder="Nombre del contacto" class="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none" />
                  </div>
                  <div>
                    <label class="mb-1 block text-xs font-medium text-slate-600">Email</label>
                    <input v-model="form.contact_email" type="email" placeholder="correo@ejemplo.com" class="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none" />
                  </div>
                  <div>
                    <label class="mb-1 block text-xs font-medium text-slate-600">Teléfono</label>
                    <input v-model="form.contact_phone" placeholder="+58 …" class="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none" />
                  </div>
                </div>
              </div>
            </section>

            <!-- Datos de la oportunidad -->
            <section>
              <h3 class="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <Briefcase class="h-4 w-4" /> Datos de la oportunidad
              </h3>
              <div class="space-y-3">
                <div>
                  <label class="mb-1 block text-sm font-medium text-slate-700">Nombre de la oportunidad *</label>
                  <input v-model="form.title" required class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none" />
                </div>
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="mb-1 block text-sm font-medium text-slate-700">Pipeline</label>
                    <select v-model="form.pipeline_id" @change="onFormPipelineChange" class="w-full cursor-pointer rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none">
                      <option v-for="p in pipelines" :key="p.id" :value="p.id">{{ p.name }}</option>
                    </select>
                  </div>
                  <div>
                    <label class="mb-1 block text-sm font-medium text-slate-700">Etapa</label>
                    <select v-model="form.stage_id" class="w-full cursor-pointer rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none">
                      <option v-for="s in formPipeline?.stages ?? []" :key="s.id" :value="s.id">{{ s.name }}</option>
                    </select>
                  </div>
                </div>
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="mb-1 block text-sm font-medium text-slate-700">Estado</label>
                    <select v-model="form.status" class="w-full cursor-pointer rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none">
                      <option v-for="s in STATUS_OPTS" :key="s.v" :value="s.v">{{ s.l }}</option>
                    </select>
                  </div>
                  <div>
                    <label class="mb-1 block text-sm font-medium text-slate-700">Valor (USD)</label>
                    <input v-model.number="form.value" type="number" min="0" step="0.01" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none" />
                  </div>
                </div>
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="mb-1 block text-sm font-medium text-slate-700">Responsable</label>
                    <select v-model="form.owner_id" class="w-full cursor-pointer rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none">
                      <option value="">Sin asignar</option>
                      <option v-for="u in users" :key="u.id" :value="u.id">{{ u.name }}</option>
                    </select>
                  </div>
                  <div>
                    <label class="mb-1 block text-sm font-medium text-slate-700">Empresa</label>
                    <input v-model="form.business_name" placeholder="Nombre de la empresa" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none" />
                  </div>
                </div>
                <div>
                  <label class="mb-1 block text-sm font-medium text-slate-700">Fuente</label>
                  <select
                    class="w-full cursor-pointer rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
                    :value="KNOWN_SOURCES.includes(form.source) || form.source === '' ? form.source : 'otro'"
                    @change="onSourceChange"
                  >
                    <option value="">Sin especificar</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="facebook">Facebook</option>
                    <option value="instagram">Instagram</option>
                    <option value="tiktok">TikTok</option>
                    <option value="google">Google</option>
                    <option value="linkedin">LinkedIn</option>
                    <option value="referido">Referido</option>
                    <option value="sitio_web">Sitio web</option>
                    <option value="email">Email</option>
                    <option value="llamada">Llamada telefónica</option>
                    <option value="otro">Otro (personalizado)</option>
                  </select>
                  <input
                    v-if="!KNOWN_SOURCES.includes(form.source) && form.source !== ''"
                    id="source-custom"
                    v-model="form.source"
                    placeholder="Escribe la fuente…"
                    class="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
                  />
                </div>
                <div>
                  <label class="mb-1 block text-sm font-medium text-slate-700">Seguidores</label>
                  <div class="flex flex-wrap items-center gap-2 rounded-md border border-slate-300 bg-white p-2 shadow-sm">
                    <span v-for="f in followerUsers" :key="f.id" class="flex items-center gap-1.5 rounded-full bg-slate-100 py-0.5 pl-0.5 pr-2 text-xs font-medium text-slate-700">
                      <span class="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-[#F69008] to-[#D97706] text-[9px] font-semibold text-white">{{ userInitials(f.name) }}</span>
                      {{ f.name }}
                      <button type="button" class="cursor-pointer text-slate-400 hover:text-red-500" @click="removeFollower(f.id)"><X class="h-3 w-3" /></button>
                    </span>
                    <Dropdown v-if="availableFollowers.length" width="220px">
                      <template #trigger>
                        <button type="button" class="flex cursor-pointer items-center gap-1 rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-500 transition-colors hover:border-primary hover:text-primary"><UserPlus class="h-3.5 w-3.5" /> Añadir</button>
                      </template>
                      <button v-for="u in availableFollowers" :key="u.id" type="button" class="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-100" @click="addFollower(u.id)">
                        <span class="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-[#F69008] to-[#D97706] text-[10px] font-semibold text-white">{{ userInitials(u.name) }}</span>
                        {{ u.name }}
                      </button>
                    </Dropdown>
                    <span v-if="!followerUsers.length && !availableFollowers.length" class="px-1 text-xs text-slate-400">No hay usuarios</span>
                  </div>
                </div>
                <div>
                  <label class="mb-1 block text-sm font-medium text-slate-700">Etiquetas</label>
                  <div class="flex flex-wrap items-center gap-1.5 rounded-md border border-slate-300 bg-white p-2 shadow-sm focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
                    <span v-for="(t, i) in form.tags" :key="i" class="flex items-center gap-1 rounded-sm bg-[#F69008]/10 px-2 py-0.5 text-xs font-medium text-[#D97706]">
                      {{ t }}
                      <button type="button" class="cursor-pointer hover:text-[#7C4A00]" @click="removeTag(i)"><X class="h-3 w-3" /></button>
                    </span>
                    <input v-model="tagInput" @keydown.enter.prevent="addTag" @keydown.,.prevent="addTag" placeholder="Añadir etiqueta y Enter…" class="min-w-[120px] flex-1 border-0 bg-transparent text-sm focus:outline-none" />
                  </div>
                </div>
              </div>
            </section>
          </form>

          <!-- NOTAS -->
          <div v-show="modalTab === 'notas'" class="space-y-4">
            <div>
              <textarea v-model="newNote" rows="3" placeholder="Escribe una nota…" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"></textarea>
              <button class="btn btn-primary btn-sm mt-2" :disabled="!newNote.trim()" @click="addNote">Agregar nota</button>
            </div>
            <div class="space-y-2">
              <div v-for="n in notes" :key="n.id" class="group rounded-md border border-slate-200 bg-slate-50 p-3 shadow-sm transition-shadow hover:shadow-md">
                <p class="whitespace-pre-wrap text-sm text-slate-800">{{ n.body }}</p>
                <div class="mt-2 flex items-center justify-between text-xs text-slate-400">
                  <span>{{ n.author_name }} · {{ dateTime(n.created_at) }}</span>
                  <button class="cursor-pointer opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-600" @click="deleteNote(n.id)"><Trash2 class="h-4 w-4" /></button>
                </div>
              </div>
              <p v-if="notes.length === 0" class="py-6 text-center text-sm text-slate-400">Sin notas todavía.</p>
            </div>
          </div>

          <!-- TAREAS -->
          <div v-show="modalTab === 'tareas'" class="space-y-4">
            <div class="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
              <input v-model="newTask.title" placeholder="Título de la tarea…" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none" />
              <textarea v-model="newTask.description" rows="2" placeholder="Descripción (opcional)…" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"></textarea>
              <!-- Responsables múltiples -->
              <div class="flex flex-wrap items-center gap-1.5 rounded-md border border-slate-300 bg-white p-1.5">
                <span v-for="u in newTaskAssignees" :key="u.id" class="flex items-center gap-1 rounded-full bg-slate-100 py-0.5 pl-0.5 pr-1.5 text-xs font-medium text-slate-700">
                  <span class="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-gradient-to-br from-[#F69008] to-[#D97706] text-[8px] font-semibold text-white" style="height:18px;width:18px">{{ taskInitials(u.name) }}</span>
                  {{ u.name }}
                  <button type="button" class="cursor-pointer text-slate-400 hover:text-red-500" @click="removeTaskAssignee(u.id)"><X class="h-3 w-3" /></button>
                </span>
                <Dropdown v-if="newTaskAvailable.length" width="200px">
                  <template #trigger>
                    <button type="button" class="flex cursor-pointer items-center gap-1 rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-xs font-medium text-slate-500 hover:border-primary hover:text-primary"><UserPlus class="h-3 w-3" /> Responsable</button>
                  </template>
                  <button v-for="u in newTaskAvailable" :key="u.id" type="button" class="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100" @click="addTaskAssignee(u.id)">
                    <span class="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-[#F69008] to-[#D97706] text-[10px] font-semibold text-white">{{ taskInitials(u.name) }}</span>
                    {{ u.name }}
                  </button>
                </Dropdown>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <input v-model="newTask.due_at" type="datetime-local" class="rounded-md border border-slate-300 px-2 py-1.5 text-sm shadow-sm focus:outline-none" />
                <button class="btn btn-primary btn-sm ml-auto" :disabled="!newTask.title.trim()" @click="addOppTask">Añadir tarea</button>
              </div>
            </div>
            <div class="space-y-2">
              <div v-for="t in oppTasks" :key="t.id" class="rounded-md border border-slate-200 bg-white p-2.5 shadow-sm">
                <div class="flex items-start gap-2">
                  <div class="min-w-0 flex-1">
                    <p class="text-sm font-medium" :class="t.status === 'done' ? 'text-slate-400 line-through' : 'text-slate-800'">{{ t.title }}</p>
                    <p v-if="t.description" class="mt-0.5 text-xs text-slate-500">{{ t.description }}</p>
                    <div class="mt-1 flex flex-wrap items-center gap-3">
                      <span v-if="t.due_at" class="flex items-center gap-1 text-xs" :class="t.status !== 'done' && t.status !== 'cancelled' && new Date(t.due_at) < new Date() ? 'font-medium text-red-600' : 'text-slate-400'"><CalendarClock class="h-3 w-3" /> {{ fmtTaskDue(t.due_at) }}</span>
                      <div v-if="t.assignees.length" class="flex items-center -space-x-1.5">
                        <span v-for="a in t.assignees" :key="a.id" class="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-[#F69008] to-[#D97706] text-[8px] font-semibold text-white ring-2 ring-white" :title="a.name">{{ taskInitials(a.name) }}</span>
                      </div>
                    </div>
                  </div>
                  <StatusSelect :model-value="t.status" @update:model-value="s => changeOppTaskStatus(t, s)" />
                  <button class="cursor-pointer rounded-md p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600" @click="removeOppTask(t)"><Trash2 class="h-4 w-4" /></button>
                </div>
              </div>
              <p v-if="oppTasks.length === 0" class="py-6 text-center text-sm text-slate-400">Sin tareas para esta oportunidad.</p>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="flex items-center justify-between gap-3 border-t border-slate-200 px-6 py-4">
          <p v-if="editing" class="text-xs text-slate-400">Creado el {{ dateTime(editing.created_at) }}</p>
          <div class="ml-auto flex items-center gap-2">
            <button v-if="editing" type="button" class="btn btn-danger" @click="deleteOpp">Eliminar</button>
            <button type="button" class="btn btn-ghost" @click="showForm = false">Cancelar</button>
            <button type="button" :disabled="saving" class="btn btn-primary" @click="saveForm">
              <Spinner v-if="saving" :size="16" light /> {{ saving ? 'Guardando…' : editing ? 'Actualizar' : 'Crear' }}
            </button>
          </div>
        </div>
      </div>
    </div>
    </Transition>

    <!-- Panel de personalización de tarjetas -->
    <Transition name="slideover">
      <CustomizeCardPanel
        v-if="showCustomize"
        :config="cardConfig"
        :sample="opps[0] ?? null"
        @apply="applyCardConfig"
        @close="showCustomize = false"
      />
    </Transition>
  </div>
</template>

<style>
/* ── Filter sidebar transitions ─────────────────────────────────────────── */
.filter-sidebar-enter-active,
.filter-sidebar-leave-active { transition: opacity 0.22s ease; }
.filter-sidebar-enter-active .relative,
.filter-sidebar-leave-active .relative { transition: transform 0.25s cubic-bezier(0.4,0,0.2,1); }
.filter-sidebar-enter-from,
.filter-sidebar-leave-to { opacity: 0; }
.filter-sidebar-enter-from .relative,
.filter-sidebar-leave-to .relative { transform: translateX(100%); }

/* ── Quick-filter chip ───────────────────────────────────────────────────── */
.qf-chip {
  cursor: pointer; border-radius: 999px; border: 1.5px solid #E2E8F0;
  padding: 4px 14px; font-size: 12px; font-weight: 500;
  color: #64748B; background: white;
  transition: border-color 0.15s, background 0.15s, color 0.15s;
}
.qf-chip:hover { border-color: #F69008; color: #F69008; }
.qf-chip--on { border-color: #F69008; background: #FFF7ED; color: #F69008; font-weight: 600; }

/* ── Quick-filter input ─────────────────────────────────────────────────── */
.qf-input {
  border-radius: 8px; border: 1.5px solid #E2E8F0;
  padding: 6px 10px; font-size: 13px; color: #1E293B;
  background: white; transition: border-color 0.15s, box-shadow 0.15s; outline: none;
}
.qf-input:focus { border-color: #F69008; box-shadow: 0 0 0 3px rgba(246,144,8,0.15); }
.qf-input::placeholder { color: #94A3B8; }
</style>
