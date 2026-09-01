<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  Plus, Trash2, Search, X, Users, UserCheck, TrendingUp,
  Building2, ChevronDown, Check, Download, Upload,
  Linkedin, Twitter, Instagram, Globe, Phone, Mail,
} from 'lucide-vue-next';
import { api } from '../api';
import type { Contact, ContactStats } from '../types';
import Spinner from '../components/Spinner.vue';
import LoadingState from '../components/LoadingState.vue';
import Dropdown from '../components/Dropdown.vue';

const router = useRouter();

// ── state ─────────────────────────────────────────────────────────────────────
const contacts  = ref<Contact[]>([]);
const stats     = ref<ContactStats | null>(null);
const q         = ref('');
const loading   = ref(true);
const saving    = ref(false);
const showForm  = ref(false);
const total     = ref(0);
const page      = ref(1);
const limit     = ref(50);

// Filters & sort
const filterStatus  = ref('');
const filterSource  = ref('');
const sortBy        = ref('created_at');

// Bulk selection
const selected   = ref<Set<string>>(new Set());
const allChecked = computed(() => contacts.value.length > 0 && contacts.value.every(c => selected.value.has(c.id)));

// Import
const importInput = ref<HTMLInputElement | null>(null);
const importing   = ref(false);

// Tag chip-input (form)
const tagDraft   = ref('');
const tagInputEl = ref<HTMLInputElement | null>(null);

// Form (new contact slide-over)
const emptyForm = () => ({
  first_name: '', last_name: '', email: '', phone: '',
  email_secondary: '', phone_secondary: '',
  company: '', position: '',
  address: '', city: '', country: '',
  birthday: '',
  linkedin: '', twitter: '', instagram: '', website: '',
  source: '', status: 'active' as Contact['status'],
  tags: [] as string[], notes: '',
});
const form = ref(emptyForm());

// Source options
const sourceOptions = ['website','referral','cold','social','event','other'];
const sourceLabel: Record<string, string> = {
  website: 'Web', referral: 'Referido', cold: 'En frío',
  social: 'Redes', event: 'Evento', other: 'Otro',
};

// Filter dropdown label helpers
const statusFilterLabel = computed(() => {
  const m: Record<string,string> = { active:'Activo', inactive:'Inactivo', blocked:'Bloqueado' };
  return filterStatus.value ? m[filterStatus.value] ?? filterStatus.value : 'Todo estado';
});
const sourceFilterLabel = computed(() => filterSource.value ? (sourceLabel[filterSource.value] ?? filterSource.value) : 'Todo origen');
const sortLabel = computed(() => {
  const m: Record<string,string> = { created_at:'Más reciente', name:'Nombre A-Z', company:'Empresa A-Z' };
  return m[sortBy.value] ?? sortBy.value;
});

// ── data ──────────────────────────────────────────────────────────────────────
async function load() {
  const params = new URLSearchParams();
  if (q.value) params.set('q', q.value);
  if (filterStatus.value) params.set('status', filterStatus.value);
  if (filterSource.value) params.set('source', filterSource.value);
  params.set('sort', sortBy.value);
  params.set('limit', String(limit.value));
  params.set('page', String(page.value));

  const res = await api.get<{ data: Contact[]; total: number }>(`/contacts?${params}`);
  contacts.value = res.data;
  total.value    = res.total;
}

async function loadStats() {
  stats.value = await api.get<ContactStats>('/contacts/stats');
}

onMounted(async () => {
  try { await Promise.all([load(), loadStats()]); }
  finally { loading.value = false; }
});

let searchTimer: ReturnType<typeof setTimeout>;
function onSearch() { clearTimeout(searchTimer); searchTimer = setTimeout(() => { page.value = 1; load(); }, 250); }

watch([filterStatus, filterSource, sortBy], () => { page.value = 1; load(); });

// ── tags ──────────────────────────────────────────────────────────────────────
function addTag(raw: string) {
  const tag = raw.trim().replace(/,+$/, '');
  if (tag && !form.value.tags.includes(tag)) form.value.tags.push(tag);
  tagDraft.value = '';
}

function onTagKey(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    addTag(tagDraft.value);
  } else if (e.key === 'Backspace' && !tagDraft.value) {
    form.value.tags.pop();
  }
}

