<script setup lang="ts">
// Aplicar una plantilla de cuenta a un cliente: elegir sector, rellenar variables,
// revisar la vista previa (lo que se va a crear) y aplicar en un clic.
import { ref, computed, watch, onMounted } from 'vue';
import { X, LayoutTemplate, ArrowLeft, Check, AlertTriangle, CalendarDays, Workflow, Kanban, Tag, ChevronRight, Loader2 } from 'lucide-vue-next';
import { agencyApi } from '../../agencyApi';
import BizSelect from '../../components/BizSelect.vue';

interface TemplateVariable { key: string; label: string; type?: string; required?: boolean; placeholder?: string; help?: string; default?: string }
interface TemplateSummary {
  key: string; name: string; sector: string; description: string; variables: TemplateVariable[];
  counts: { pipelines: number; calendars: number; automations: number };
}
interface PlanStep { id: string; type: string; label: string; message?: string; messages?: string[]; notification_title?: string }
interface Plan {
  pipelines: { key: string; name: string; stages: { name: string; color: string }[] }[];
  calendars: { name: string; url: string; duration_minutes: number; location_type: string; location: string | null; timezone: string;
    availability: { day: string; start_time: string; end_time: string; is_active: boolean }[] }[];
  automations: { name: string; description: string; trigger_type: string; tag: string | null; enabled: boolean; note: string | null; steps: PlanStep[] }[];
  tags: string[];
  warnings: string[];
  appliedAt: string | null;
}

const props = defineProps<{ clientId: string; empresa: string; remitente: string; applied: string[] }>();
const emit = defineEmits<{ close: []; applied: [key: string] }>();

const templates = ref<TemplateSummary[]>([]);
const selected = ref<TemplateSummary | null>(null);
const vars = ref<Record<string, string>>({});
const plan = ref<Plan | null>(null);
const planError = ref('');
const loadingPlan = ref(false);
const applying = ref(false);
const done = ref(false);
const openAuto = ref<number | null>(null);

const TIMEZONES = [
  { value: 'America/Caracas', label: 'Venezuela (Caracas)' },
  { value: 'America/New_York', label: 'EE. UU. Este (Miami, Nueva York)' },
  { value: 'America/Chicago', label: 'EE. UU. Centro (Houston, Chicago)' },
  { value: 'America/Denver', label: 'EE. UU. Montaña (Denver)' },
  { value: 'America/Phoenix', label: 'EE. UU. Arizona' },
  { value: 'America/Los_Angeles', label: 'EE. UU. Pacífico (Los Ángeles)' },
  { value: 'America/Puerto_Rico', label: 'Puerto Rico' },
  { value: 'America/Bogota', label: 'Colombia / Perú / Ecuador' },
  { value: 'America/Mexico_City', label: 'México (CDMX)' },
  { value: 'America/Santo_Domingo', label: 'República Dominicana' },
  { value: 'America/Argentina/Buenos_Aires', label: 'Argentina' },
  { value: 'America/Santiago', label: 'Chile' },
  { value: 'Europe/Madrid', label: 'España' },
];

const TRIGGERS: Record<string, string> = {
  whatsapp_new_message: 'Nuevo chat de WhatsApp',
  appointment_booked: 'Cita agendada',
  appointment_no_show: 'Cita: no asistió',
  tag_added: 'Etiqueta añadida',
  ig_comment_received: 'Comentario en Instagram',
};
const LOCATIONS: Record<string, string> = { google_meet: 'Google Meet', zoom: 'Zoom', phone: 'Llamada telefónica', custom: 'Presencial' };

onMounted(async () => {
  templates.value = await agencyApi.get<TemplateSummary[]>('/templates');
});

function choose(t: TemplateSummary) {
  selected.value = t;
  plan.value = null;
  done.value = false;
  vars.value = Object.fromEntries(t.variables.map(v => [v.key,
    v.key === 'empresa' ? props.empresa : v.key === 'remitente' ? props.remitente : (v.default ?? '')]));
}

// Vista previa en vivo: se recalcula al editar las variables.
let timer: ReturnType<typeof setTimeout> | undefined;
watch(vars, () => {
  clearTimeout(timer);
  timer = setTimeout(loadPlan, 400);
}, { deep: true });

