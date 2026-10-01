<script setup lang="ts">
// Oportunidad (lead) de una cita: ver, abrir, vincular/desvincular, crear y cambiar de etapa.
// Si la cita ya existe (appointmentId), vincular/desvincular se guarda al instante;
// en una cita nueva solo actualiza el v-model y se guarda con la cita.
import { ref, computed, watch } from 'vue';
import { Target, ExternalLink, X, Search, Plus, ChevronDown, Check, Link2 } from 'lucide-vue-next';
import { api } from '../api';
import type { Opportunity, Pipeline } from '../types';
import Dropdown from './Dropdown.vue';
import BizSelect from './BizSelect.vue';
import Spinner from './Spinner.vue';

const props = defineProps<{
  modelValue: string;              // opportunity_id ('' = sin oportunidad)
  appointmentId?: string;
  contactId?: string | null;
  contactName?: string | null;
}>();
const emit = defineEmits<{ 'update:modelValue': [string]; changed: [] }>();

interface Hit {
  id: string; title: string; status: Opportunity['status']; value: string;
  pipeline_name: string; stage_name: string | null; stage_color: string | null;
  contact_first_name: string | null; contact_last_name: string | null; is_contact: boolean;
}

const pipelines = ref<Pipeline[]>([]);
const opp = ref<Opportunity | null>(null);
const loading = ref(false);
const busy = ref(false);
const error = ref('');

const money = (n: number) => n.toLocaleString('es-VE', { style: 'currency', currency: 'USD' });
const statusLbl: Record<string, string> = { open: 'Abierta', won: 'Ganada', lost: 'Perdida' };
const statusCls: Record<string, string> = { open: 'bg-blue-50 text-blue-600', won: 'bg-emerald-50 text-emerald-600', lost: 'bg-red-50 text-red-600' };

const oppPipeline = computed(() => pipelines.value.find(p => p.id === opp.value?.pipeline_id) ?? null);
const oppStage = computed(() => oppPipeline.value?.stages.find(s => s.id === opp.value?.stage_id) ?? null);
const oppContact = computed(() => [opp.value?.contact_first_name, opp.value?.contact_last_name].filter(Boolean).join(' '));

async function loadPipelines() {
  if (!pipelines.value.length) pipelines.value = await api.get<Pipeline[]>('/pipelines').catch(() => []);
}

// ── Carga de la oportunidad vinculada o de las sugerencias del contacto ─────
const hits = ref<Hit[]>([]);
const suggestion = computed(() => hits.value.find(h => h.is_contact) ?? null);

async function refresh() {
  error.value = '';
  loading.value = true;
  try {
    await loadPipelines();
    if (props.modelValue) {
      opp.value = await api.get<Opportunity>(`/opportunities/${props.modelValue}`).catch(() => null);
    } else {
      opp.value = null;
      await search('');
    }
  } finally { loading.value = false; }
}
watch(() => [props.modelValue, props.contactId], refresh, { immediate: true });

// ── Buscar ───────────────────────────────────────────────────────────────────
const q = ref('');
const searching = ref(false);
async function search(text: string) {
  searching.value = true;
  try {
    const params = new URLSearchParams({ q: text });
    if (props.contactId) params.set('contactId', props.contactId);
    hits.value = await api.get<Hit[]>(`/opportunities/search?${params}`);
  } catch { hits.value = []; }
  finally { searching.value = false; }
}
let t: ReturnType<typeof setTimeout>;
watch(q, v => { clearTimeout(t); t = setTimeout(() => search(v), 250); });

// ── Vincular / desvincular ───────────────────────────────────────────────────
async function link(id: string | null) {
  error.value = '';
  busy.value = true;
  try {
    if (props.appointmentId) {
      await api.patch(`/appointments/${props.appointmentId}`, { opportunity_id: id });
      emit('changed');
    }
    emit('update:modelValue', id ?? '');
    q.value = '';
  } catch (e) { error.value = (e as Error).message; }
  finally { busy.value = false; }
}

// ── Crear nueva para el contacto ─────────────────────────────────────────────
const creating = ref(false);
const newTitle = ref('');
const newStage = ref('');
const stageOptions = computed(() => pipelines.value.flatMap(p =>
  p.stages.map(s => ({ value: s.id, label: pipelines.value.length > 1 ? `${p.name} · ${s.name}` : s.name, group: p.name }))));