function removeTag(t: string) { form.value.tags = form.value.tags.filter(x => x !== t); }

// ── create ────────────────────────────────────────────────────────────────────
async function create() {
  if (tagDraft.value.trim()) addTag(tagDraft.value);
  saving.value = true;
  try {
    await api.post('/contacts', { ...form.value, birthday: form.value.birthday || null });
    form.value   = emptyForm();
    tagDraft.value = '';
    showForm.value = false;
    await Promise.all([load(), loadStats()]);
  } finally {
    saving.value = false;
  }
}

// ── delete ────────────────────────────────────────────────────────────────────
async function remove(id: string, e: Event) {
  e.stopPropagation();
  if (!confirm('¿Eliminar este contacto?')) return;
  await api.del(`/contacts/${id}`);
  selected.value.delete(id);
  await Promise.all([load(), loadStats()]);
}

async function bulkDelete() {
  if (!selected.value.size) return;
  if (!confirm(`¿Eliminar ${selected.value.size} contacto(s)?`)) return;
  await Promise.all([...selected.value].map(id => api.del(`/contacts/${id}`)));
  selected.value.clear();
  await Promise.all([load(), loadStats()]);
}

// ── selection ─────────────────────────────────────────────────────────────────
function toggleAll() {
  if (allChecked.value) { selected.value.clear(); }
  else { contacts.value.forEach(c => selected.value.add(c.id)); }
}

function toggleOne(id: string, e: Event) {
  e.stopPropagation();
  if (selected.value.has(id)) selected.value.delete(id);
  else selected.value.add(id);
}

// ── export ────────────────────────────────────────────────────────────────────
async function exportCsv() {
  const token = localStorage.getItem('crm_token') ?? '';
  const res   = await fetch('/api/contacts/export/csv', { headers: { Authorization: `Bearer ${token}` } });
  const blob  = await res.blob();
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  a.href = url; a.download = 'contactos.csv'; a.click();
  URL.revokeObjectURL(url);
}

// ── import ────────────────────────────────────────────────────────────────────
function triggerImport() { importInput.value?.click(); }

async function onImportFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  importing.value = true;

  try {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) { alert('El archivo no tiene datos.'); return; }

    const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());
    const rows = lines.slice(1).map(line => {
      const vals = line.match(/("(?:[^"]|"")*"|[^,]*)/g) ?? [];
      return Object.fromEntries(headers.map((h, i) => [h, (vals[i] ?? '').replace(/^"|"$/g, '').replace(/""/g, '"').trim()]));
    });

    const result = await api.post<{ created: number; skipped: number }>('/contacts/import/csv', { rows });
    alert(`Importados: ${result.created} contactos. Omitidos: ${result.skipped}.`);
    await Promise.all([load(), loadStats()]);
  } finally {
    importing.value = false;
    if (importInput.value) importInput.value.value = '';
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────
function initials(c: Contact) {
  return [c.first_name, c.last_name].filter(Boolean).map(w => w![0]).slice(0, 2).join('').toUpperCase();
}

const avatarPalette = [
  '#F69008', '#3B82F6', '#8B5CF6', '#10B981',
  '#EF4444', '#06B6D4', '#F59E0B', '#6366F1',
];

function avatarBg(c: Contact) {
  if (c.avatar_color) return c.avatar_color;
  const n = c.id.charCodeAt(0) + c.id.charCodeAt(c.id.length - 1);
  return avatarPalette[n % avatarPalette.length];
}

const shortDate = (d: string) =>
  new Date(d).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });

