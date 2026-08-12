<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import {
  Plus, Pencil, ChevronUp, ChevronDown, Trash2, X, Search, MoreVertical,
  Layers, CalendarClock, Hash, Workflow, GripVertical,
} from 'lucide-vue-next';
import { api } from '../api';
import type { Pipeline } from '../types';
import OppTabs from '../components/OppTabs.vue';
import Spinner from '../components/Spinner.vue';
import LoadingState from '../components/LoadingState.vue';
import Dropdown from '../components/Dropdown.vue';

const pipelines = ref<Pipeline[]>([]);
const loading = ref(true);
const q = ref('');
const PRESET = ['#dbeafe', '#dcfce7', '#fef9c3', '#ffedd5', '#fee2e2', '#fce7f3', '#f3e8ff', '#e0e7ff', '#e2e8f0'];

const filtered = computed(() => {
  const term = q.value.trim().toLowerCase();
  return term ? pipelines.value.filter(p => p.name.toLowerCase().includes(term)) : pipelines.value;
});

const dateTime = (d?: string) => d
  ? new Date(d).toLocaleString('es-VE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—';

async function load() { pipelines.value = await api.get<Pipeline[]>('/pipelines'); }
onMounted(async () => { try { await load(); } finally { loading.value = false; } });

// ── Editor modal ───────────────────────────────────────────────────────────
type StageDraft = { id?: string; name: string; color: string };
const editing = ref<Pipeline | null>(null);
const isNew = ref(false);
const form = ref<{ name: string; stages: StageDraft[] }>({ name: '', stages: [] });
const colorOpen = ref<number | null>(null);
const saving = ref(false);
const error = ref('');

function openEditor(p: Pipeline) {
  editing.value = p;
  isNew.value = false;
  error.value = '';
  form.value = { name: p.name, stages: p.stages.map(s => ({ id: s.id, name: s.name, color: s.color })) };
}
function closeEditor() { editing.value = null; colorOpen.value = null; }

function moveStage(i: number, dir: -1 | 1) {
  const j = i + dir;
  const s = form.value.stages;
  if (j < 0 || j >= s.length) return;
  [s[i], s[j]] = [s[j], s[i]];
}
function addStage() { form.value.stages.push({ name: 'Nueva etapa', color: PRESET[form.value.stages.length % PRESET.length] }); }
function removeStage(i: number) { form.value.stages.splice(i, 1); }
function setColor(i: number, c: string) { form.value.stages[i].color = c; colorOpen.value = null; }

async function save() {
  error.value = '';
  saving.value = true;
  try {
    await api.put(`/pipelines/${editing.value!.id}/edit`, form.value);
    await load();
    closeEditor();
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo guardar';
  } finally {
    saving.value = false;
  }
}

async function newPipeline() {
  const p = await api.post<{ id: string }>('/pipelines', { name: 'Nuevo pipeline' });
  await load();
  const created = pipelines.value.find(x => x.id === p.id);
  if (created) { openEditor(created); isNew.value = true; }
}

async function deletePipeline(p: Pipeline) {
  if (pipelines.value.length <= 1) return alert('Debe existir al menos un pipeline.');
  if (!confirm(`¿Eliminar "${p.name}" y todas sus oportunidades?`)) return;
  await api.del(`/pipelines/${p.id}`);
  await load();
  if (editing.value?.id === p.id) closeEditor();
}
</script>

<template>
  <div class="flex h-full flex-col">
    <OppTabs />

    <div class="flex-1 overflow-auto p-8">
      <div class="mx-auto max-w-5xl">
        <!-- Encabezado -->
        <div class="mb-6 flex items-start justify-between">
          <div>
            <h2 class="text-xl font-semibold text-slate-900">Pipelines</h2>
            <p class="mt-1 text-sm text-slate-500">Usa pipelines para seguir oportunidades a través de las etapas de tu proceso de ventas.</p>
          </div>
          <button class="flex flex-shrink-0 cursor-pointer items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-primary/30 transition-all hover:bg-primary-dark hover:shadow-md" @click="newPipeline">
            <Plus class="h-4 w-4" /> Crear pipeline
          </button>
        </div>

        <LoadingState v-if="loading" label="Cargando pipelines…" />

        <div v-else class="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-card">
          <!-- Buscador -->
          <div class="border-b border-slate-200 p-3">
            <div class="relative w-72">
              <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input v-model="q" placeholder="Buscar pipeline…" class="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm shadow-sm transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none" />
            </div>
          </div>

          <!-- Tabla -->
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-slate-200 bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th class="w-12 px-4 py-3"></th>
                <th class="w-14 px-2 py-3"><span class="flex items-center gap-1.5"><Hash class="h-3.5 w-3.5" /></span></th>
                <th class="px-2 py-3"><span class="flex items-center gap-1.5"><Workflow class="h-3.5 w-3.5" /> Nombre del pipeline</span></th>
                <th class="px-2 py-3"><span class="flex items-center gap-1.5"><Layers class="h-3.5 w-3.5" /> Etapas</span></th>
                <th class="px-2 py-3"><span class="flex items-center gap-1.5"><CalendarClock class="h-3.5 w-3.5" /> Actualizado</span></th>
                <th class="w-16 px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(p, i) in filtered" :key="p.id" class="group border-b border-slate-100 transition-colors last:border-0 hover:bg-[#F69008]/5">
                <td class="px-4 py-3 text-slate-300"><GripVertical class="h-4 w-4" /></td>
                <td class="px-2 py-3 font-medium text-slate-400">{{ i + 1 }}</td>
                <td class="px-2 py-3">
                  <button class="cursor-pointer font-semibold text-slate-900 transition-colors hover:text-primary" @click="openEditor(p)">{{ p.name }}</button>
                  <div class="mt-1.5 flex flex-wrap gap-1">
                    <span v-for="s in p.stages.slice(0, 6)" :key="s.id" class="h-2 w-6 rounded-full" :style="{ backgroundColor: s.color }" :title="s.name"></span>
                    <span v-if="p.stages.length > 6" class="text-[11px] text-slate-400">+{{ p.stages.length - 6 }}</span>
                  </div>
                </td>
                <td class="px-2 py-3">
                  <span class="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">{{ p.stages.length }}</span>
                </td>
                <td class="px-2 py-3 text-slate-500">{{ dateTime(p.updated_at) }}</td>
                <td class="px-4 py-3 text-right">
                  <Dropdown align="right" width="160px">
                    <template #trigger="{ open }">
                      <button class="cursor-pointer rounded-md p-1.5 text-slate-400 transition-colors hover:bg-white hover:text-slate-700 hover:shadow-sm" :class="open && 'bg-white text-primary shadow-sm'" aria-label="Acciones">
                        <MoreVertical class="h-4 w-4" />
                      </button>
                    </template>
                    <button class="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100" @click="openEditor(p)">
                      <Pencil class="h-4 w-4 text-slate-400" /> Editar
                    </button>
                    <button class="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium text-red-600 transition-colors hover:bg-red-50" @click="deletePipeline(p)">
                      <Trash2 class="h-4 w-4" /> Eliminar
                    </button>
                  </Dropdown>
                </td>
              </tr>
              <tr v-if="filtered.length === 0">
                <td colspan="6" class="px-4 py-12 text-center text-slate-400">
                  {{ q ? 'Ningún pipeline coincide con la búsqueda.' : 'No hay pipelines todavía.' }}
                </td>
              </tr>
            </tbody>
          </table>

          <!-- Footer -->
          <div class="flex items-center justify-between border-t border-slate-200 bg-slate-50/50 px-4 py-2.5 text-xs text-slate-500">
            <span>{{ filtered.length }} pipeline{{ filtered.length === 1 ? '' : 's' }}</span>
            <span>Página 1 de 1</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal de edición enriquecido -->
    <Transition name="modal">
    <div v-if="editing" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" @click.self="closeEditor">
      <div class="modal-panel flex max-h-[90vh] w-full max-w-lg flex-col rounded-md bg-white shadow-modal">
        <!-- Header con ícono -->
        <div class="flex items-start justify-between border-b border-slate-200 px-6 py-4">
          <div class="flex items-center gap-3">
            <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-[#F69008] to-[#D97706] text-white shadow-sm shadow-[#F69008]/30">
              <Workflow class="h-5 w-5" />
            </div>
            <div>
              <h2 class="text-base font-semibold text-slate-900">{{ isNew ? 'Crear pipeline' : 'Editar pipeline' }}</h2>
              <p class="text-xs text-slate-500">Configura las etapas de tu embudo</p>
            </div>
          </div>
          <button class="cursor-pointer rounded-md p-1 text-slate-400 hover:bg-slate-100" @click="closeEditor"><X class="h-5 w-5" /></button>
        </div>

        <div class="flex-1 space-y-5 overflow-auto px-6 py-5">
          <div>
            <label class="mb-1.5 block text-sm font-medium text-slate-700">Nombre del pipeline</label>
            <input v-model="form.name" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none" />
          </div>

          <div>
            <div class="mb-2 flex items-center justify-between">
              <label class="text-sm font-medium text-slate-700">Etapas</label>
              <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">{{ form.stages.length }}</span>
            </div>
            <div class="space-y-2">
              <div v-for="(s, i) in form.stages" :key="i" class="relative flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 p-2 shadow-sm transition-colors hover:border-slate-300">
                <span class="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-white text-xs font-semibold text-slate-400 shadow-sm">{{ i + 1 }}</span>
                <button type="button" class="h-7 w-7 flex-shrink-0 cursor-pointer rounded-md border border-slate-300 shadow-sm transition-transform hover:scale-105" :style="{ backgroundColor: s.color }" @click="colorOpen = colorOpen === i ? null : i" aria-label="Cambiar color"></button>
                <input v-model="s.name" class="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary/20 focus:outline-none" />
                <button type="button" class="cursor-pointer rounded-md p-1 text-slate-400 hover:bg-white hover:text-slate-700 disabled:opacity-30" :disabled="i === 0" @click="moveStage(i, -1)"><ChevronUp class="h-4 w-4" /></button>
                <button type="button" class="cursor-pointer rounded-md p-1 text-slate-400 hover:bg-white hover:text-slate-700 disabled:opacity-30" :disabled="i === form.stages.length - 1" @click="moveStage(i, 1)"><ChevronDown class="h-4 w-4" /></button>
                <button type="button" class="cursor-pointer rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30" :disabled="form.stages.length <= 1" @click="removeStage(i)"><Trash2 class="h-4 w-4" /></button>

                <div v-if="colorOpen === i" class="absolute left-16 top-11 z-10 flex flex-wrap gap-1.5 rounded-md border border-slate-200 bg-white p-2 shadow-dropdown" style="width: 172px">
                  <button v-for="c in PRESET" :key="c" type="button" class="h-7 w-7 cursor-pointer rounded-md border-2 transition-transform hover:scale-110" :style="{ backgroundColor: c, borderColor: s.color === c ? '#F69008' : 'transparent' }" @click="setColor(i, c)"></button>
                </div>
              </div>
            </div>
            <button type="button" class="mt-2 flex cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 transition-all hover:border-primary hover:bg-primary/5 hover:text-primary" @click="addStage">
              <Plus class="h-4 w-4" /> Añadir etapa
            </button>
          </div>

          <!-- Preview del tablero -->
          <div>
            <label class="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">Vista previa</label>
            <div class="flex gap-1.5 overflow-x-auto rounded-md border border-slate-200 bg-slate-100/60 p-2">
              <div v-for="(s, i) in form.stages" :key="i" class="flex-shrink-0">
                <div class="w-24 rounded-t-sm px-2 py-1.5 text-[11px] font-semibold text-slate-700" :style="{ backgroundColor: s.color }">{{ s.name || 'Etapa' }}</div>
                <div class="h-10 w-24 rounded-b-sm border border-t-0 border-slate-200 bg-white"></div>
              </div>
              <p v-if="form.stages.length === 0" class="px-2 py-3 text-xs text-slate-400">Añade etapas para ver la vista previa</p>
            </div>
          </div>

          <p v-if="error" class="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{{ error }}</p>
        </div>

        <div class="flex items-center justify-between border-t border-slate-200 px-6 py-4">
          <button class="flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50" @click="deletePipeline(editing)"><Trash2 class="h-4 w-4" /> Eliminar</button>
          <div class="flex gap-2">
            <button class="cursor-pointer rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100" @click="closeEditor">Cancelar</button>
            <button :disabled="saving" class="flex cursor-pointer items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-primary/30 transition-all hover:bg-primary-dark hover:shadow-md disabled:opacity-60" @click="save"><Spinner v-if="saving" :size="16" light /> {{ saving ? 'Guardando…' : 'Guardar' }}</button>
          </div>
        </div>
      </div>
    </div>
    </Transition>
  </div>
</template>
