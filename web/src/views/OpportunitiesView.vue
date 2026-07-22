<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { Plus, Search, Filter, Download, Upload, X, Trash2, MoreVertical, ChevronDown, Check } from 'lucide-vue-next';
import { api, getToken } from '../api';
import type { Pipeline, Opportunity, FilterCondition, FilterOp, Note, User } from '../types';
import OppTabs from '../components/OppTabs.vue';
import Dropdown from '../components/Dropdown.vue';
import Spinner from '../components/Spinner.vue';
import LoadingState from '../components/LoadingState.vue';

const pipelines = ref<Pipeline[]>([]);
const users = ref<User[]>([]);
const currentId = ref<string>('');
const opps = ref<Opportunity[]>([]);
const dragId = ref<string | null>(null);
const loading = ref(true);
const reloading = ref(false);

const search = ref('');
const showFilters = ref(false);
const match = ref<'AND' | 'OR'>('AND');
const conditions = ref<FilterCondition[]>([]);

const current = computed(() => pipelines.value.find(p => p.id === currentId.value) ?? null);
const totalLeads = computed(() => opps.value.length);
const money = (n: number) => n.toLocaleString('es-VE', { style: 'currency', currency: 'USD' });
const dateTime = (d: string) => new Date(d).toLocaleString('es-VE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const shortDate = (d: string) => new Date(d).toLocaleDateString('es-VE', { day: '2-digit', month: 'short' });

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
async function loadOpps() {
  if (!currentId.value) return;
  reloading.value = true;
  const filters = conditions.value
    .filter(c => c.field && c.op && (NO_VALUE.includes(c.op) || (c.value !== '' && c.value != null)))
    .map(c => ({ field: c.field, op: c.op, value: fieldType(c.field) === 'number' ? Number(c.value) : c.value }));
  try {
    opps.value = await api.post<Opportunity[]>('/opportunities/query', {
      pipelineId: currentId.value, search: search.value || undefined, match: match.value, filters,
    });
  } finally {
    reloading.value = false;
  }
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
const statusBadge: Record<string, string> = { open: 'bg-blue-50 text-blue-600', won: 'bg-emerald-50 text-emerald-600', lost: 'bg-red-50 text-red-600' };
const statusLabel: Record<string, string> = { open: 'Abierta', won: 'Ganada', lost: 'Perdida' };

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
const modalTab = ref<'detalles' | 'notas'>('detalles');
const editing = ref<Opportunity | null>(null);
const saving = ref(false);
const tagInput = ref('');
const notes = ref<Note[]>([]);
const newNote = ref('');

const blankForm = () => ({
  title: '', value: 0, status: 'open', pipeline_id: currentId.value, stage_id: current.value?.stages[0]?.id ?? '',
  source: '', business_name: '', tags: [] as string[], owner_id: '',
  contact_name: '', contact_email: '', contact_phone: '',
});
const form = ref(blankForm());

function openCreate() {
  editing.value = null;
  modalTab.value = 'detalles';
  form.value = blankForm();
  showForm.value = true;
}
async function openEdit(o: Opportunity) {
  editing.value = o;
  modalTab.value = 'detalles';
  form.value = {
    title: o.title, value: Number(o.value), status: o.status, pipeline_id: o.pipeline_id, stage_id: o.stage_id,
    source: o.source ?? '', business_name: o.business_name ?? '', tags: [...(o.tags ?? [])], owner_id: o.owner_id ?? '',
    contact_name: [o.contact_first_name, o.contact_last_name].filter(Boolean).join(' '),
    contact_email: o.contact_email ?? '', contact_phone: o.contact_phone ?? '',
  };
  showForm.value = true;
  notes.value = await api.get<Note[]>(`/opportunities/${o.id}/notes`);
}
const formPipeline = computed(() => pipelines.value.find(p => p.id === form.value.pipeline_id) ?? null);
function onFormPipelineChange() { form.value.stage_id = formPipeline.value?.stages[0]?.id ?? ''; }

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
      tags: form.value.tags, owner_id: form.value.owner_id || null,
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

    <!-- Toolbar -->
    <div class="z-[4] flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-6 py-3 shadow-toolbar">
      <!-- Selector de pipeline premium -->
      <Dropdown width="240px">
        <template #trigger="{ open }">
          <button class="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm transition-all hover:border-slate-400 hover:shadow-md" :class="open && 'border-primary ring-2 ring-primary/20'">
            <span class="h-2 w-2 rounded-full bg-primary"></span>
            {{ current?.name ?? 'Pipeline' }}
            <ChevronDown class="h-4 w-4 text-slate-400 transition-transform" :class="open && 'rotate-180'" />
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
      <span class="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600">{{ totalLeads }} oportunidades</span>

      <div class="ml-auto flex flex-wrap items-center gap-2">
        <div class="relative">
          <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input v-model="search" @input="onSearch" placeholder="Buscar oportunidades…" class="w-56 rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm shadow-sm transition-all focus:border-primary focus:shadow-md focus:ring-2 focus:ring-primary/20 focus:outline-none" />
        </div>
        <button class="flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium shadow-sm transition-all hover:shadow-md" :class="showFilters || activeFilterCount ? 'border-primary bg-primary/5 text-primary' : 'border-slate-300 text-slate-600 hover:border-slate-400 hover:bg-slate-50'" @click="showFilters = !showFilters">
          <Filter class="h-4 w-4" /> Filtros <span v-if="activeFilterCount" class="rounded-full bg-primary px-1.5 text-xs text-white">{{ activeFilterCount }}</span>
        </button>

        <!-- Menú de acciones (⋮) -->
        <Dropdown align="right" width="180px">
          <template #trigger="{ open }">
            <button class="cursor-pointer rounded-lg border border-slate-300 p-2 text-slate-500 shadow-sm transition-all hover:border-slate-400 hover:bg-slate-50 hover:text-slate-700 hover:shadow-md" :class="open && 'border-primary text-primary'" aria-label="Más acciones">
              <MoreVertical class="h-4 w-4" />
            </button>
          </template>
          <button class="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100" @click="exportCsv">
            <Download class="h-4 w-4 text-slate-400" /> Exportar CSV
          </button>
          <button class="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100" @click="fileInput?.click()">
            <Upload class="h-4 w-4 text-slate-400" /> Importar CSV
          </button>
        </Dropdown>
        <input ref="fileInput" type="file" accept=".csv" class="hidden" @change="onImportFile" />

        <button class="flex cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-primary/30 transition-all hover:bg-primary-dark hover:shadow-md hover:shadow-primary/40" @click="openCreate"><Plus class="h-4 w-4" /> Nueva</button>
      </div>
    </div>

    <!-- Panel de filtros -->
    <Transition name="expand">
    <div v-if="showFilters" class="border-b border-slate-200 bg-slate-50/80 px-6 py-4">
      <div class="mb-3 flex flex-wrap items-center gap-3">
        <span class="text-sm font-semibold text-slate-700">Filtrar oportunidades</span>
        <div class="flex items-center gap-2 text-sm text-slate-500">
          <span>que cumplan</span>
          <select v-model="match" @change="loadOpps" class="cursor-pointer rounded-md border border-slate-300 bg-white px-2 py-1 text-sm font-medium text-slate-700 shadow-sm focus:border-primary focus:outline-none">
            <option value="AND">TODAS</option>
            <option value="OR">CUALQUIERA</option>
          </select>
          <span>las condiciones</span>
        </div>
        <div class="ml-auto flex items-center gap-3">
          <Spinner v-if="reloading" :size="16" />
          <button v-if="conditions.length" class="cursor-pointer text-sm font-medium text-slate-500 transition-colors hover:text-red-600" @click="clearFilters">Limpiar todo</button>
        </div>
      </div>

      <div class="space-y-2">
        <div v-for="(c, i) in conditions" :key="i" class="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
          <span class="pl-1 text-xs font-medium text-slate-400">{{ i === 0 ? 'Donde' : match === 'AND' ? 'Y' : 'O' }}</span>
          <select v-model="c.field" @change="onFieldChange(c)" class="cursor-pointer rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm transition-colors hover:border-slate-400 focus:border-primary focus:outline-none">
            <option v-for="f in FIELDS" :key="f.key" :value="f.key">{{ f.label }}</option>
          </select>
          <select v-model="c.op" @change="loadOpps" class="cursor-pointer rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm transition-colors hover:border-slate-400 focus:border-primary focus:outline-none">
            <option v-for="op in OPS_BY_TYPE[fieldType(c.field)]" :key="op" :value="op">{{ OP_LABEL[op] }}</option>
          </select>
          <template v-if="!NO_VALUE.includes(c.op)">
            <select v-if="fieldType(c.field) === 'enum'" v-model="c.value" @change="loadOpps" class="cursor-pointer rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm hover:border-slate-400 focus:border-primary focus:outline-none">
              <option v-for="s in STATUS_OPTS" :key="s.v" :value="s.v">{{ s.l }}</option>
            </select>
            <select v-else-if="fieldType(c.field) === 'stage'" v-model="c.value" @change="loadOpps" class="cursor-pointer rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm hover:border-slate-400 focus:border-primary focus:outline-none">
              <option v-for="s in current?.stages ?? []" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>
            <input v-else-if="fieldType(c.field) === 'number'" v-model="c.value" @input="onSearch" type="number" class="w-32 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm hover:border-slate-400 focus:border-primary focus:outline-none" placeholder="Valor" />
            <input v-else-if="fieldType(c.field) === 'date'" v-model="c.value" @change="loadOpps" type="date" class="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm hover:border-slate-400 focus:border-primary focus:outline-none" />
            <input v-else v-model="c.value" @input="onSearch" type="text" class="w-48 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm hover:border-slate-400 focus:border-primary focus:outline-none" placeholder="Valor" />
          </template>
          <button class="ml-auto cursor-pointer rounded-md p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600" @click="removeCondition(i)"><X class="h-4 w-4" /></button>
        </div>
      </div>
      <button class="mt-3 flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 transition-all hover:border-primary hover:bg-primary/5 hover:text-primary" @click="addCondition"><Plus class="h-4 w-4" />Añadir condición</button>
    </div>
    </Transition>

    <!-- Tablero kanban -->
    <LoadingState v-if="loading" label="Cargando oportunidades…" />
    <div v-else class="flex flex-1 gap-4 overflow-x-auto bg-slate-100/60 p-6">
      <div v-for="stage in current?.stages ?? []" :key="stage.id" class="flex w-80 flex-shrink-0 flex-col overflow-hidden rounded-md border border-slate-200 bg-white shadow-card" @dragover.prevent @drop="onDrop(stage.id)">
        <div class="flex items-center justify-between px-4 py-3" :style="{ backgroundColor: stage.color }">
          <div class="flex items-center gap-2">
            <span class="text-sm font-semibold text-slate-800">{{ stage.name }}</span>
            <span class="rounded-sm bg-white/70 px-1.5 py-0.5 text-xs font-semibold text-slate-600">{{ stageOpps(stage.id).length }}</span>
          </div>
          <span class="text-xs font-medium text-slate-600">{{ stageSum(stage.id) }}</span>
        </div>
        <div class="flex-1 overflow-y-auto bg-slate-50/50 p-2.5">
          <TransitionGroup name="list" tag="div" class="space-y-2.5">
          <div v-for="opp in stageOpps(stage.id)" :key="opp.id" draggable="true"
            class="cursor-grab rounded-md border border-slate-200 bg-white p-3 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-elevated active:cursor-grabbing"
            @dragstart="onDragStart(opp.id)" @click="openEdit(opp)">
            <div class="flex items-start justify-between gap-2">
              <p class="text-sm font-semibold text-slate-900">{{ opp.title }}</p>
              <span class="flex-shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-semibold" :class="statusBadge[opp.status]">{{ statusLabel[opp.status] }}</span>
            </div>
            <p class="mt-1.5 text-base font-bold text-emerald-600">{{ money(Number(opp.value)) }}</p>
            <div v-if="opp.tags?.length" class="mt-2 flex flex-wrap gap-1">
              <span v-for="t in opp.tags" :key="t" class="rounded-sm bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600">{{ t }}</span>
            </div>
            <div v-if="opp.contact_first_name || opp.business_name" class="mt-2 border-t border-slate-100 pt-2">
              <p v-if="opp.contact_first_name" class="text-xs font-medium text-slate-700">{{ opp.contact_first_name }} {{ opp.contact_last_name }}</p>
              <p v-if="opp.business_name" class="text-xs text-slate-400">{{ opp.business_name }}</p>
              <p v-if="opp.contact_email" class="truncate text-xs text-slate-400">{{ opp.contact_email }}</p>
            </div>
            <div class="mt-2 flex items-center justify-between text-[11px] text-slate-400">
              <span>{{ shortDate(opp.created_at) }}</span>
              <span v-if="opp.owner_name" class="rounded-full bg-slate-100 px-1.5 py-0.5 font-medium text-slate-500">{{ opp.owner_name }}</span>
            </div>
          </div>
          </TransitionGroup>
          <p v-if="stageOpps(stage.id).length === 0" class="py-8 text-center text-xs text-slate-400">Sin oportunidades</p>
        </div>
      </div>
    </div>

    <!-- Modal formulario completo -->
    <Transition name="modal">
    <div v-if="showForm" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" @click.self="showForm = false">
      <div class="modal-panel flex max-h-[92vh] w-full max-w-2xl flex-col rounded-md bg-white shadow-modal">
        <div class="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 class="text-base font-semibold text-slate-900">{{ editing ? form.title || 'Editar oportunidad' : 'Nueva oportunidad' }}</h2>
          <button class="cursor-pointer rounded-sm p-1 text-slate-400 hover:bg-slate-100" @click="showForm = false"><X class="h-5 w-5" /></button>
        </div>

        <!-- Tabs del modal -->
        <div class="flex gap-1 border-b border-slate-200 px-6">
          <button class="border-b-2 px-3 py-2.5 text-sm font-medium transition-colors" :class="modalTab === 'detalles' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800'" @click="modalTab = 'detalles'">Detalles</button>
          <button v-if="editing" class="border-b-2 px-3 py-2.5 text-sm font-medium transition-colors" :class="modalTab === 'notas' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800'" @click="modalTab = 'notas'">Notas <span class="ml-1 rounded-full bg-slate-100 px-1.5 text-xs text-slate-500">{{ notes.length }}</span></button>
        </div>

        <div class="flex-1 overflow-auto px-6 py-5">
          <!-- DETALLES -->
          <form v-show="modalTab === 'detalles'" class="space-y-6" @submit.prevent="saveForm">
            <!-- Datos del contacto -->
            <section>
              <h3 class="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Datos del contacto</h3>
              <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label class="mb-1 block text-sm font-medium text-slate-700">Nombre</label>
                  <input v-model="form.contact_name" placeholder="Nombre del contacto" class="w-full rounded-sm border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none" />
                </div>
                <div>
                  <label class="mb-1 block text-sm font-medium text-slate-700">Email</label>
                  <input v-model="form.contact_email" type="email" placeholder="correo@ejemplo.com" class="w-full rounded-sm border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none" />
                </div>
                <div>
                  <label class="mb-1 block text-sm font-medium text-slate-700">Teléfono</label>
                  <input v-model="form.contact_phone" placeholder="+58 …" class="w-full rounded-sm border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none" />
                </div>
              </div>
            </section>

            <!-- Datos de la oportunidad -->
            <section>
              <h3 class="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Datos de la oportunidad</h3>
              <div class="space-y-3">
                <div>
                  <label class="mb-1 block text-sm font-medium text-slate-700">Nombre de la oportunidad *</label>
                  <input v-model="form.title" required class="w-full rounded-sm border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none" />
                </div>
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="mb-1 block text-sm font-medium text-slate-700">Pipeline</label>
                    <select v-model="form.pipeline_id" @change="onFormPipelineChange" class="w-full cursor-pointer rounded-sm border border-slate-300 px-3 py-2 text-sm focus:outline-none">
                      <option v-for="p in pipelines" :key="p.id" :value="p.id">{{ p.name }}</option>
                    </select>
                  </div>
                  <div>
                    <label class="mb-1 block text-sm font-medium text-slate-700">Etapa</label>
                    <select v-model="form.stage_id" class="w-full cursor-pointer rounded-sm border border-slate-300 px-3 py-2 text-sm focus:outline-none">
                      <option v-for="s in formPipeline?.stages ?? []" :key="s.id" :value="s.id">{{ s.name }}</option>
                    </select>
                  </div>
                </div>
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="mb-1 block text-sm font-medium text-slate-700">Estado</label>
                    <select v-model="form.status" class="w-full cursor-pointer rounded-sm border border-slate-300 px-3 py-2 text-sm focus:outline-none">
                      <option v-for="s in STATUS_OPTS" :key="s.v" :value="s.v">{{ s.l }}</option>
                    </select>
                  </div>
                  <div>
                    <label class="mb-1 block text-sm font-medium text-slate-700">Valor (USD)</label>
                    <input v-model.number="form.value" type="number" min="0" step="0.01" class="w-full rounded-sm border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none" />
                  </div>
                </div>
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="mb-1 block text-sm font-medium text-slate-700">Responsable</label>
                    <select v-model="form.owner_id" class="w-full cursor-pointer rounded-sm border border-slate-300 px-3 py-2 text-sm focus:outline-none">
                      <option value="">Sin asignar</option>
                      <option v-for="u in users" :key="u.id" :value="u.id">{{ u.name }}</option>
                    </select>
                  </div>
                  <div>
                    <label class="mb-1 block text-sm font-medium text-slate-700">Empresa</label>
                    <input v-model="form.business_name" placeholder="Nombre de la empresa" class="w-full rounded-sm border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none" />
                  </div>
                </div>
                <div>
                  <label class="mb-1 block text-sm font-medium text-slate-700">Fuente</label>
                  <input v-model="form.source" placeholder="Ej: Facebook Ads, Referido…" class="w-full rounded-sm border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none" />
                </div>
                <div>
                  <label class="mb-1 block text-sm font-medium text-slate-700">Etiquetas</label>
                  <div class="flex flex-wrap items-center gap-1.5 rounded-sm border border-slate-300 p-2 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
                    <span v-for="(t, i) in form.tags" :key="i" class="flex items-center gap-1 rounded-sm bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-600">
                      {{ t }}
                      <button type="button" class="cursor-pointer hover:text-indigo-900" @click="removeTag(i)"><X class="h-3 w-3" /></button>
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
              <textarea v-model="newNote" rows="3" placeholder="Escribe una nota…" class="w-full rounded-sm border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"></textarea>
              <button class="mt-2 cursor-pointer rounded-sm bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50" :disabled="!newNote.trim()" @click="addNote">Agregar nota</button>
            </div>
            <div class="space-y-2">
              <div v-for="n in notes" :key="n.id" class="group rounded-sm border border-slate-200 bg-slate-50 p-3">
                <p class="whitespace-pre-wrap text-sm text-slate-800">{{ n.body }}</p>
                <div class="mt-2 flex items-center justify-between text-xs text-slate-400">
                  <span>{{ n.author_name }} · {{ dateTime(n.created_at) }}</span>
                  <button class="cursor-pointer opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-600" @click="deleteNote(n.id)"><Trash2 class="h-4 w-4" /></button>
                </div>
              </div>
              <p v-if="notes.length === 0" class="py-6 text-center text-sm text-slate-400">Sin notas todavía.</p>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="flex items-center justify-between gap-3 border-t border-slate-200 px-6 py-4">
          <p v-if="editing" class="text-xs text-slate-400">Creado el {{ dateTime(editing.created_at) }}</p>
          <div class="ml-auto flex items-center gap-2">
            <button v-if="editing" type="button" class="cursor-pointer rounded-sm px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50" @click="deleteOpp">Eliminar</button>
            <button type="button" class="cursor-pointer rounded-sm px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100" @click="showForm = false">Cancelar</button>
            <button type="button" :disabled="saving" class="flex cursor-pointer items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-primary/30 transition-all hover:bg-primary-dark hover:shadow-md disabled:opacity-60" @click="saveForm">
              <Spinner v-if="saving" :size="16" light /> {{ saving ? 'Guardando…' : editing ? 'Actualizar' : 'Crear' }}
            </button>
          </div>
        </div>
      </div>
    </div>
    </Transition>
  </div>
</template>
