<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  ArrowLeft, Save, Zap, MessageCircle, Tag, Briefcase, Bell, Clock,
  MessageSquare, Timer, Instagram, Search, Plus, Trash2, X,
  ChevronUp, ChevronDown, CalendarCheck, ToggleLeft, ToggleRight,
} from 'lucide-vue-next';
import { api } from '../api';
import LoadingState from '../components/LoadingState.vue';

// ── Types ────────────────────────────────────────────────────────────────────

interface Step {
  id: string;
  type: string;
  message?: string;
  to_phone?: string;
  notification_title?: string;
  notification_body?: string;
  title?: string;
  source?: string;
  pipeline_id?: string;
  stage_id?: string;
  minutes?: number;
  minutes_before?: number;
  messages?: string[];
  [k: string]: unknown;
}

interface Pipeline {
  id: string;
  name: string;
  stages: { id: string; name: string; color: string }[];
}

// ── Metadata ─────────────────────────────────────────────────────────────────

const TRIGGER_META = {
  tag_added:            { label: 'Etiqueta añadida',          icon: Tag,           color: 'text-violet-600',  bg: 'bg-violet-50'  },
  whatsapp_new_message: { label: 'Nuevo mensaje de WhatsApp', icon: MessageCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  contact_created:      { label: 'Contacto creado',           icon: Zap,           color: 'text-blue-600',    bg: 'bg-blue-50'    },
  appointment_booked:   { label: 'Cita agendada',             icon: CalendarCheck, color: 'text-sky-600',     bg: 'bg-sky-50'     },
  ig_comment_received:  { label: 'Comentario en Instagram',   icon: Instagram,     color: 'text-pink-600',    bg: 'bg-pink-50'    },
} as const;

const STEP_META = {
  send_whatsapp:           { label: 'Enviar WhatsApp',          icon: MessageSquare, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  send_notification:       { label: 'Notificación interna',     icon: Bell,          color: 'text-purple-600',  bg: 'bg-purple-50'  },
  create_opportunity:      { label: 'Crear oportunidad',        icon: Briefcase,     color: 'text-amber-600',   bg: 'bg-amber-50'   },
  wait_minutes:            { label: 'Esperar N minutos',        icon: Clock,         color: 'text-slate-500',   bg: 'bg-slate-100'  },
  wait_for_reply:          { label: 'Esperar respuesta',        icon: Timer,         color: 'text-orange-600',  bg: 'bg-orange-50'  },
  wait_before_appointment: { label: 'Esperar antes de cita',    icon: CalendarCheck, color: 'text-sky-600',     bg: 'bg-sky-50'     },
  detect_us_state:         { label: 'Detectar estado EE.UU.',   icon: Search,        color: 'text-blue-600',    bg: 'bg-blue-50'    },
  ig_reply_comment:        { label: 'Responder comentario IG',  icon: Instagram,     color: 'text-pink-600',    bg: 'bg-pink-50'    },
  ig_send_dm:              { label: 'DM de Instagram',          icon: MessageSquare, color: 'text-pink-600',    bg: 'bg-pink-50'    },
} as const;

type TriggerType = keyof typeof TRIGGER_META;
type StepType = keyof typeof STEP_META;

const CONTACT_VARS = [
  { label: 'Nombre completo', value: '{{contact.name}}' },
  { label: 'Nombre',          value: '{{contact.first_name}}' },
  { label: 'Apellido',        value: '{{contact.last_name}}' },
  { label: 'Email',           value: '{{contact.email}}' },
  { label: 'Teléfono',        value: '{{contact.phone}}' },
];

const APPOINTMENT_VARS = [
  { label: 'Fecha de cita',    value: '{{appointment.start_date}}' },
  { label: 'Hora de cita',     value: '{{appointment.start_time}}' },
  { label: 'Enlace reunión',   value: '{{appointment.meeting_url}}' },
  { label: 'Reagendar',        value: '{{appointment.reschedule_link}}' },
];

// ── State ─────────────────────────────────────────────────────────────────────

const route = useRoute();
const router = useRouter();

const isEdit = computed(() => !!route.params.id);
const ruleId = computed(() => route.params.id as string | undefined);

const ruleName = ref('Nueva automatización');
const description = ref('');
const triggerType = ref<TriggerType>('tag_added');
const triggerConfig = ref<Record<string, string>>({});
// Resto de la config de la regla (fuera de trigger/steps): se conserva al guardar.
// Para "comentario de Instagram": intent_filter (bool) y exclude_usernames (string[]).
const extraConfig = ref<Record<string, unknown>>({});
const intentFilter = computed({
  get: () => extraConfig.value.intent_filter !== false,
  set: (v: boolean) => { extraConfig.value.intent_filter = v; },
});
const excludeUsernames = computed(() => (extraConfig.value.exclude_usernames as string[] | undefined) ?? []);
const excludeInput = ref('');
function addExcluded() {
  const u = excludeInput.value.trim().replace(/^@+/, '').toLowerCase();
  excludeInput.value = '';
  if (u && !excludeUsernames.value.includes(u)) extraConfig.value.exclude_usernames = [...excludeUsernames.value, u];
}
function removeExcluded(i: number) {
  extraConfig.value.exclude_usernames = excludeUsernames.value.filter((_, j) => j !== i);
}
const steps = ref<Step[]>([]);
const enabled = ref(true);
const saving = ref(false);
const loading = ref(false);
const errorMsg = ref('');
const pipelines = ref<Pipeline[]>([]);

// Selected node: 'trigger' | step.id | null
const selectedNode = ref<string | null>('trigger');
const showStepPicker = ref(false);
const insertAfterIdx = ref(-1);

const selectedStep = computed((): Step | null => {
  if (!selectedNode.value || selectedNode.value === 'trigger') return null;
  return steps.value.find(s => s.id === selectedNode.value) ?? null;
});

const selectedStages = computed(() => {
  if (!selectedStep.value?.pipeline_id) return [];
  return pipelines.value.find(p => p.id === selectedStep.value!.pipeline_id)?.stages ?? [];
});

function triggerMeta(type: string) {
  return (TRIGGER_META as Record<string, typeof TRIGGER_META[TriggerType]>)[type]
    ?? { label: type, icon: Zap, color: 'text-slate-500', bg: 'bg-slate-100' };
}
function stepMeta(type: string) {
  return (STEP_META as Record<string, typeof STEP_META[StepType]>)[type]
    ?? { label: type, icon: Zap, color: 'text-slate-500', bg: 'bg-slate-100' };
}

// ── Lifecycle ──────────────────────────────────────────────────────────────────

onMounted(async () => {
  try { pipelines.value = await api.get<Pipeline[]>('/pipelines'); } catch {}

  if (isEdit.value && ruleId.value) {
    loading.value = true;
    try {
      const rule = await api.get<any>(`/automations/${ruleId.value}`);
      ruleName.value    = rule.name ?? '';
      description.value = rule.description ?? '';
      triggerType.value = (rule.trigger_type as TriggerType) ?? 'tag_added';
      triggerConfig.value = rule.config?.trigger ?? {};
      const { trigger: _t, steps: _s, ...rest } = rule.config ?? {};
      extraConfig.value = rest;
      steps.value = Array.isArray(rule.config?.steps) ? rule.config.steps : [];
      enabled.value = rule.enabled ?? true;
    } catch {
      errorMsg.value = 'No se pudo cargar la automatización.';
    } finally {
      loading.value = false;
    }
  }
});

// ── Actions ────────────────────────────────────────────────────────────────────

function selectNode(id: string) {
  selectedNode.value = id;
  showStepPicker.value = false;
}

function openStepPicker(afterIdx: number) {
  insertAfterIdx.value = afterIdx;
  showStepPicker.value = true;
  selectedNode.value = null;
}

function addStep(type: StepType) {
  const step: Step = { id: crypto.randomUUID(), type };
  if (type === 'wait_minutes') step.minutes = 30;
  if (type === 'wait_before_appointment') step.minutes_before = 120;
  if (type === 'ig_reply_comment') step.messages = [''];
  if (type === 'create_opportunity') step.title = '{{contact.name}}';

  const pos = insertAfterIdx.value;
  if (pos < 0 || pos >= steps.value.length) steps.value.push(step);
  else steps.value.splice(pos + 1, 0, step);

  showStepPicker.value = false;
  selectedNode.value = step.id;
}

function deleteStep(id: string) {
  steps.value = steps.value.filter(s => s.id !== id);
  if (selectedNode.value === id) selectedNode.value = null;
}

function moveStep(id: string, dir: -1 | 1) {
  const i = steps.value.findIndex(s => s.id === id);
  if (i < 0) return;
  const j = i + dir;
  if (j < 0 || j >= steps.value.length) return;
  const arr = [...steps.value];
  [arr[i], arr[j]] = [arr[j], arr[i]];
  steps.value = arr;
}

function changeStepType(step: Step, newType: string) {
  const idx = steps.value.findIndex(s => s.id === step.id);
  if (idx < 0) return;
  const fresh: Step = { id: step.id, type: newType };
  if (newType === 'wait_minutes') fresh.minutes = 30;
  if (newType === 'wait_before_appointment') fresh.minutes_before = 120;
  if (newType === 'ig_reply_comment') fresh.messages = [''];
  if (newType === 'create_opportunity') fresh.title = '{{contact.name}}';
  steps.value[idx] = fresh;
  // keep selectedNode pointing to same id
}

function changeTriggerType(type: TriggerType) {
  triggerType.value = type;
  triggerConfig.value = {};
}

function appendVar(step: Step, field: string, variable: string) {
  step[field] = ((step[field] as string) ?? '') + variable;
}

function addIgMessage(step: Step) {
  step.messages = [...(step.messages ?? []), ''];
}
function removeIgMessage(step: Step, idx: number) {
  step.messages = step.messages?.filter((_, i) => i !== idx);
}

async function save() {
  if (!ruleName.value.trim()) return;
  saving.value = true;
  errorMsg.value = '';
  try {
    const config = {
      ...extraConfig.value,
      trigger: triggerConfig.value,
      steps: steps.value,
    };
    const body = {
      name: ruleName.value.trim(),
      description: description.value.trim() || null,
      trigger_type: triggerType.value,
      config,
      enabled: enabled.value,
    };
    if (isEdit.value && ruleId.value) await api.put(`/automations/${ruleId.value}`, body);
    else await api.post('/automations', body);
    router.push('/automations');
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : 'Error al guardar';
  } finally {
    saving.value = false;
  }
}

function stepPreview(step: Step): string {
  if (step.type === 'send_whatsapp') return step.message ? String(step.message).slice(0, 65) : 'Sin mensaje configurado';
  if (step.type === 'send_notification') return step.notification_title ? String(step.notification_title).slice(0, 65) : 'Sin título';
  if (step.type === 'create_opportunity') return `Título: ${step.title ?? '{{contact.name}}'}`;
  if (step.type === 'wait_minutes') { const m = step.minutes ?? 30; return `${m} minuto${m !== 1 ? 's' : ''}`; }
  if (step.type === 'wait_before_appointment') {
    const m = step.minutes_before ?? 120;
    const h = Math.floor(m / 60); const min = m % 60;
    return (h > 0 ? `${h}h${min > 0 ? ` ${min}min` : ''}` : `${m} min`) + ' antes de la cita';
  }
  if (step.type === 'detect_us_state') return 'Extrae el estado desde el código de área del teléfono';
  if (step.type === 'wait_for_reply') return 'Pausa hasta que el contacto responda por WhatsApp';
  if (step.type === 'ig_reply_comment') { const n = step.messages?.length ?? 0; return `${n} mensaje${n !== 1 ? 's' : ''} rotativo${n !== 1 ? 's' : ''}`; }
  if (step.type === 'ig_send_dm') return step.message ? String(step.message).slice(0, 65) : 'Sin mensaje configurado';
  return '';
}
</script>

<template>
  <LoadingState v-if="loading" label="Cargando automatización…" />
  <div v-else class="flex h-full flex-col overflow-hidden" @click.self="selectedNode = null; showStepPicker = false">

    <!-- ── Top bar ──────────────────────────────────────────────────────────── -->
    <div class="flex flex-shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-5 py-3">
      <button
        class="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
        @click="router.push('/automations')"
      >
        <ArrowLeft class="h-4 w-4" />
        Automatizaciones
      </button>
      <div class="h-4 w-px bg-slate-200" />
      <input
        v-model="ruleName"
        class="flex-1 bg-transparent text-[15px] font-semibold text-slate-900 outline-none placeholder:text-slate-300"
        placeholder="Nombre de la automatización"
      />
      <p v-if="errorMsg" class="text-[12px] text-red-500">{{ errorMsg }}</p>
      <button
        class="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-all"
        :class="enabled ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-500'"
        @click="enabled = !enabled"
      >
        <component :is="enabled ? ToggleRight : ToggleLeft" class="h-4 w-4" :class="enabled ? 'text-emerald-600' : 'text-slate-400'" />
        {{ enabled ? 'Activa' : 'Inactiva' }}
      </button>
      <button
        class="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
        :disabled="saving || !ruleName.trim()"
        @click="save"
      >
        <Save class="h-4 w-4" />
        {{ saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear automatización' }}
      </button>
    </div>

    <!-- ── Body ─────────────────────────────────────────────────────────────── -->
    <div class="relative flex flex-1 overflow-hidden">

      <!-- Canvas -->
      <div
        class="flex-1 overflow-y-auto bg-slate-50 px-8 py-10"
        @click.self="selectedNode = null; showStepPicker = false"
      >
        <div class="mx-auto max-w-md" @click.self="selectedNode = null; showStepPicker = false">

          <!-- Trigger block -->
          <div
            class="relative cursor-pointer rounded-xl border-2 bg-white p-4 shadow-card transition-all"
            :class="selectedNode === 'trigger' ? 'border-primary shadow-elevated' : 'border-slate-200 hover:border-slate-300 hover:shadow-elevated'"
            @click="selectNode('trigger')"
          >
            <div class="flex items-center gap-3">
              <div class="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl" :class="triggerMeta(triggerType).bg">
                <component :is="triggerMeta(triggerType).icon" class="h-5 w-5" :class="triggerMeta(triggerType).color" />
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Disparador</p>
                <p class="text-[13px] font-semibold text-slate-900">{{ triggerMeta(triggerType).label }}</p>
                <p class="truncate text-[11px] text-slate-500">
                  {{ triggerType === 'tag_added' && triggerConfig.tag ? `Etiqueta: "${triggerConfig.tag}"` : 'Haz clic para configurar' }}
                </p>
              </div>
            </div>
            <div v-if="selectedNode === 'trigger'" class="absolute inset-y-0 right-0 w-0.5 rounded-r-xl bg-primary" />
          </div>

          <!-- Steps -->
          <template v-for="(step, idx) in steps" :key="step.id">
            <!-- Connector with insert button -->
            <div class="flex flex-col items-center">
              <div class="h-5 w-px bg-slate-300" />
              <button
                class="flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-400 shadow-sm transition-colors hover:border-primary hover:text-primary"
                @click.stop="openStepPicker(idx - 1)"
              >
                <Plus class="h-3 w-3" />
              </button>
              <div class="h-5 w-px bg-slate-300" />
            </div>

            <!-- Step block -->
            <div
              class="relative cursor-pointer rounded-xl border-2 bg-white p-4 shadow-card transition-all"
              :class="selectedNode === step.id ? 'border-primary shadow-elevated' : 'border-slate-200 hover:border-slate-300 hover:shadow-elevated'"
              @click="selectNode(step.id)"
            >
              <div class="flex items-center gap-3">
                <div class="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl" :class="stepMeta(step.type).bg">
                  <component :is="stepMeta(step.type).icon" class="h-5 w-5" :class="stepMeta(step.type).color" />
                </div>
                <div class="min-w-0 flex-1">
                  <p class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Paso {{ idx + 1 }}</p>
                  <p class="text-[13px] font-semibold text-slate-900">{{ stepMeta(step.type).label }}</p>
                  <p class="truncate text-[11px] text-slate-500">{{ stepPreview(step) }}</p>
                </div>
                <!-- Move + delete controls -->
                <div class="flex items-center gap-0.5 ml-1" @click.stop>
                  <button
                    class="rounded-md p-1 text-slate-300 transition-colors hover:text-slate-600 disabled:opacity-30"
                    :disabled="idx === 0"
                    @click="moveStep(step.id, -1)"
                  ><ChevronUp class="h-3.5 w-3.5" /></button>
                  <button
                    class="rounded-md p-1 text-slate-300 transition-colors hover:text-slate-600 disabled:opacity-30"
                    :disabled="idx === steps.length - 1"
                    @click="moveStep(step.id, 1)"
                  ><ChevronDown class="h-3.5 w-3.5" /></button>
                  <button class="rounded-md p-1 text-slate-300 transition-colors hover:text-red-500" @click="deleteStep(step.id)">
                    <Trash2 class="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div v-if="selectedNode === step.id" class="absolute inset-y-0 right-0 w-0.5 rounded-r-xl bg-primary" />
            </div>
          </template>

          <!-- Bottom connector + Add step button -->
          <div class="flex flex-col items-center">
            <div class="h-5 w-px bg-slate-300" />
            <button
              class="flex items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-3 text-[13px] font-medium text-slate-500 shadow-sm transition-colors hover:border-primary hover:text-primary"
              @click.stop="openStepPicker(steps.length - 1)"
            >
              <Plus class="h-4 w-4" />
              Añadir paso
            </button>
          </div>

        </div>
      </div>

      <!-- Step type picker — overlay flotante centrado en el canvas -->
      <Transition name="picker-fade">
        <div
          v-if="showStepPicker"
          class="absolute inset-0 z-30 flex items-center justify-center bg-black/10"
          @click.self="showStepPicker = false"
        >
          <div class="w-[420px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
            <div class="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <p class="text-[11px] font-bold uppercase tracking-wider text-slate-400">Tipo de paso</p>
              <button class="rounded p-1 text-slate-400 hover:text-slate-700" @click="showStepPicker = false">
                <X class="h-3.5 w-3.5" />
              </button>
            </div>
            <div class="grid grid-cols-2 gap-1 p-2">
              <button
                v-for="(meta, type) in STEP_META"
                :key="type"
                class="flex items-center gap-2.5 rounded-lg p-3 text-left transition-colors hover:bg-slate-50"
                @click="addStep(type as StepType)"
              >
                <div class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg" :class="meta.bg">
                  <component :is="meta.icon" class="h-3.5 w-3.5" :class="meta.color" />
                </div>
                <span class="text-[12px] font-medium text-slate-700">{{ meta.label }}</span>
              </button>
            </div>
          </div>
        </div>
      </Transition>

      <!-- ── Right config panel ─────────────────────────────────────────────── -->
      <Transition name="panel-slide">
        <aside
          v-if="selectedNode !== null"
          class="flex w-[360px] flex-shrink-0 flex-col overflow-hidden border-l border-slate-200 bg-white"
        >

          <!-- ── Trigger config ───────────────────────────────────────────── -->
          <template v-if="selectedNode === 'trigger'">
            <div class="flex flex-shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4">
              <p class="text-[13px] font-bold text-slate-900">Configurar disparador</p>
              <button class="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700" @click="selectedNode = null">
                <X class="h-4 w-4" />
              </button>
            </div>
            <div class="flex-1 space-y-6 overflow-y-auto p-5">

              <!-- Name + description -->
              <div class="space-y-3">
                <div>
                  <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Nombre</label>
                  <input v-model="ruleName" class="input" placeholder="Nombre de la automatización" />
                </div>
                <div>
                  <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Descripción (opcional)</label>
                  <input v-model="description" class="input" placeholder="Describe qué hace este flujo…" />
                </div>
              </div>

              <div class="h-px bg-slate-100" />

              <!-- Trigger type list -->
              <div>
                <p class="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Tipo de disparador</p>
                <div class="space-y-1.5">
                  <button
                    v-for="(meta, type) in TRIGGER_META"
                    :key="type"
                    class="flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all"
                    :class="triggerType === type
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'"
                    @click="changeTriggerType(type as TriggerType)"
                  >
                    <div class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg" :class="meta.bg">
                      <component :is="meta.icon" class="h-4 w-4" :class="meta.color" />
                    </div>
                    <p class="text-[13px] font-medium text-slate-800">{{ meta.label }}</p>
                    <div v-if="triggerType === type" class="ml-auto h-2 w-2 flex-shrink-0 rounded-full bg-primary" />
                  </button>
                </div>
              </div>

              <!-- Tag name field -->
              <div v-if="triggerType === 'tag_added'">
                <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Etiqueta</label>
                <input v-model="triggerConfig.tag" class="input" placeholder="ej: interesado, cliente-nuevo…" />
                <p class="mt-1.5 text-[11px] text-slate-400">Se dispara exactamente cuando esta etiqueta sea añadida a un contacto.</p>
              </div>

              <!-- Filtros del comentario de Instagram -->
              <div v-if="triggerType === 'ig_comment_received'" class="space-y-4">
                <button
                  type="button"
                  class="flex w-full items-start gap-3 rounded-xl border border-slate-200 p-3 text-left transition-colors hover:bg-slate-50"
                  @click="intentFilter = !intentFilter"
                >
                  <component :is="intentFilter ? ToggleRight : ToggleLeft" class="mt-0.5 h-5 w-5 flex-shrink-0" :class="intentFilter ? 'text-emerald-600' : 'text-slate-400'" />
                  <span>
                    <span class="block text-[13px] font-medium text-slate-800">Responder solo a quien pide información</span>
                    <span class="mt-0.5 block text-[11px] text-slate-400">
                      Ignora elogios y emojis sueltos ("qué bonito", "felicidades"). Responde a quien pregunta precio, disponibilidad, citas, cupos… o escribe la palabra clave que pide el post.
                    </span>
                  </span>
                </button>
                <div>
                  <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Cuentas excluidas</label>
                  <div class="flex flex-wrap items-center gap-1.5 rounded-md border border-slate-300 bg-white p-2 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
                    <span v-for="(u, i) in excludeUsernames" :key="u" class="flex items-center gap-1 rounded-sm bg-pink-50 px-2 py-0.5 text-xs font-medium text-pink-700">
                      @{{ u }}
                      <button type="button" class="cursor-pointer hover:text-pink-900" @click="removeExcluded(i)"><X class="h-3 w-3" /></button>
                    </span>
                    <input
                      v-model="excludeInput"
                      class="min-w-[120px] flex-1 border-0 bg-transparent text-sm focus:outline-none"
                      placeholder="@cuenta y Enter…"
                      @keydown.enter.prevent="addExcluded"
                      @keydown.,.prevent="addExcluded"
                      @blur="addExcluded"
                    />
                  </div>
                  <p class="mt-1.5 text-[11px] text-slate-400">A estas cuentas nunca se les responde. Las cuentas conectadas de tu equipo ya se excluyen solas.</p>
                </div>
              </div>

            </div>
          </template>

          <!-- ── Step config ──────────────────────────────────────────────── -->
          <template v-else-if="selectedStep">
            <div class="flex flex-shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4">
              <div class="flex items-center gap-2.5">
                <div class="flex h-7 w-7 items-center justify-center rounded-lg" :class="stepMeta(selectedStep.type).bg">
                  <component :is="stepMeta(selectedStep.type).icon" class="h-3.5 w-3.5" :class="stepMeta(selectedStep.type).color" />
                </div>
                <p class="text-[13px] font-bold text-slate-900">{{ stepMeta(selectedStep.type).label }}</p>
              </div>
              <button class="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700" @click="selectedNode = null">
                <X class="h-4 w-4" />
              </button>
            </div>
            <div class="flex-1 space-y-5 overflow-y-auto p-5">

              <!-- Step type picker (grid 2 col) -->
              <div>
                <p class="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Tipo de acción</p>
                <div class="grid grid-cols-2 gap-1.5">
                  <button
                    v-for="(meta, type) in STEP_META"
                    :key="type"
                    class="flex items-center gap-2 rounded-lg border p-2.5 text-left text-[12px] font-medium transition-all"
                    :class="selectedStep.type === type
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'"
                    @click="changeStepType(selectedStep, type)"
                  >
                    <component :is="meta.icon" class="h-3.5 w-3.5 flex-shrink-0" />
                    {{ meta.label }}
                  </button>
                </div>
              </div>

              <div class="h-px bg-slate-100" />

              <!-- ── send_whatsapp ────────────────────────────────────── -->
              <template v-if="selectedStep.type === 'send_whatsapp'">
                <div>
                  <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Número destino</label>
                  <input v-model="selectedStep.to_phone" class="input" placeholder="Vacío = número del contacto" />
                  <p class="mt-1 text-[11px] text-slate-400">Solo si quieres enviar a un número fijo.</p>
                </div>
                <div>
                  <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Mensaje</label>
                  <textarea v-model="selectedStep.message" rows="6" class="input resize-none font-mono text-[12px]" placeholder="Hola {{contact.first_name}}, …" />
                  <p class="mt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Insertar variable</p>
                  <div class="mt-1.5 flex flex-wrap gap-1.5">
                    <button
                      v-for="v in CONTACT_VARS" :key="v.value"
                      class="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:bg-primary/10 hover:text-primary"
                      @click="appendVar(selectedStep, 'message', v.value)"
                    >{{ v.label }}</button>
                  </div>
                  <div class="mt-1.5 flex flex-wrap gap-1.5">
                    <button
                      v-for="v in APPOINTMENT_VARS" :key="v.value"
                      class="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-700 transition-colors hover:bg-sky-100"
                      @click="appendVar(selectedStep, 'message', v.value)"
                    >{{ v.label }}</button>
                  </div>
                </div>
              </template>

              <!-- ── send_notification ───────────────────────────────── -->
              <template v-if="selectedStep.type === 'send_notification'">
                <div>
                  <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Título</label>
                  <input v-model="selectedStep.notification_title" class="input" placeholder="Nueva respuesta de {{contact.name}}" />
                  <div class="mt-1.5 flex flex-wrap gap-1.5">
                    <button
                      v-for="v in CONTACT_VARS" :key="v.value"
                      class="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-primary/10 hover:text-primary"
                      @click="appendVar(selectedStep, 'notification_title', v.value)"
                    >{{ v.label }}</button>
                  </div>
                </div>
                <div>
                  <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Mensaje</label>
                  <textarea v-model="selectedStep.notification_body" rows="4" class="input resize-none" placeholder="El contacto respondió…" />
                  <div class="mt-1.5 flex flex-wrap gap-1.5">
                    <button
                      v-for="v in CONTACT_VARS" :key="v.value"
                      class="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-primary/10 hover:text-primary"
                      @click="appendVar(selectedStep, 'notification_body', v.value)"
                    >{{ v.label }}</button>
                  </div>
                </div>
              </template>

              <!-- ── create_opportunity ─────────────────────────────── -->
              <template v-if="selectedStep.type === 'create_opportunity'">
                <div>
                  <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Título</label>
                  <input v-model="selectedStep.title" class="input" placeholder="{{contact.name}}" />
                  <div class="mt-1.5 flex flex-wrap gap-1.5">
                    <button
                      v-for="v in CONTACT_VARS" :key="v.value"
                      class="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-primary/10 hover:text-primary"
                      @click="appendVar(selectedStep, 'title', v.value)"
                    >{{ v.label }}</button>
                  </div>
                </div>
                <div>
                  <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Fuente (opcional)</label>
                  <input v-model="selectedStep.source" class="input" placeholder="whatsapp, ig-comment…" />
                </div>
                <div>
                  <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Pipeline (opcional)</label>
                  <div class="space-y-1">
                    <button
                      class="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-[13px] transition-colors hover:bg-slate-50"
                      :class="!selectedStep.pipeline_id ? 'border-primary bg-primary/5 text-primary font-medium' : 'text-slate-500'"
                      @click="selectedStep.pipeline_id = undefined; selectedStep.stage_id = undefined"
                    >Por defecto (primero disponible)</button>
                    <button
                      v-for="p in pipelines" :key="p.id"
                      class="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-[13px] transition-colors hover:bg-slate-50"
                      :class="selectedStep.pipeline_id === p.id ? 'border-primary bg-primary/5 text-primary font-medium' : 'text-slate-700'"
                      @click="selectedStep.pipeline_id = p.id; selectedStep.stage_id = undefined"
                    >{{ p.name }}</button>
                  </div>
                </div>
                <div v-if="selectedStep.pipeline_id && selectedStages.length">
                  <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Etapa (opcional)</label>
                  <div class="space-y-1">
                    <button
                      class="flex w-full items-center rounded-lg border border-slate-200 px-3 py-2 text-[13px] transition-colors hover:bg-slate-50"
                      :class="!selectedStep.stage_id ? 'border-primary bg-primary/5 text-primary font-medium' : 'text-slate-500'"
                      @click="selectedStep.stage_id = undefined"
                    >Primera etapa del pipeline</button>
                    <button
                      v-for="s in selectedStages" :key="s.id"
                      class="flex w-full items-center rounded-lg border border-slate-200 px-3 py-2 text-[13px] transition-colors hover:bg-slate-50"
                      :class="selectedStep.stage_id === s.id ? 'border-primary bg-primary/5 text-primary font-medium' : 'text-slate-700'"
                      @click="selectedStep.stage_id = s.id"
                    >{{ s.name }}</button>
                  </div>
                </div>
              </template>

              <!-- ── wait_minutes ────────────────────────────────────── -->
              <template v-if="selectedStep.type === 'wait_minutes'">
                <div>
                  <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Minutos a esperar</label>
                  <input v-model.number="selectedStep.minutes" type="number" min="1" class="input" placeholder="30" />
                  <p class="mt-1.5 text-[11px] text-slate-400">El flujo se pausa exactamente este tiempo antes de continuar con el siguiente paso.</p>
                </div>
              </template>

              <!-- ── wait_for_reply ──────────────────────────────────── -->
              <template v-if="selectedStep.type === 'wait_for_reply'">
                <div class="rounded-xl bg-orange-50 p-4">
                  <p class="text-[13px] font-semibold text-orange-700">Sin configuración adicional</p>
                  <p class="mt-1 text-[12px] leading-relaxed text-orange-600">El flujo se pausa indefinidamente hasta que el contacto responda un mensaje de WhatsApp. Al responder, continúa con el siguiente paso.</p>
                </div>
              </template>

              <!-- ── wait_before_appointment ─────────────────────────── -->
              <template v-if="selectedStep.type === 'wait_before_appointment'">
                <div>
                  <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Minutos antes de la cita</label>
                  <input v-model.number="selectedStep.minutes_before" type="number" min="1" class="input" placeholder="120" />
                  <p class="mt-1.5 text-[11px] text-slate-400">El flujo espera hasta este tiempo antes del inicio de la cita. Ej: 120 = 2 horas antes.</p>
                </div>
              </template>

              <!-- ── detect_us_state ─────────────────────────────────── -->
              <template v-if="selectedStep.type === 'detect_us_state'">
                <div class="rounded-xl bg-blue-50 p-4">
                  <p class="text-[13px] font-semibold text-blue-700">Sin configuración adicional</p>
                  <p class="mt-1 text-[12px] leading-relaxed text-blue-600">
                    Extrae el código de área del teléfono del contacto y detecta el estado de EE.UU.<br/><br/>
                    El resultado queda disponible en pasos siguientes como:<br/>
                    <code class="mt-1 block rounded bg-blue-100 px-2 py-1 font-mono text-[11px]" v-text="'{{step.' + selectedStep.id + '.state}}'"></code>
                  </p>
                </div>
              </template>

              <!-- ── ig_reply_comment ────────────────────────────────── -->
              <template v-if="selectedStep.type === 'ig_reply_comment'">
                <div>
                  <div class="mb-2 flex items-center justify-between">
                    <label class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Mensajes rotativos</label>
                    <button class="text-[11px] font-semibold text-primary hover:text-primary-dark" @click="addIgMessage(selectedStep)">+ Añadir</button>
                  </div>
                  <p class="mb-3 text-[11px] text-slate-400">Se elige uno al azar en cada envío para parecer más natural.</p>
                  <div class="space-y-2.5">
                    <div v-for="(_, msgIdx) in selectedStep.messages" :key="msgIdx" class="flex gap-2">
                      <textarea
                        v-model="selectedStep.messages![msgIdx]"
                        rows="3"
                        class="input flex-1 resize-none text-[12px]"
                        :placeholder="`Mensaje ${msgIdx + 1}…`"
                      />
                      <button class="mt-1 flex-shrink-0 text-slate-300 transition-colors hover:text-red-500" @click="removeIgMessage(selectedStep, msgIdx)">
                        <Trash2 class="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div class="mt-2 flex flex-wrap gap-1.5">
                    <button
                      v-for="v in CONTACT_VARS" :key="v.value"
                      class="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-primary/10 hover:text-primary"
                      @click="selectedStep.messages && selectedStep.messages.length && (selectedStep.messages[selectedStep.messages.length - 1] += v.value)"
                    >{{ v.label }}</button>
                  </div>
                </div>
              </template>

              <!-- ── ig_send_dm ──────────────────────────────────────── -->
              <template v-if="selectedStep.type === 'ig_send_dm'">
                <div>
                  <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Mensaje directo</label>
                  <textarea v-model="selectedStep.message" rows="6" class="input resize-none font-mono text-[12px]" placeholder="Hola {{contact.first_name}}, …" />
                  <div class="mt-1.5 flex flex-wrap gap-1.5">
                    <button
                      v-for="v in CONTACT_VARS" :key="v.value"
                      class="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-primary/10 hover:text-primary"
                      @click="appendVar(selectedStep, 'message', v.value)"
                    >{{ v.label }}</button>
                  </div>
                </div>
              </template>

            </div>
          </template>

        </aside>
      </Transition>

    </div>
  </div>
</template>

<style>
.panel-slide-enter-active,
.panel-slide-leave-active {
  transition: transform 0.18s ease, opacity 0.18s ease;
}
.panel-slide-enter-from,
.panel-slide-leave-to {
  transform: translateX(16px);
  opacity: 0;
}

.picker-fade-enter-active,
.picker-fade-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}
.picker-fade-enter-from,
.picker-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
