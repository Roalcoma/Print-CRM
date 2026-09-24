<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import {
  Zap, MessageCircle, Tag, Briefcase, Bell, Clock, Play, Pause,
  ToggleLeft, ToggleRight, Settings2, Activity, MessageSquare,
  Timer, Search, CheckCircle2, ChevronDown, CalendarCheck, Instagram,
} from 'lucide-vue-next';
import { api } from '../api';
import LoadingState from '../components/LoadingState.vue';
import { useAuthStore } from '../stores/auth';

interface AutoStep {
  id: string;
  type: string;
  message?: string;
  title?: string;
  body?: string;
  source?: string;
  [k: string]: unknown;
}

interface AutoConfig {
  trigger?: { type: string; tag?: string };
  steps?: AutoStep[];
  [k: string]: unknown;
}

interface AutomationRule {
  id: string;
  trigger_type: string;
  name: string;
  description: string;
  enabled: boolean;
  run_count: number;
  last_run_at: string | null;
  config: AutoConfig;
  created_at: string;
}

const auth = useAuthStore();
const rules = ref<AutomationRule[]>([]);
const loading = ref(true);
const toggling = ref<string | null>(null);
const selectedId = ref<string | null>(null);
const showDetail = ref(false);
const expandedSteps = ref<Set<string>>(new Set());

const selectedRule = computed(() => rules.value.find(r => r.id === selectedId.value) ?? null);

onMounted(async () => {
  try {
    rules.value = await api.get<AutomationRule[]>('/automations');
    if (rules.value.length) selectedId.value = rules.value[0].id;
  } finally {
    loading.value = false;
  }
});

function selectRule(id: string) {
  selectedId.value = id;
  showDetail.value = true;
  expandedSteps.value = new Set();
}

function toggleExpand(stepId: string) {
  if (expandedSteps.value.has(stepId)) expandedSteps.value.delete(stepId);
  else expandedSteps.value.add(stepId);
}

async function toggleRule(rule: AutomationRule) {
  if (!auth.isAdmin) return;
  toggling.value = rule.id;
  try {
    const updated = await api.patch<AutomationRule>(`/automations/${rule.id}`, { enabled: !rule.enabled });
    const idx = rules.value.findIndex(r => r.id === rule.id);
    if (idx !== -1) rules.value[idx] = updated;
  } finally {
    toggling.value = null;
  }
}

// ── Trigger metadata ──────────────────────────────────────────────────────────
const TRIGGER_META: Record<string, { label: string; icon: typeof MessageCircle; color: string; bg: string }> = {
  whatsapp_new_message: { label: 'Mensaje nuevo de WhatsApp',   icon: MessageCircle,  color: 'text-emerald-600', bg: 'bg-emerald-50' },
  tag_added:            { label: 'Etiqueta añadida al contacto',icon: Tag,            color: 'text-violet-600',  bg: 'bg-violet-50'  },
  contact_created:      { label: 'Contacto creado',             icon: Zap,            color: 'text-blue-600',    bg: 'bg-blue-50'    },
  appointment_booked:   { label: 'Cita agendada',               icon: CalendarCheck,  color: 'text-sky-600',     bg: 'bg-sky-50'     },
  ig_comment_received:  { label: 'Comentario en Instagram',     icon: Instagram,      color: 'text-pink-600',    bg: 'bg-pink-50'    },
};