function startCreate() {
  creating.value = true;
  newTitle.value = props.contactName?.trim() || '';
  newStage.value = pipelines.value[0]?.stages[0]?.id ?? '';
}
async function create() {
  const pipeline = pipelines.value.find(p => p.stages.some(s => s.id === newStage.value));
  if (!pipeline || !newTitle.value.trim()) return;
  error.value = '';
  busy.value = true;
  try {
    const o = await api.post<Opportunity>('/opportunities', {
      title: newTitle.value.trim(), pipeline_id: pipeline.id, stage_id: newStage.value,
      contact_id: props.contactId || null,
    });
    creating.value = false;
    await link(o.id);
  } catch (e) { error.value = (e as Error).message; }
  finally { busy.value = false; }
}

// ── Cambiar etapa al instante ────────────────────────────────────────────────
async function setStage(stageId: string) {
  if (!opp.value || opp.value.stage_id === stageId) return;
  const prev = opp.value.stage_id;
  opp.value.stage_id = stageId;
  error.value = '';
  try { await api.patch(`/opportunities/${opp.value.id}`, { stage_id: stageId }); }
  catch (e) { opp.value.stage_id = prev; error.value = (e as Error).message; }
}
</script>

<template>
  <div class="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-2.5">
    <div class="flex items-center gap-2">
      <Target class="h-4 w-4 shrink-0 text-slate-400" />
      <span class="text-sm font-medium text-slate-700">Oportunidad</span>
      <Spinner v-if="loading || busy" :size="12" class="ml-1" />
      <template v-if="opp">
        <a :href="`/opportunities?open=${opp.id}`" target="_blank" rel="noopener"
          class="ml-auto inline-flex items-center gap-1 rounded-md bg-[#13243D] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#1d3557] transition-colors">
          Abrir <ExternalLink class="h-3 w-3" />
        </a>
        <button type="button" title="Desvincular de la cita" :disabled="busy"
          class="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-500 cursor-pointer disabled:opacity-50"
          @click="link(null)">
          <X class="h-4 w-4" />
        </button>
      </template>
    </div>

    <!-- Vinculada -->
    <div v-if="opp" class="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
      <div class="flex items-start gap-2">
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-semibold text-slate-900">{{ opp.title }}</p>
          <p class="truncate text-xs text-slate-500">
            {{ oppPipeline?.name ?? 'Pipeline' }}<template v-if="oppContact"> · {{ oppContact }}</template>
          </p>
        </div>
        <div class="shrink-0 text-right">
          <p class="text-sm font-semibold text-emerald-600">{{ money(Number(opp.value)) }}</p>
          <span class="inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide" :class="statusCls[opp.status]">{{ statusLbl[opp.status] }}</span>
        </div>
      </div>
      <!-- Etapa -->
      <div class="mt-2.5 flex items-center gap-2">
        <span class="text-xs text-slate-500">Etapa</span>
        <Dropdown width="240" triggerClass="block min-w-0 flex-1">
          <template #trigger="{ open }">
            <button type="button"
              class="flex w-full cursor-pointer items-center gap-2 rounded-md border bg-white px-2.5 py-1.5 text-left text-sm transition-colors"
              :class="open ? 'border-[#F69008] ring-2 ring-[#F69008]/20' : 'border-slate-300 hover:border-slate-400'">
              <span class="h-2.5 w-2.5 shrink-0 rounded-full" :style="{ background: oppStage?.color ?? '#94a3b8' }" />
              <span class="truncate font-medium text-slate-800">{{ oppStage?.name ?? 'Sin etapa' }}</span>
              <ChevronDown class="ml-auto h-4 w-4 shrink-0 text-slate-400 transition-transform" :class="open ? 'rotate-180 text-[#F69008]' : ''" />
            </button>
          </template>
          <div class="max-h-64 overflow-y-auto py-1">
            <button v-for="s in oppPipeline?.stages ?? []" :key="s.id" type="button"
              class="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[13px] transition-colors"
              :class="s.id === opp.stage_id ? 'bg-[#F69008]/8 font-semibold text-[#9a5a00]' : 'text-slate-700 hover:bg-slate-50'"
              @click="setStage(s.id)">
              <span class="h-2.5 w-2.5 shrink-0 rounded-full" :style="{ background: s.color }" />
              <span class="truncate">{{ s.name }}</span>
              <Check v-if="s.id === opp.stage_id" class="ml-auto h-3.5 w-3.5 shrink-0" />
            </button>
          </div>
        </Dropdown>
      </div>
    </div>

    <!-- Sin oportunidad -->
    <template v-else-if="!loading">
      <!-- Sugerencia: lead del contacto de la cita -->
      <div v-if="suggestion && !creating"
        class="flex items-center gap-2 rounded-md border border-[#F69008]/40 bg-[#F69008]/5 p-2.5">
        <div class="min-w-0 flex-1">
          <p class="text-[11px] font-medium text-[#9a5a00]">¿Vincular el lead de este contacto?</p>
          <p class="truncate text-sm font-semibold text-slate-900">{{ suggestion.title }}</p>
          <p class="flex items-center gap-1.5 truncate text-[11px] text-slate-500">
            <span class="h-2 w-2 shrink-0 rounded-full" :style="{ background: suggestion.stage_color ?? '#94a3b8' }" />
            <span class="truncate">{{ suggestion.stage_name }} · {{ suggestion.pipeline_name }}</span>
          </p>
        </div>
        <button type="button" :disabled="busy" class="btn btn-primary !px-3 !py-1.5 !text-xs" @click="link(suggestion.id)">
          <Link2 class="h-3.5 w-3.5" /> Vincular
        </button>
      </div>

      <div v-if="!creating" class="grid grid-cols-2 gap-2">
        <!-- Buscar otra -->
        <Dropdown width="100%" triggerClass="block" align="left">
          <template #trigger>
            <button type="button"
              class="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-slate-400">
              <Search class="h-3.5 w-3.5 text-slate-400" /> Buscar
            </button>
          </template>
          <div class="w-[min(320px,calc(100vw-32px))]">
            <div class="relative px-1 pb-1 pt-0.5" @click.stop>
              <Search class="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input v-model="q" placeholder="Nombre, empresa, correo o teléfono…" autocomplete="off"
                class="w-full rounded-md border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-2 text-[13px] text-slate-700 focus:border-[#F69008] focus:bg-white focus:outline-none" />
            </div>
            <div class="max-h-64 overflow-y-auto py-1">
              <template v-for="(h, i) in hits" :key="h.id">
                <p v-if="i === 0 || h.is_contact !== hits[i - 1].is_contact"
                  class="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  {{ h.is_contact ? 'De este contacto' : 'Otras de la cuenta' }}
                </p>
                <button type="button" class="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-slate-50"
                  @click="link(h.id)">
                  <span class="h-2.5 w-2.5 shrink-0 rounded-full" :style="{ background: h.stage_color ?? '#94a3b8' }" />
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-[13px] font-medium text-slate-800">{{ h.title }}</span>
                    <span class="block truncate text-[11px] text-slate-400">{{ h.pipeline_name }} · {{ h.stage_name }}<template v-if="h.contact_first_name"> · {{ [h.contact_first_name, h.contact_last_name].filter(Boolean).join(' ') }}</template></span>
                  </span>
                </button>
              </template>
              <p v-if="!hits.length" class="px-3 py-3 text-center text-[13px] text-slate-400">{{ searching ? 'Buscando…' : 'Sin resultados' }}</p>
            </div>
          </div>
        </Dropdown>
        <button type="button" :disabled="!stageOptions.length"
          class="flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-dashed border-[#F69008]/60 bg-white px-3 py-2 text-sm font-medium text-[#9a5a00] hover:bg-[#F69008]/5 disabled:opacity-50"
          @click="startCreate">
          <Plus class="h-3.5 w-3.5" /> Crear nueva
        </button>
      </div>

      <!-- Crear nueva -->
      <div v-else class="space-y-2 rounded-md border border-slate-200 bg-white p-2.5">
        <input v-model="newTitle" placeholder="Nombre de la oportunidad"
          class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-[#F69008] focus:ring-2 focus:ring-[#F69008]/20 focus:outline-none" />
        <BizSelect v-model="newStage" :options="stageOptions" searchable placeholder="Pipeline y etapa"
          input-class="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" />
        <p v-if="!contactId" class="text-[11px] text-amber-600">La cita no tiene contacto: la oportunidad se creará sin contacto.</p>
        <div class="flex justify-end gap-2">
          <button type="button" class="btn btn-ghost !py-1.5 !text-xs" @click="creating = false">Cancelar</button>
          <button type="button" :disabled="busy || !newTitle.trim() || !newStage" class="btn btn-primary !py-1.5 !text-xs" @click="create">
            Crear y vincular
          </button>
        </div>
      </div>
    </template>

    <p v-if="error" class="text-xs text-red-600">{{ error }}</p>
  </div>
</template>
