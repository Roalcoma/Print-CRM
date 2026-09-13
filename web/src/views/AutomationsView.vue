<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import {
  Zap, MessageCircle, UserPlus, Briefcase, ListTodo, Bell,
  Clock, Play, Pause, ToggleLeft, ToggleRight, ChevronRight,
  CheckCircle2, Settings2, Activity,
} from 'lucide-vue-next';
import { api } from '../api';
import LoadingState from '../components/LoadingState.vue';
import { useAuthStore } from '../stores/auth';

interface AutomationRule {
  id: string;
  trigger_type: string;
  name: string;
  description: string;
  enabled: boolean;
  run_count: number;
  last_run_at: string | null;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

const auth = useAuthStore();
const rules = ref<AutomationRule[]>([]);
const loading = ref(true);
const toggling = ref<string | null>(null);
const selectedId = ref<string | null>(null);

const selectedRule = computed(() => rules.value.find(r => r.id === selectedId.value) ?? null);

onMounted(async () => {
  try {
    rules.value = await api.get<AutomationRule[]>('/automations');
    if (rules.value.length) selectedId.value = rules.value[0].id;
  } finally {
    loading.value = false;
  }
});

async function toggleRule(rule: AutomationRule) {
  if (!auth.isAdmin) return;
  toggling.value = rule.id;
  try {
    const updated = await api.patch<AutomationRule>(`/automations/${rule.id}`, { enabled: !rule.enabled });
    const idx = rules.value.findIndex(r => r.id === rule.id);
    if (idx !== -1) rules.value[idx] = updated;
  } catch {
    // revert handled by server error
  } finally {
    toggling.value = null;
  }
}

const TRIGGER_META: Record<string, { label: string; icon: typeof MessageCircle; color: string; bg: string }> = {
  whatsapp_new_message: {
    label: 'Mensaje nuevo de WhatsApp',
    icon: MessageCircle,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
  },
};

const STEP_ICONS: Record<string, typeof UserPlus> = {
  create_contact:      UserPlus,
  create_opportunity:  Briefcase,
  create_task:         ListTodo,
  create_notification: Bell,
};
const STEP_LABELS: Record<string, string> = {
  create_contact:      'Crear contacto automáticamente',
  create_opportunity:  'Crear oportunidad en la primera etapa del pipeline',
  create_task:         'Asignar tarea de alta prioridad a todos los usuarios',
  create_notification: 'Enviar notificación de nuevo lead al equipo',
};

function formatDate(d: string | null) {
  if (!d) return 'Nunca';
  return new Date(d).toLocaleDateString('es-VE', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
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
      <div class="flex items-center gap-2">
        <span class="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-600">
          <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500"></span>
          {{ rules.filter(r => r.enabled).length }} activas
        </span>
      </div>
    </div>

    <!-- Cuerpo: lista + detalle -->
    <div class="flex flex-1 overflow-hidden">

      <!-- Lista lateral -->
      <aside class="flex w-80 flex-shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white">
        <div class="p-3">
          <p class="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Flujos configurados</p>

          <button
            v-for="rule in rules"
            :key="rule.id"
            class="w-full rounded-lg p-3 text-left transition-colors"
            :class="selectedId === rule.id
              ? 'bg-primary/5 ring-1 ring-primary/20'
              : 'hover:bg-slate-50'"
            @click="selectedId = rule.id"
          >
            <div class="flex items-start gap-3">
              <!-- Icono del trigger -->
              <div
                class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg"
                :class="rule.enabled
                  ? (TRIGGER_META[rule.trigger_type]?.bg ?? 'bg-slate-100')
                  : 'bg-slate-100'"
              >
                <component
                  :is="TRIGGER_META[rule.trigger_type]?.icon ?? Zap"
                  class="h-4 w-4"
                  :class="rule.enabled
                    ? (TRIGGER_META[rule.trigger_type]?.color ?? 'text-slate-500')
                    : 'text-slate-400'"
                />
              </div>

              <div class="min-w-0 flex-1">
                <div class="flex items-center justify-between gap-1">
                  <p class="truncate text-[13px] font-semibold text-slate-900">{{ rule.name }}</p>
                  <!-- Pill estado -->
                  <span
                    class="flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold"
                    :class="rule.enabled
                      ? 'bg-emerald-50 text-emerald-600'
                      : 'bg-slate-100 text-slate-400'"
                  >{{ rule.enabled ? 'Activo' : 'Inactivo' }}</span>
                </div>
                <p class="mt-0.5 text-[11px] text-slate-400">
                  {{ TRIGGER_META[rule.trigger_type]?.label ?? rule.trigger_type }}
                </p>
                <p class="mt-1 text-[11px] text-slate-400">
                  {{ rule.run_count }} ejecuciones
                </p>
              </div>
            </div>
          </button>

          <!-- Estado vacío -->
          <div v-if="!rules.length" class="py-10 text-center">
            <Zap class="mx-auto mb-2 h-8 w-8 text-slate-200" />
            <p class="text-sm text-slate-400">No hay automatizaciones configuradas</p>
          </div>
        </div>
      </aside>

      <!-- Panel de detalle -->
      <div class="flex flex-1 flex-col overflow-y-auto bg-[#F1F5F9]">

        <!-- Sin selección -->
        <div v-if="!selectedRule" class="flex flex-1 flex-col items-center justify-center py-20">
          <Zap class="mb-3 h-12 w-12 text-slate-200" />
          <p class="text-sm text-slate-400">Selecciona una automatización para ver sus detalles</p>
        </div>

        <template v-else>
          <!-- Header del detalle -->
          <div class="border-b border-slate-200 bg-white px-6 py-5">
            <div class="flex items-start justify-between gap-4">
              <div class="flex items-start gap-4">
                <div
                  class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl"
                  :class="selectedRule.enabled
                    ? (TRIGGER_META[selectedRule.trigger_type]?.bg ?? 'bg-slate-100')
                    : 'bg-slate-100'"
                >
                  <component
                    :is="TRIGGER_META[selectedRule.trigger_type]?.icon ?? Zap"
                    class="h-6 w-6"
                    :class="selectedRule.enabled
                      ? (TRIGGER_META[selectedRule.trigger_type]?.color ?? 'text-slate-500')
                      : 'text-slate-400'"
                  />
                </div>
                <div>
                  <h2 class="text-[16px] font-bold text-slate-900">{{ selectedRule.name }}</h2>
                  <p class="mt-0.5 text-[13px] text-slate-500">{{ selectedRule.description }}</p>
                </div>
              </div>

              <!-- Toggle de activación -->
              <button
                v-if="auth.isAdmin"
                class="flex flex-shrink-0 cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition-all"
                :class="selectedRule.enabled
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'"
                :disabled="toggling === selectedRule.id"
                @click="toggleRule(selectedRule)"
              >
                <component
                  :is="selectedRule.enabled ? ToggleRight : ToggleLeft"
                  class="h-5 w-5"
                  :class="selectedRule.enabled ? 'text-emerald-600' : 'text-slate-400'"
                />
                {{ selectedRule.enabled ? 'Activa' : 'Inactiva' }}
              </button>
            </div>
          </div>

          <div class="flex-1 space-y-4 p-6">

            <!-- Estadísticas -->
            <div class="grid grid-cols-3 gap-4">
              <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-card">
                <div class="flex items-center gap-2 text-slate-400">
                  <Activity class="h-4 w-4" />
                  <span class="text-[11px] font-semibold uppercase tracking-wider">Ejecuciones</span>
                </div>
                <p class="mt-2 text-2xl font-bold text-slate-900">{{ selectedRule.run_count }}</p>
                <p class="text-[11px] text-slate-400">desde que se activó</p>
              </div>
              <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-card">
                <div class="flex items-center gap-2 text-slate-400">
                  <Clock class="h-4 w-4" />
                  <span class="text-[11px] font-semibold uppercase tracking-wider">Última ejecución</span>
                </div>
                <p class="mt-2 text-sm font-semibold text-slate-900">{{ formatDate(selectedRule.last_run_at) }}</p>
                <p class="text-[11px] text-slate-400">fecha y hora</p>
              </div>
              <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-card">
                <div class="flex items-center gap-2" :class="selectedRule.enabled ? 'text-emerald-500' : 'text-slate-400'">
                  <component :is="selectedRule.enabled ? Play : Pause" class="h-4 w-4" />
                  <span class="text-[11px] font-semibold uppercase tracking-wider">Estado</span>
                </div>
                <p class="mt-2 text-sm font-bold" :class="selectedRule.enabled ? 'text-emerald-600' : 'text-slate-400'">
                  {{ selectedRule.enabled ? 'En ejecución' : 'Detenida' }}
                </p>
                <p class="text-[11px] text-slate-400">estado actual</p>
              </div>
            </div>

            <!-- Flujo visual: Disparador → Acciones -->
            <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
              <h3 class="mb-5 flex items-center gap-2 text-[13px] font-semibold text-slate-700">
                <Settings2 class="h-4 w-4 text-slate-400" />
                Flujo de ejecución
              </h3>

              <!-- Trigger -->
              <div class="flex items-center gap-3 rounded-lg border border-slate-200 p-4">
                <div
                  class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg"
                  :class="TRIGGER_META[selectedRule.trigger_type]?.bg ?? 'bg-slate-100'"
                >
                  <component
                    :is="TRIGGER_META[selectedRule.trigger_type]?.icon ?? Zap"
                    class="h-5 w-5"
                    :class="TRIGGER_META[selectedRule.trigger_type]?.color ?? 'text-slate-500'"
                  />
                </div>
                <div>
                  <p class="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Disparador</p>
                  <p class="text-sm font-semibold text-slate-900">{{ TRIGGER_META[selectedRule.trigger_type]?.label ?? selectedRule.trigger_type }}</p>
                  <p class="text-[11px] text-slate-400">Solo conversaciones nuevas (primer mensaje del número)</p>
                </div>
              </div>

              <!-- Conector -->
              <div class="ml-5 flex items-center gap-2 py-2">
                <div class="h-6 w-0.5 bg-slate-200"></div>
                <span class="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-400">luego</span>
              </div>

              <!-- Acciones -->
              <div class="space-y-2">
                <template v-for="(val, key) in selectedRule.config" :key="key">
                  <div v-if="val && STEP_LABELS[key]" class="flex items-center gap-3 rounded-lg bg-slate-50 p-3">
                    <div class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white shadow-sm">
                      <component :is="STEP_ICONS[key] ?? CheckCircle2" class="h-4 w-4 text-primary" />
                    </div>
                    <p class="text-sm text-slate-700">{{ STEP_LABELS[key] }}</p>
                    <CheckCircle2 class="ml-auto h-4 w-4 flex-shrink-0 text-emerald-500" />
                  </div>
                </template>
              </div>
            </div>

          </div>
        </template>
      </div>
    </div>
  </div>
</template>