// ── Step metadata ─────────────────────────────────────────────────────────────
const STEP_META: Record<string, { label: string; icon: typeof MessageCircle; color: string; bg: string }> = {
  detect_us_state:          { label: 'Detectar estado (EE.UU.)',      icon: Search,        color: 'text-blue-600',    bg: 'bg-blue-50'    },
  create_opportunity:       { label: 'Crear oportunidad',             icon: Briefcase,     color: 'text-amber-600',   bg: 'bg-amber-50'   },
  send_notification:        { label: 'Notificación interna al equipo',icon: Bell,          color: 'text-purple-600',  bg: 'bg-purple-50'  },
  send_whatsapp:            { label: 'Enviar mensaje de WhatsApp',    icon: MessageSquare, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  wait_for_reply:           { label: 'Esperar respuesta del contacto',icon: Timer,         color: 'text-orange-600',  bg: 'bg-orange-50'  },
  wait_before_appointment:  { label: 'Esperar antes de la cita',      icon: Clock,         color: 'text-sky-600',     bg: 'bg-sky-50'     },
  ig_reply_comment:         { label: 'Responder comentario de IG',    icon: Instagram,     color: 'text-pink-600',    bg: 'bg-pink-50'    },
  ig_send_dm:               { label: 'Enviar DM de Instagram',        icon: MessageSquare, color: 'text-pink-600',    bg: 'bg-pink-50'    },
};

function stepMeta(type: string) {
  return STEP_META[type] ?? { label: type, icon: CheckCircle2, color: 'text-slate-500', bg: 'bg-slate-100' };
}

function stepPreview(step: AutoStep): string | null {
  if (step.type === 'send_whatsapp' && step.message) return String(step.message).slice(0, 120);
  if (step.type === 'send_notification' && step.title) return String(step.title);
  if (step.type === 'detect_us_state') return 'Extrae el código de área del teléfono → mapea al estado de EE.UU.';
  if (step.type === 'create_opportunity') return `Título: ${step.title ?? '{{contact.name}}'} · Fuente: ${step.source ?? '{{step.1.state}}'}`;
  if (step.type === 'ig_reply_comment') {
    const msgs: string[] = (step.messages as string[] | undefined) ?? [];
    return msgs.length ? `${msgs.length} mensajes rotativos · "${msgs[0].slice(0,60)}…"` : (step.message as string | undefined) ?? '';
  }
  if (step.type === 'ig_send_dm') return String(step.message ?? '').slice(0, 120);
  if (step.type === 'wait_before_appointment') {
    const min = (step as any).minutes_before ?? 120;
    const h = Math.floor(min / 60);
    const m = min % 60;
    const label = h > 0 ? `${h}h${m > 0 ? ` ${m}min` : ''}` : `${m} min`;
    return `Pausa la ejecución hasta ${label} antes del inicio de la cita`;
  }
  return null;
}

function triggerSubtitle(rule: AutomationRule): string {
  const tag = rule.config?.trigger?.tag;
  if (tag) return `Cuando se añade la etiqueta "${tag}"`;
  if (rule.trigger_type === 'whatsapp_new_message') return 'Primer mensaje de WhatsApp de un número nuevo';
  if (rule.trigger_type === 'appointment_booked') return 'Cuando alguien agenda una cita en el calendario';
  if (rule.trigger_type === 'ig_comment_received') return 'Cuando alguien comenta en un post de Instagram';
  return rule.trigger_type;
}

function formatDate(d: string | null) {
  if (!d) return 'Nunca';
  return new Date(d).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function sidebarIcon(rule: AutomationRule) {
  return TRIGGER_META[rule.trigger_type]?.icon ?? Zap;
}
function sidebarColor(rule: AutomationRule) {
  return rule.enabled ? (TRIGGER_META[rule.trigger_type]?.color ?? 'text-slate-500') : 'text-slate-400';
}
function sidebarBg(rule: AutomationRule) {
  return rule.enabled ? (TRIGGER_META[rule.trigger_type]?.bg ?? 'bg-slate-100') : 'bg-slate-100';
}
</script>

<template>
  <LoadingState v-if="loading" label="Cargando automatizaciones…" />
  <div v-else class="flex h-full flex-col overflow-hidden">

    <!-- Cabecera -->
    <div class="flex flex-shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 py-3.5">
      <div>
        <h3 class="text-[15px] font-semibold text-slate-900">Automatizaciones</h3>
        <p class="text-[12px] text-slate-400">Flujos que se ejecutan automáticamente en tu CRM</p>
      </div>
      <span class="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-600">
        <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500"></span>
        {{ rules.filter(r => r.enabled).length }} activas
      </span>
    </div>

    <!-- Cuerpo: lista + detalle -->
    <div class="flex flex-1 overflow-hidden">

      <!-- Lista lateral -->
      <aside
        class="flex flex-col overflow-y-auto border-r border-slate-200 bg-white"
        :class="showDetail ? 'hidden md:flex md:w-72 md:flex-shrink-0' : 'flex w-full md:w-72 md:flex-shrink-0'"
      >
        <div class="p-3">
          <p class="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Flujos configurados</p>

          <button
            v-for="rule in rules"
            :key="rule.id"
            class="w-full rounded-lg p-3 text-left transition-colors"
            :class="selectedId === rule.id ? 'bg-primary/5 ring-1 ring-primary/20' : 'hover:bg-slate-50'"
            @click="selectRule(rule.id)"
          >
            <div class="flex items-start gap-3">
              <div class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg" :class="sidebarBg(rule)">
                <component :is="sidebarIcon(rule)" class="h-4 w-4" :class="sidebarColor(rule)" />
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center justify-between gap-1">
                  <p class="truncate text-[13px] font-semibold text-slate-900">{{ rule.name }}</p>
                  <span class="flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold"
                    :class="rule.enabled ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'">
                    {{ rule.enabled ? 'Activo' : 'Inactivo' }}
                  </span>
                </div>
                <p class="mt-0.5 truncate text-[11px] text-slate-400">{{ TRIGGER_META[rule.trigger_type]?.label ?? rule.trigger_type }}</p>
                <p class="mt-1 text-[11px] text-slate-400">{{ rule.run_count }} ejecuciones</p>
              </div>
            </div>
          </button>

          <div v-if="!rules.length" class="py-10 text-center">
            <Zap class="mx-auto mb-2 h-8 w-8 text-slate-200" />
            <p class="text-sm text-slate-400">No hay automatizaciones configuradas</p>
          </div>
        </div>
      </aside>

      <!-- Panel detalle -->
      <div
        class="flex flex-col overflow-y-auto bg-slate-50"
        :class="showDetail ? 'flex flex-1' : 'hidden md:flex md:flex-1'"
      >
        <button v-if="showDetail" class="flex items-center gap-1 px-4 py-2.5 text-sm font-medium text-slate-500 hover:text-slate-800 md:hidden" @click="showDetail = false">
          <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
          Volver
        </button>

        <div v-if="!selectedRule" class="flex flex-1 flex-col items-center justify-center py-20">
          <Zap class="mb-3 h-12 w-12 text-slate-200" />
          <p class="text-sm text-slate-400">Selecciona una automatización para ver sus detalles</p>
        </div>

        <template v-else>
          <!-- Header -->
          <div class="border-b border-slate-200 bg-white px-6 py-5">
            <div class="flex items-start justify-between gap-4">
              <div class="flex items-start gap-4">
                <div class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl"
                  :class="selectedRule.enabled ? (TRIGGER_META[selectedRule.trigger_type]?.bg ?? 'bg-slate-100') : 'bg-slate-100'">
                  <component :is="TRIGGER_META[selectedRule.trigger_type]?.icon ?? Zap" class="h-6 w-6"
                    :class="selectedRule.enabled ? (TRIGGER_META[selectedRule.trigger_type]?.color ?? 'text-slate-500') : 'text-slate-400'" />
                </div>
                <div>
                  <h2 class="text-[16px] font-bold text-slate-900">{{ selectedRule.name }}</h2>
                  <p class="mt-0.5 text-[13px] text-slate-500">{{ selectedRule.description }}</p>
                </div>
              </div>

              <button v-if="auth.isAdmin"
                class="flex flex-shrink-0 cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition-all"
                :class="selectedRule.enabled ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'"
                :disabled="toggling === selectedRule.id"
                @click="toggleRule(selectedRule)">
                <component :is="selectedRule.enabled ? ToggleRight : ToggleLeft" class="h-5 w-5"
                  :class="selectedRule.enabled ? 'text-emerald-600' : 'text-slate-400'" />
                {{ selectedRule.enabled ? 'Activa' : 'Inactiva' }}
              </button>
            </div>
          </div>

          <div class="flex-1 space-y-4 p-6">

            <!-- Stats -->
            <div class="grid grid-cols-3 gap-4">
              <div class="rounded-xl border border-slate-200 bg-white p-4">
                <div class="flex items-center gap-2 text-slate-400">
                  <Activity class="h-4 w-4" />
                  <span class="text-[10px] font-semibold uppercase tracking-wider">Ejecuciones</span>
                </div>
                <p class="mt-2 text-2xl font-bold text-slate-900">{{ selectedRule.run_count }}</p>
                <p class="text-[11px] text-slate-400">desde que se activó</p>
              </div>
              <div class="rounded-xl border border-slate-200 bg-white p-4">
                <div class="flex items-center gap-2 text-slate-400">
                  <Clock class="h-4 w-4" />
                  <span class="text-[10px] font-semibold uppercase tracking-wider">Última ejecución</span>
                </div>
                <p class="mt-2 text-sm font-semibold text-slate-900">{{ formatDate(selectedRule.last_run_at) }}</p>
                <p class="text-[11px] text-slate-400">fecha y hora</p>
              </div>
              <div class="rounded-xl border border-slate-200 bg-white p-4">
                <div class="flex items-center gap-2" :class="selectedRule.enabled ? 'text-emerald-500' : 'text-slate-400'">
                  <component :is="selectedRule.enabled ? Play : Pause" class="h-4 w-4" />
                  <span class="text-[10px] font-semibold uppercase tracking-wider">Estado</span>
                </div>
                <p class="mt-2 text-sm font-bold" :class="selectedRule.enabled ? 'text-emerald-600' : 'text-slate-400'">
                  {{ selectedRule.enabled ? 'Activa' : 'Detenida' }}
                </p>
                <p class="text-[11px] text-slate-400">estado actual</p>
              </div>
            </div>

            <!-- Flujo -->
            <div class="rounded-xl border border-slate-200 bg-white p-5">
              <h3 class="mb-5 flex items-center gap-2 text-[13px] font-semibold text-slate-700">
                <Settings2 class="h-4 w-4 text-slate-400" />
                Flujo de ejecución
              </h3>

              <!-- Disparador -->
              <div class="flex items-center gap-3 rounded-xl border border-slate-200 p-4">
                <div class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg"
                  :class="TRIGGER_META[selectedRule.trigger_type]?.bg ?? 'bg-slate-100'">
                  <component :is="TRIGGER_META[selectedRule.trigger_type]?.icon ?? Zap" class="h-5 w-5"
                    :class="TRIGGER_META[selectedRule.trigger_type]?.color ?? 'text-slate-500'" />
                </div>
                <div>
                  <p class="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Disparador</p>
                  <p class="text-sm font-semibold text-slate-900">{{ TRIGGER_META[selectedRule.trigger_type]?.label ?? selectedRule.trigger_type }}</p>
                  <p class="text-[11px] text-slate-500">{{ triggerSubtitle(selectedRule) }}</p>
                </div>
              </div>

              <!-- Pasos -->
              <template v-if="selectedRule.config?.steps?.length">
                <div v-for="(step, idx) in selectedRule.config.steps" :key="step.id" class="relative">
                  <!-- Línea conectora -->
                  <div class="ml-5 flex items-center gap-2 py-1.5">
                    <div class="h-5 w-0.5 bg-slate-200"></div>
                    <span v-if="step.type === 'wait_for_reply'" class="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-semibold text-orange-500">espera respuesta</span>
                    <span v-else class="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-400">luego</span>
                  </div>

                  <!-- Paso -->
                  <button class="w-full rounded-xl border border-slate-200 text-left transition-colors hover:border-slate-300 hover:bg-slate-50"
                    :class="expandedSteps.has(step.id) ? 'bg-slate-50' : 'bg-white'"
                    @click="toggleExpand(step.id)">
                    <div class="flex items-center gap-3 p-3.5">
                      <div class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
                        :class="stepMeta(step.type).bg">
                        <component :is="stepMeta(step.type).icon" class="h-4 w-4" :class="stepMeta(step.type).color" />
                      </div>
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2">
                          <span class="text-[10px] font-semibold text-slate-400">Paso {{ idx + 1 }}</span>
                        </div>
                        <p class="text-[13px] font-medium text-slate-800">{{ stepMeta(step.type).label }}</p>
                      </div>
                      <ChevronDown class="h-4 w-4 flex-shrink-0 text-slate-400 transition-transform duration-150"
                        :class="expandedSteps.has(step.id) ? 'rotate-180' : ''" />
                    </div>

                    <!-- Preview expandible -->
                    <div v-if="expandedSteps.has(step.id) && stepPreview(step)" class="border-t border-slate-100 px-4 pb-3.5 pt-3">
                      <p class="whitespace-pre-wrap text-[12px] leading-relaxed text-slate-600">{{ stepPreview(step) }}</p>
                    </div>
                  </button>
                </div>
              </template>

              <!-- Fallback para config vieja (sin steps array) -->
              <template v-else>
                <div class="ml-5 flex items-center gap-2 py-1.5">
                  <div class="h-5 w-0.5 bg-slate-200"></div>
                  <span class="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-400">luego</span>
                </div>
                <div v-for="(val, key) in selectedRule.config" :key="key">
                  <div v-if="val && key !== 'trigger'" class="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5">
                    <div class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100">
                      <CheckCircle2 class="h-4 w-4 text-slate-500" />
                    </div>
                    <p class="text-[13px] text-slate-700">{{ key }}</p>
                  </div>
                </div>
              </template>
            </div>

          </div>
        </template>
      </div>
    </div>
  </div>
</template>