async function loadPlan() {
  if (!selected.value) return;
  loadingPlan.value = true;
  try {
    plan.value = await agencyApi.post<Plan>(`/clients/${props.clientId}/templates/${selected.value.key}/preview`, { variables: vars.value });
    planError.value = '';
  } catch (e) {
    planError.value = e instanceof Error ? e.message : 'No se pudo generar la vista previa';
  } finally {
    loadingPlan.value = false;
  }
}

const canApply = computed(() => plan.value && !planError.value && !plan.value.appliedAt && !loadingPlan.value && !applying.value);

async function apply() {
  if (!selected.value || !canApply.value) return;
  applying.value = true;
  try {
    await agencyApi.post(`/clients/${props.clientId}/templates/${selected.value.key}/apply`, { variables: vars.value });
    done.value = true;
    emit('applied', selected.value.key);
  } catch (e) {
    planError.value = e instanceof Error ? e.message : 'Error al aplicar la plantilla';
  } finally {
    applying.value = false;
  }
}

function stepText(s: PlanStep) {
  return s.message ?? s.notification_title ?? (s.messages ? `${s.messages.length} respuestas que rotan al azar` : '');
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <div class="absolute inset-0 bg-[#13243D]/50 backdrop-blur-sm" @click="emit('close')"></div>
      <div class="relative z-10 flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-md border border-slate-200 bg-white shadow-2xl">
        <!-- Cabecera -->
        <div class="flex items-center gap-3 bg-[#13243D] px-5 py-3 text-white">
          <button v-if="selected && !done" class="rounded-md p-1 text-white/70 hover:bg-white/10 hover:text-white cursor-pointer" title="Volver" @click="selected = null">
            <ArrowLeft class="h-4 w-4" />
          </button>
          <LayoutTemplate v-else class="h-4 w-4 text-[#F69008]" />
          <div class="min-w-0 flex-1">
            <h3 class="text-sm font-semibold">{{ selected ? selected.name : 'Aplicar plantilla de cuenta' }}</h3>
            <p class="truncate text-[11px] text-white/60">{{ selected ? selected.sector : 'Pipelines, calendario y automatizaciones listos en un clic' }}</p>
          </div>
          <button class="rounded-md p-1 text-white/70 hover:bg-white/10 hover:text-white cursor-pointer" @click="emit('close')"><X class="h-4 w-4" /></button>
        </div>

        <!-- Paso 1: elegir plantilla -->
        <div v-if="!selected" class="grid gap-3 overflow-y-auto p-5 sm:grid-cols-2 lg:grid-cols-3">
          <div v-if="!templates.length" class="col-span-full flex justify-center py-10"><Loader2 class="h-5 w-5 animate-spin text-slate-400" /></div>
          <button
            v-for="t in templates" :key="t.key"
            :disabled="applied.includes(t.key)"
            class="group flex flex-col rounded-md border border-slate-200 p-4 text-left transition-colors enabled:cursor-pointer enabled:hover:border-[#F69008] disabled:opacity-55"
            @click="choose(t)"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="text-[10px] font-semibold uppercase tracking-wider text-[#F69008]">{{ t.sector }}</span>
              <span v-if="applied.includes(t.key)" class="flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700"><Check class="h-3 w-3" />Aplicada</span>
            </div>
            <p class="mt-1 text-sm font-semibold text-[#13243D]">{{ t.name }}</p>
            <p class="mt-1 flex-1 text-xs leading-relaxed text-slate-500">{{ t.description }}</p>
            <div class="mt-3 flex items-center gap-3 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
              <span class="flex items-center gap-1"><Kanban class="h-3 w-3" />{{ t.counts.pipelines }} pipeline{{ t.counts.pipelines === 1 ? '' : 's' }}</span>
              <span class="flex items-center gap-1"><CalendarDays class="h-3 w-3" />{{ t.counts.calendars ? `${t.counts.calendars} calendario` : 'sin calendario' }}</span>
              <span class="flex items-center gap-1"><Workflow class="h-3 w-3" />{{ t.counts.automations }} automatizaciones</span>
              <ChevronRight class="ml-auto h-3.5 w-3.5 text-slate-300 group-enabled:group-hover:text-[#F69008]" />
            </div>
          </button>
        </div>

        <!-- Aplicada -->
        <div v-else-if="done" class="p-8 text-center">
          <div class="mx-auto flex h-11 w-11 items-center justify-center rounded-md bg-emerald-50 text-emerald-600"><Check class="h-5 w-5" /></div>
          <p class="mt-3 font-semibold text-[#13243D]">Plantilla aplicada</p>
          <p class="mt-1 text-sm text-slate-500">
            Se crearon {{ plan?.pipelines.length }} pipeline(s), {{ plan?.calendars.length }} calendario(s) y {{ plan?.automations.length }} automatizaciones.
          </p>
          <p v-if="plan?.automations.some(a => !a.enabled)" class="mt-1 text-xs text-slate-400">Las automatizaciones desactivadas se activan desde Automatizaciones dentro del CRM del cliente.</p>
          <button class="mt-5 rounded-md bg-[#F69008] px-5 py-2 text-sm font-semibold text-white hover:bg-[#D97706] cursor-pointer" @click="emit('close')">Listo</button>
        </div>

        <!-- Paso 2: variables + vista previa -->
        <div v-else class="grid min-h-0 flex-1 lg:grid-cols-[320px_1fr]">
          <form class="space-y-3 overflow-y-auto border-b border-slate-200 bg-slate-50 p-5 lg:border-b-0 lg:border-r" @submit.prevent="apply">
            <p class="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Datos del cliente</p>
            <div v-for="v in selected.variables" :key="v.key">
              <label class="mb-1 block text-xs font-medium text-slate-700">{{ v.label }}<span v-if="v.required" class="text-[#F69008]"> *</span></label>
              <BizSelect v-if="v.type === 'timezone'" v-model="vars[v.key]" :options="TIMEZONES" searchable
                input-class="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900" />
              <input v-else v-model="vars[v.key]" :placeholder="v.placeholder" :type="v.type === 'url' ? 'url' : v.type === 'phone' ? 'tel' : 'text'"
                class="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:border-[#F69008] focus:outline-none" />
              <p v-if="v.help" class="mt-0.5 text-[11px] leading-snug text-slate-400">{{ v.help }}</p>
            </div>
            <div v-if="planError" class="rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-600">{{ planError }}</div>
            <div v-if="plan?.appliedAt" class="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-700">
              Esta plantilla ya se aplicó el {{ new Date(plan.appliedAt).toLocaleDateString('es') }}. No se vuelve a crear para no duplicar.
            </div>
            <button type="submit" :disabled="!canApply"
              class="flex w-full items-center justify-center gap-2 rounded-md bg-[#F69008] py-2 text-sm font-semibold text-white hover:bg-[#D97706] disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed">
              <Loader2 v-if="applying" class="h-4 w-4 animate-spin" />
              {{ applying ? 'Aplicando…' : 'Aplicar plantilla' }}
            </button>
            <p class="text-center text-[11px] text-slate-400">Se crea todo o nada. Nada se envía a los contactos al aplicar.</p>
          </form>

          <!-- Vista previa -->
          <div class="relative space-y-5 overflow-y-auto p-5">
            <Loader2 v-if="loadingPlan" class="absolute right-4 top-4 h-4 w-4 animate-spin text-slate-400" />
            <div v-if="!plan" class="py-16 text-center text-sm text-slate-400">{{ planError ? 'Completa los datos marcados con * para ver lo que se va a crear.' : 'Generando vista previa…' }}</div>
            <template v-if="plan">
              <div v-if="plan.warnings.length" class="space-y-1 rounded-md border border-amber-200 bg-amber-50 p-3">
                <p v-for="w in plan.warnings" :key="w" class="flex gap-2 text-xs text-amber-800"><AlertTriangle class="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />{{ w }}</p>
              </div>

              <section>
                <h4 class="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500"><Kanban class="h-3.5 w-3.5" />Pipelines</h4>
                <div v-for="p in plan.pipelines" :key="p.key" class="mb-2 rounded-md border border-slate-200 p-3">
                  <p class="mb-2 text-sm font-semibold text-[#13243D]">{{ p.name }}</p>
                  <div class="flex flex-wrap gap-1">
                    <span v-for="(s, i) in p.stages" :key="s.name" class="rounded-md border border-black/5 px-2 py-0.5 text-[11px] text-slate-700" :style="{ background: s.color }">{{ i + 1 }}. {{ s.name }}</span>
                  </div>
                </div>
              </section>

              <section v-if="plan.calendars.length">
                <h4 class="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500"><CalendarDays class="h-3.5 w-3.5" />Calendario con página de reservas</h4>
                <div v-for="c in plan.calendars" :key="c.url" class="rounded-md border border-slate-200 p-3 text-xs">
                  <div class="flex flex-wrap items-baseline justify-between gap-2">
                    <p class="text-sm font-semibold text-[#13243D]">{{ c.name }}</p>
                    <span class="text-slate-500">{{ c.duration_minutes }} min · {{ LOCATIONS[c.location_type] }}<template v-if="c.location"> · {{ c.location }}</template></span>
                  </div>
                  <p class="mt-1 break-all font-mono text-[11px] text-[#F69008]">{{ c.url }}</p>
                  <div class="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 sm:grid-cols-4">
                    <span v-for="a in c.availability" :key="a.day" :class="a.is_active ? 'text-slate-700' : 'text-slate-300'">
                      <span class="capitalize">{{ a.day.slice(0, 3) }}</span> {{ a.is_active ? `${a.start_time}–${a.end_time}` : 'cerrado' }}
                    </span>
                  </div>
                  <p class="mt-1 text-[11px] text-slate-400">{{ c.timezone }}</p>
                </div>
              </section>

              <section>
                <h4 class="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500"><Workflow class="h-3.5 w-3.5" />Automatizaciones</h4>
                <div class="divide-y divide-slate-100 rounded-md border border-slate-200">
                  <div v-for="(a, i) in plan.automations" :key="a.name">
                    <button type="button" class="flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-slate-50 cursor-pointer" @click="openAuto = openAuto === i ? null : i">
                      <span class="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full" :class="a.enabled ? 'bg-emerald-500' : 'bg-slate-300'"></span>
                      <div class="min-w-0 flex-1">
                        <p class="text-sm font-medium text-[#13243D]">{{ a.name }}</p>
                        <p class="text-[11px] text-slate-500">
                          {{ TRIGGERS[a.trigger_type] }}<template v-if="a.tag">: <b>{{ a.tag }}</b></template> · {{ a.steps.length }} pasos · {{ a.enabled ? 'activa' : 'desactivada' }}
                        </p>
                        <p v-if="a.note" class="text-[11px] text-amber-700">{{ a.note }}</p>
                      </div>
                      <ChevronRight class="mt-1 h-3.5 w-3.5 flex-shrink-0 text-slate-400 transition-transform" :class="openAuto === i ? 'rotate-90' : ''" />
                    </button>
                    <ol v-if="openAuto === i" class="space-y-1.5 bg-slate-50 px-3 pb-3 pt-1">
                      <li class="text-[11px] italic text-slate-500">{{ a.description }}</li>
                      <li v-for="(s, n) in a.steps" :key="s.id + n" class="rounded-md border border-slate-200 bg-white px-2.5 py-1.5">
                        <p class="text-[11px] font-semibold text-slate-700">{{ n + 1 }}. {{ s.label }}</p>
                        <p v-if="stepText(s)" class="mt-0.5 whitespace-pre-line text-[11px] leading-snug text-slate-500">{{ stepText(s) }}</p>
                      </li>
                    </ol>
                  </div>
                </div>
              </section>

              <section v-if="plan.tags.length">
                <h4 class="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500"><Tag class="h-3.5 w-3.5" />Etiquetas que disparan automatizaciones</h4>
                <div class="flex flex-wrap gap-1">
                  <span v-for="t in plan.tags" :key="t" class="rounded-md bg-[#13243D] px-2 py-0.5 font-mono text-[11px] text-white">{{ t }}</span>
                </div>
                <p class="mt-1 text-[11px] text-slate-400">El equipo del cliente las añade a un contacto (ficha del contacto) para lanzar el mensaje correspondiente.</p>
              </section>
            </template>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