const statusBadge: Record<string, string> = {
  active:   'bg-emerald-100 text-emerald-700',
  inactive: 'bg-slate-100 text-slate-500',
  blocked:  'bg-red-100 text-red-600',
};
const statusLabel: Record<string, string> = {
  active: 'Activo', inactive: 'Inactivo', blocked: 'Bloqueado',
};
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden bg-slate-50">

    <!-- ── Stat cards ──────────────────────────────────────────────────────── -->
    <div class="grid grid-cols-2 gap-3 border-b border-slate-200 bg-white px-6 py-4 md:grid-cols-4">
      <div class="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
        <div class="flex h-9 w-9 items-center justify-center rounded-lg bg-[#F69008]/10">
          <Users class="h-5 w-5 text-[#F69008]" />
        </div>
        <div>
          <p class="text-xl font-bold text-slate-900">{{ stats?.total ?? '—' }}</p>
          <p class="text-xs text-slate-500">Total</p>
        </div>
      </div>
      <div class="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
        <div class="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50">
          <UserCheck class="h-5 w-5 text-emerald-600" />
        </div>
        <div>
          <p class="text-xl font-bold text-slate-900">{{ stats?.active ?? '—' }}</p>
          <p class="text-xs text-slate-500">Activos</p>
        </div>
      </div>
      <div class="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
        <div class="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50">
          <TrendingUp class="h-5 w-5 text-blue-500" />
        </div>
        <div>
          <p class="text-xl font-bold text-slate-900">{{ stats?.new_this_month ?? '—' }}</p>
          <p class="text-xs text-slate-500">Este mes</p>
        </div>
      </div>
      <div class="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
        <div class="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-50">
          <Building2 class="h-5 w-5 text-violet-500" />
        </div>
        <div>
          <p class="text-xl font-bold text-slate-900">{{ stats?.companies ?? '—' }}</p>
          <p class="text-xs text-slate-500">Compañías</p>
        </div>
      </div>
    </div>

    <!-- ── Toolbar ─────────────────────────────────────────────────────────── -->
    <div class="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-6 py-3">
      <!-- Search -->
      <div class="relative min-w-[220px] flex-1">
        <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          v-model="q"
          @input="onSearch"
          placeholder="Buscar contactos…"
          class="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm transition-all focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20 focus:outline-none"
        />
      </div>

      <!-- Status filter -->
      <Dropdown width="148">
        <template #trigger="{ open }">
          <button class="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-2.5 text-sm text-slate-600 hover:border-primary/40 transition-colors">
            {{ statusFilterLabel }}
            <ChevronDown class="h-3.5 w-3.5 text-slate-400 transition-transform" :class="open ? 'rotate-180' : ''" />
          </button>
        </template>
        <div class="py-0.5">
          <button v-for="opt in [{ v:'', l:'Todo estado' }, { v:'active', l:'Activo' }, { v:'inactive', l:'Inactivo' }, { v:'blocked', l:'Bloqueado' }]"
            :key="opt.v"
            class="flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-slate-50"
            :class="filterStatus === opt.v ? 'text-primary font-medium' : 'text-slate-700'"
            @click="filterStatus = opt.v"
          >
            <Check v-if="filterStatus === opt.v" class="h-3.5 w-3.5 flex-shrink-0" />
            <span v-else class="h-3.5 w-3.5 flex-shrink-0" />
            {{ opt.l }}
          </button>
        </div>
      </Dropdown>

      <!-- Source filter -->
      <Dropdown width="148">
        <template #trigger="{ open }">
          <button class="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-2.5 text-sm text-slate-600 hover:border-primary/40 transition-colors">
            {{ sourceFilterLabel }}
            <ChevronDown class="h-3.5 w-3.5 text-slate-400 transition-transform" :class="open ? 'rotate-180' : ''" />
          </button>
        </template>
        <div class="py-0.5">
          <button
            class="flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-slate-50"
            :class="filterSource === '' ? 'text-primary font-medium' : 'text-slate-700'"
            @click="filterSource = ''"
          >
            <Check v-if="filterSource === ''" class="h-3.5 w-3.5 flex-shrink-0" />
            <span v-else class="h-3.5 w-3.5 flex-shrink-0" />
            Todo origen
          </button>
          <button v-for="s in sourceOptions" :key="s"
            class="flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-slate-50"
            :class="filterSource === s ? 'text-primary font-medium' : 'text-slate-700'"
            @click="filterSource = s"
          >
            <Check v-if="filterSource === s" class="h-3.5 w-3.5 flex-shrink-0" />
            <span v-else class="h-3.5 w-3.5 flex-shrink-0" />
            {{ sourceLabel[s] }}
          </button>
        </div>
      </Dropdown>

      <!-- Sort -->
      <Dropdown width="156">
        <template #trigger="{ open }">
          <button class="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-2.5 text-sm text-slate-600 hover:border-primary/40 transition-colors">
            {{ sortLabel }}
            <ChevronDown class="h-3.5 w-3.5 text-slate-400 transition-transform" :class="open ? 'rotate-180' : ''" />
          </button>
        </template>
        <div class="py-0.5">
          <button v-for="opt in [{ v:'created_at', l:'Más reciente' }, { v:'name', l:'Nombre A-Z' }, { v:'company', l:'Empresa A-Z' }]"
            :key="opt.v"
            class="flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-slate-50"
            :class="sortBy === opt.v ? 'text-primary font-medium' : 'text-slate-700'"
            @click="sortBy = opt.v"
          >
            <Check v-if="sortBy === opt.v" class="h-3.5 w-3.5 flex-shrink-0" />
            <span v-else class="h-3.5 w-3.5 flex-shrink-0" />
            {{ opt.l }}
          </button>
        </div>
      </Dropdown>

      <div class="ml-auto flex items-center gap-2">
        <!-- Bulk delete -->
        <Transition name="fade">
          <div v-if="selected.size > 0" class="flex items-center gap-2">
            <span class="text-xs text-slate-500">{{ selected.size }} seleccionado(s)</span>
            <button
              class="flex cursor-pointer items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
              @click="bulkDelete"
            >
              <Trash2 class="h-4 w-4" /> Eliminar
            </button>
          </div>
        </Transition>

        <!-- Import/Export -->
        <input ref="importInput" type="file" accept=".csv" class="hidden" @change="onImportFile" />

        <Dropdown align="right" width="160">
          <template #trigger>
            <button class="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
              <span v-if="importing"><Spinner :size="14" /></span>
              <Download v-else class="h-4 w-4" />
              <span class="hidden sm:inline">Exportar / Importar</span>
              <ChevronDown class="h-3.5 w-3.5 text-slate-400" />
            </button>
          </template>
          <div class="py-0.5">
            <button class="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors" @click="exportCsv">
              <Download class="h-4 w-4 text-slate-400" /> Exportar CSV
            </button>
            <button class="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors" @click="triggerImport">
              <Upload class="h-4 w-4 text-slate-400" /> Importar CSV
            </button>
          </div>
        </Dropdown>

        <button
          class="flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-primary/30 transition-all duration-200 hover:bg-primary-dark hover:shadow-md"
          @click="showForm = true"
        >
          <Plus class="h-4 w-4" /> Nuevo contacto
        </button>
      </div>
    </div>

    <!-- ── Table ───────────────────────────────────────────────────────────── -->
    <LoadingState v-if="loading" label="Cargando contactos…" />

    <div v-else class="flex-1 overflow-auto">
      <table class="w-full text-sm">
        <thead class="sticky top-0 z-[1] border-b border-slate-200 bg-white text-left">
          <tr>
            <th class="w-10 px-4 py-3">
              <input
                type="checkbox"
                :checked="allChecked"
                @change="toggleAll"
                class="cursor-pointer rounded border-slate-300 accent-primary"
              />
            </th>
            <th class="px-4 py-3 text-xs font-semibold text-slate-500">Contacto</th>
            <th class="hidden px-4 py-3 text-xs font-semibold text-slate-500 md:table-cell">Email</th>
            <th class="hidden px-4 py-3 text-xs font-semibold text-slate-500 lg:table-cell">Teléfono</th>
            <th class="hidden px-4 py-3 text-xs font-semibold text-slate-500 xl:table-cell">Etiquetas</th>
            <th class="hidden px-4 py-3 text-xs font-semibold text-slate-500 xl:table-cell">Origen</th>
            <th class="hidden px-4 py-3 text-xs font-semibold text-slate-500 xl:table-cell">Estado</th>
            <th class="hidden px-4 py-3 text-xs font-semibold text-slate-500 xl:table-cell">Creado</th>
            <th class="px-4 py-3 w-10"></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="c in contacts"
            :key="c.id"
            class="cursor-pointer border-b border-slate-100 transition-colors last:border-0 hover:bg-[#F69008]/5"
            :class="{ 'bg-[#F69008]/8': selected.has(c.id) }"
            @click="router.push(`/contacts/${c.id}`)"
          >
            <!-- Checkbox -->
            <td class="px-4 py-3" @click.stop>
              <input
                type="checkbox"
                :checked="selected.has(c.id)"
                @change="toggleOne(c.id, $event)"
                class="cursor-pointer rounded border-slate-300 accent-primary"
              />
            </td>

            <!-- Avatar + nombre + empresa -->
            <td class="px-4 py-3">
              <div class="flex items-center gap-3">
                <div
                  class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white shadow-sm"
                  :style="{ backgroundColor: avatarBg(c) }"
                >{{ initials(c) }}</div>
                <div>
                  <p class="font-medium text-slate-900">{{ c.first_name }} {{ c.last_name ?? '' }}</p>
                  <p v-if="c.company" class="text-xs text-slate-400">{{ c.company }}<span v-if="c.position"> · {{ c.position }}</span></p>
                  <p v-else class="text-xs text-slate-400 md:hidden">{{ c.email ?? c.phone ?? '' }}</p>
                </div>
              </div>
            </td>

            <!-- Email -->
            <td class="hidden px-4 py-3 text-slate-600 md:table-cell">
              <a v-if="c.email" :href="`mailto:${c.email}`" class="hover:text-primary hover:underline" @click.stop>{{ c.email }}</a>
              <span v-else class="text-slate-300">—</span>
            </td>

            <!-- Phone -->
            <td class="hidden px-4 py-3 text-slate-600 lg:table-cell">
              <a v-if="c.phone" :href="`tel:${c.phone}`" class="hover:text-primary" @click.stop>{{ c.phone }}</a>
              <span v-else class="text-slate-300">—</span>
            </td>

            <!-- Tags -->
            <td class="hidden px-4 py-3 xl:table-cell">
              <div v-if="c.tags?.length" class="flex flex-wrap gap-1">
                <span v-for="t in c.tags.slice(0, 3)" :key="t" class="rounded-sm bg-[#F69008]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#D97706]">{{ t }}</span>
                <span v-if="c.tags.length > 3" class="rounded-sm bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">+{{ c.tags.length - 3 }}</span>
              </div>
              <span v-else class="text-slate-300">—</span>
            </td>

            <!-- Source -->
            <td class="hidden px-4 py-3 xl:table-cell">
              <span v-if="c.source" class="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-600">
                {{ sourceLabel[c.source] ?? c.source }}
              </span>
              <span v-else class="text-slate-300">—</span>
            </td>

            <!-- Status badge -->
            <td class="hidden px-4 py-3 xl:table-cell">
              <span
                class="rounded-full px-2.5 py-0.5 text-xs font-medium"
                :class="statusBadge[c.status] ?? 'bg-slate-100 text-slate-500'"
              >{{ statusLabel[c.status] ?? c.status }}</span>
            </td>

            <!-- Created -->
            <td class="hidden px-4 py-3 text-xs text-slate-400 xl:table-cell">{{ shortDate(c.created_at) }}</td>

            <!-- Actions -->
            <td class="px-4 py-3 text-right" @click.stop>
              <button
                class="cursor-pointer rounded p-1.5 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-500"
                @click="remove(c.id, $event)"
                aria-label="Eliminar"
              >
                <Trash2 class="h-4 w-4" />
              </button>
            </td>
          </tr>

          <!-- Empty state -->
          <tr v-if="contacts.length === 0">
            <td colspan="9" class="px-4 py-16 text-center">
              <div class="flex flex-col items-center gap-2 text-slate-400">
                <Users class="h-8 w-8 opacity-30" />
                <p class="text-sm">No hay contactos{{ q ? ' que coincidan' : ' todavía' }}.</p>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ── Pagination ──────────────────────────────────────────────────────── -->
    <div v-if="!loading && total > limit" class="flex items-center justify-between border-t border-slate-200 bg-white px-6 py-3">
      <span class="text-xs text-slate-500">{{ (page - 1) * limit + 1 }}–{{ Math.min(page * limit, total) }} de {{ total }}</span>
      <div class="flex items-center gap-1">
        <button
          :disabled="page === 1"
          class="cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:cursor-default disabled:opacity-40"
          @click="page--; load()"
        >Anterior</button>
        <button
          :disabled="page * limit >= total"
          class="cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:cursor-default disabled:opacity-40"
          @click="page++; load()"
        >Siguiente</button>
      </div>
    </div>

    <!-- ── Slide-over: Nuevo contacto ─────────────────────────────────────── -->
    <Transition name="overlay">
      <div v-if="showForm" class="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" @click="showForm = false" />
    </Transition>

    <Transition name="slideover">
      <aside v-if="showForm" class="fixed right-0 top-0 z-50 flex h-full w-full max-w-lg flex-col bg-white shadow-2xl">
        <!-- Header -->
        <div class="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 class="text-base font-semibold text-slate-900">Nuevo contacto</h2>
          <button class="cursor-pointer rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" @click="showForm = false">
            <X class="h-5 w-5" />
          </button>
        </div>

        <!-- Body -->
        <form class="flex-1 overflow-y-auto px-6 py-5 space-y-6" @submit.prevent="create">

          <!-- Información personal -->
          <section>
            <h3 class="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Información personal</h3>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="mb-1 block text-xs text-slate-500">Nombre *</label>
                <input v-model="form.first_name" required placeholder="Juan" class="input" />
              </div>
              <div>
                <label class="mb-1 block text-xs text-slate-500">Apellido</label>
                <input v-model="form.last_name" placeholder="Pérez" class="input" />
              </div>
              <div>
                <label class="mb-1 block text-xs text-slate-500">Fecha de nacimiento</label>
                <input v-model="form.birthday" type="date" class="input" />
              </div>
              <div>
                <label class="mb-1 block text-xs text-slate-500">Estado</label>
                <Dropdown width="100%">
                  <template #trigger="{ open }">
                    <button type="button" class="input flex items-center justify-between text-slate-700 cursor-pointer">
                      {{ { active:'Activo', inactive:'Inactivo', blocked:'Bloqueado' }[form.status] }}
                      <ChevronDown class="h-3.5 w-3.5 text-slate-400 transition-transform" :class="open ? 'rotate-180' : ''" />
                    </button>
                  </template>
                  <div class="py-0.5">
                    <button v-for="opt in [{ v:'active', l:'Activo' }, { v:'inactive', l:'Inactivo' }, { v:'blocked', l:'Bloqueado' }]"
                      type="button" :key="opt.v"
                      class="flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-slate-50"
                      :class="form.status === opt.v ? 'text-primary font-medium' : 'text-slate-700'"
                      @click="form.status = opt.v as Contact['status']"
                    >{{ opt.l }}</button>
                  </div>
                </Dropdown>
              </div>
            </div>
          </section>

          <!-- Contacto -->
          <section>
            <h3 class="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Contacto</h3>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="mb-1 block text-xs text-slate-500">Email principal</label>
                <input v-model="form.email" type="email" placeholder="juan@ejemplo.com" class="input" />
              </div>
              <div>
                <label class="mb-1 block text-xs text-slate-500">Email secundario</label>
                <input v-model="form.email_secondary" type="email" placeholder="otro@email.com" class="input" />
              </div>
              <div>
                <label class="mb-1 block text-xs text-slate-500">Teléfono principal</label>
                <input v-model="form.phone" placeholder="+58 412 000 0000" class="input" />
              </div>
              <div>
                <label class="mb-1 block text-xs text-slate-500">Teléfono secundario</label>
                <input v-model="form.phone_secondary" placeholder="+58 412 111 1111" class="input" />
              </div>
              <div class="col-span-2">
                <label class="mb-1 block text-xs text-slate-500">Dirección</label>
                <input v-model="form.address" placeholder="Av. Principal, Edificio Torre" class="input" />
              </div>
              <div>
                <label class="mb-1 block text-xs text-slate-500">Ciudad</label>
                <input v-model="form.city" placeholder="Caracas" class="input" />
              </div>
              <div>
                <label class="mb-1 block text-xs text-slate-500">País</label>
                <input v-model="form.country" placeholder="Venezuela" class="input" />
              </div>
            </div>
          </section>

          <!-- Empresa -->
          <section>
            <h3 class="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Empresa</h3>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="mb-1 block text-xs text-slate-500">Empresa</label>
                <input v-model="form.company" placeholder="Empresa S.A." class="input" />
              </div>
              <div>
                <label class="mb-1 block text-xs text-slate-500">Cargo / Posición</label>
                <input v-model="form.position" placeholder="Gerente de Ventas" class="input" />
              </div>
              <div>
                <label class="mb-1 block text-xs text-slate-500">Origen</label>
                <Dropdown width="100%">
                  <template #trigger="{ open }">
                    <button type="button" class="input flex items-center justify-between text-slate-700 cursor-pointer">
                      {{ form.source ? (sourceLabel[form.source] ?? form.source) : 'Sin especificar' }}
                      <ChevronDown class="h-3.5 w-3.5 text-slate-400 transition-transform" :class="open ? 'rotate-180' : ''" />
                    </button>
                  </template>
                  <div class="py-0.5">
                    <button type="button" class="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-500 hover:bg-slate-50 transition-colors" @click="form.source = ''">Sin especificar</button>
                    <button v-for="s in sourceOptions" type="button" :key="s"
                      class="flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-slate-50"
                      :class="form.source === s ? 'text-primary font-medium' : 'text-slate-700'"
                      @click="form.source = s"
                    >{{ sourceLabel[s] }}</button>
                  </div>
                </Dropdown>
              </div>
              <div>
                <label class="mb-1 block text-xs text-slate-500">Etiquetas</label>
                <div
                  class="input flex min-h-[2.25rem] flex-wrap items-center gap-1 cursor-text"
                  @click="tagInputEl?.focus()"
                >
                  <span
                    v-for="t in form.tags" :key="t"
                    class="flex items-center gap-1 rounded bg-[#F69008]/10 px-1.5 py-0.5 text-xs font-medium text-[#D97706]"
                  >
                    {{ t }}
                    <button type="button" @click.stop="removeTag(t)" class="leading-none hover:text-[#92400e]"><X class="h-3 w-3" /></button>
                  </span>
                  <input
                    ref="tagInputEl"
                    v-model="tagDraft"
                    @keydown="onTagKey"
                    @blur="() => { if(tagDraft.trim()) addTag(tagDraft); }"
                    placeholder="Añadir…"
                    class="min-w-[80px] flex-1 border-none bg-transparent text-sm outline-none placeholder:text-slate-400"
                  />
                </div>
              </div>
            </div>
          </section>

          <!-- Redes sociales -->
          <section>
            <h3 class="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Redes sociales</h3>
            <div class="grid grid-cols-2 gap-3">
              <div class="flex items-center gap-2">
                <Linkedin class="h-4 w-4 flex-shrink-0 text-[#0077B5]" />
                <input v-model="form.linkedin" placeholder="linkedin.com/in/usuario" class="input flex-1" />
              </div>
              <div class="flex items-center gap-2">
                <Twitter class="h-4 w-4 flex-shrink-0 text-[#1DA1F2]" />
                <input v-model="form.twitter" placeholder="@usuario" class="input flex-1" />
              </div>
              <div class="flex items-center gap-2">
                <Instagram class="h-4 w-4 flex-shrink-0 text-[#E1306C]" />
                <input v-model="form.instagram" placeholder="@usuario" class="input flex-1" />
              </div>
              <div class="flex items-center gap-2">
                <Globe class="h-4 w-4 flex-shrink-0 text-slate-400" />
                <input v-model="form.website" placeholder="https://empresa.com" class="input flex-1" />
              </div>
            </div>
          </section>

          <!-- Notas -->
          <section>
            <h3 class="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Notas</h3>
            <textarea
              v-model="form.notes"
              rows="3"
              placeholder="Observaciones sobre el contacto…"
              class="input resize-none"
            />
          </section>

          <!-- Footer buttons -->
          <div class="flex items-center gap-3 pb-2">
            <button
              type="submit"
              :disabled="saving"
              class="flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-primary/30 transition-all hover:bg-primary-dark disabled:opacity-60"
            >
              <Spinner v-if="saving" :size="14" light />
              {{ saving ? 'Guardando…' : 'Crear contacto' }}
            </button>
            <button
              type="button"
              class="cursor-pointer rounded-lg px-4 py-2.5 text-sm text-slate-500 hover:bg-slate-100"
              @click="showForm = false"
            >Cancelar</button>
          </div>

        </form>
      </aside>
    </Transition>

  </div>
</template>

<style scoped>
/* Slide-over */
.slideover-enter-active,
.slideover-leave-active {
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.slideover-enter-from,
.slideover-leave-to {
  transform: translateX(100%);
}

/* Overlay */
.overlay-enter-active,
.overlay-leave-active {
  transition: opacity 0.2s ease;
}
.overlay-enter-from,
.overlay-leave-to {
  opacity: 0;
}

/* Fade */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
