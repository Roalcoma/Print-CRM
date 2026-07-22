<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Plus, Pencil, ChevronUp, ChevronDown, Trash2, X, GripVertical } from 'lucide-vue-next';
import { api } from '../api';
import type { Pipeline } from '../types';
import OppTabs from '../components/OppTabs.vue';

const pipelines = ref<Pipeline[]>([]);
const PRESET = ['#dbeafe', '#dcfce7', '#fef9c3', '#ffedd5', '#fee2e2', '#fce7f3', '#f3e8ff', '#e0e7ff', '#e2e8f0'];

async function load() { pipelines.value = await api.get<Pipeline[]>('/pipelines'); }
onMounted(load);

// ── Editor modal ───────────────────────────────────────────────────────────
type StageDraft = { id?: string; name: string; color: string };
const editing = ref<Pipeline | null>(null);
const form = ref<{ name: string; stages: StageDraft[] }>({ name: '', stages: [] });
const colorOpen = ref<number | null>(null);
const saving = ref(false);
const error = ref('');

function openEditor(p: Pipeline) {
  editing.value = p;
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
function addStage() { form.value.stages.push({ name: 'Nueva etapa', color: '#e2e8f0' }); }
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
  if (created) openEditor(created);
}

async function deletePipeline() {
  if (pipelines.value.length <= 1) return alert('Debe existir al menos un pipeline.');
  if (!confirm(`¿Eliminar "${editing.value!.name}" y todas sus oportunidades?`)) return;
  await api.del(`/pipelines/${editing.value!.id}`);
  await load();
  closeEditor();
}
</script>

<template>
  <div class="flex h-full flex-col">
    <OppTabs />

    <div class="flex-1 overflow-auto p-8">
      <div class="mx-auto max-w-4xl">
        <div class="mb-5 flex items-center justify-between">
          <div>
            <h2 class="text-lg font-semibold text-slate-900">Pipelines</h2>
            <p class="text-sm text-slate-500">Gestiona tus embudos y sus etapas</p>
          </div>
          <button class="flex cursor-pointer items-center gap-2 rounded-sm bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark" @click="newPipeline">
            <Plus class="h-4 w-4" /> Nuevo pipeline
          </button>
        </div>

        <!-- Listado -->
        <div class="divide-y divide-slate-200 rounded-sm border border-slate-200 bg-white">
          <div v-for="p in pipelines" :key="p.id" class="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-slate-50">
            <div class="min-w-0 flex-1">
              <div class="flex items-baseline gap-2">
                <p class="font-medium text-slate-900">{{ p.name }}</p>
                <span class="text-xs text-slate-400">{{ p.stages.length }} etapas</span>
              </div>
              <p v-if="p.created_at" class="text-xs text-slate-400">Creado el {{ new Date(p.created_at).toLocaleString('es-VE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }}</p>
              <div class="mt-2 flex flex-wrap gap-1.5">
                <span v-for="s in p.stages" :key="s.id" class="rounded-sm px-2 py-0.5 text-xs font-medium text-slate-700" :style="{ backgroundColor: s.color }">{{ s.name }}</span>
              </div>
            </div>
            <button class="flex flex-shrink-0 cursor-pointer items-center gap-1.5 rounded-sm border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100" @click="openEditor(p)">
              <Pencil class="h-4 w-4" /> Editar
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal de edición -->
    <div v-if="editing" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" @click.self="closeEditor">
      <div class="flex max-h-[90vh] w-full max-w-lg flex-col rounded-sm bg-white shadow-xl">
        <div class="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 class="text-base font-semibold text-slate-900">Editar pipeline</h2>
          <button class="cursor-pointer rounded-sm p-1 text-slate-400 hover:bg-slate-100" @click="closeEditor"><X class="h-5 w-5" /></button>
        </div>

        <div class="flex-1 space-y-5 overflow-auto px-6 py-5">
          <div>
            <label class="mb-1.5 block text-sm font-medium text-slate-700">Nombre del pipeline</label>
            <input v-model="form.name" class="w-full rounded-sm border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none" />
          </div>

          <div>
            <label class="mb-2 block text-sm font-medium text-slate-700">Etapas</label>
            <div class="space-y-2">
              <div v-for="(s, i) in form.stages" :key="i" class="relative flex items-center gap-2 rounded-sm border border-slate-200 bg-slate-50 p-2">
                <GripVertical class="h-4 w-4 flex-shrink-0 text-slate-300" />
                <!-- Swatch de color -->
                <button type="button" class="h-7 w-7 flex-shrink-0 cursor-pointer rounded-sm border border-slate-300" :style="{ backgroundColor: s.color }" @click="colorOpen = colorOpen === i ? null : i" aria-label="Cambiar color"></button>
                <input v-model="s.name" class="min-w-0 flex-1 rounded-sm border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary/20 focus:outline-none" />
                <button type="button" class="cursor-pointer rounded-sm p-1 text-slate-400 hover:bg-white hover:text-slate-700 disabled:opacity-30" :disabled="i === 0" @click="moveStage(i, -1)"><ChevronUp class="h-4 w-4" /></button>
                <button type="button" class="cursor-pointer rounded-sm p-1 text-slate-400 hover:bg-white hover:text-slate-700 disabled:opacity-30" :disabled="i === form.stages.length - 1" @click="moveStage(i, 1)"><ChevronDown class="h-4 w-4" /></button>
                <button type="button" class="cursor-pointer rounded-sm p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30" :disabled="form.stages.length <= 1" @click="removeStage(i)"><Trash2 class="h-4 w-4" /></button>

                <!-- Paleta -->
                <div v-if="colorOpen === i" class="absolute left-10 top-11 z-10 flex flex-wrap gap-1.5 rounded-sm border border-slate-200 bg-white p-2 shadow-lg" style="width: 172px">
                  <button v-for="c in PRESET" :key="c" type="button" class="h-7 w-7 cursor-pointer rounded-sm border-2 transition-transform hover:scale-110" :style="{ backgroundColor: c, borderColor: s.color === c ? '#6366f1' : 'transparent' }" @click="setColor(i, c)"></button>
                </div>
              </div>
            </div>
            <button type="button" class="mt-2 flex cursor-pointer items-center gap-1.5 rounded-sm border border-dashed border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:border-primary hover:text-primary" @click="addStage">
              <Plus class="h-4 w-4" /> Añadir etapa
            </button>
          </div>

          <p v-if="error" class="rounded-sm bg-red-50 px-3 py-2 text-sm text-red-600">{{ error }}</p>
        </div>

        <div class="flex items-center justify-between border-t border-slate-200 px-6 py-4">
          <button class="cursor-pointer rounded-sm px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50" @click="deletePipeline">Eliminar pipeline</button>
          <div class="flex gap-2">
            <button class="cursor-pointer rounded-sm px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100" @click="closeEditor">Cancelar</button>
            <button :disabled="saving" class="cursor-pointer rounded-sm bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60" @click="save">{{ saving ? 'Guardando…' : 'Guardar' }}</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
