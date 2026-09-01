<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import {
  UserPlus, UserCog, TrendingUp, Edit, ArrowRight,
  Star, XCircle, MessageSquare, CheckSquare, CheckCircle,
  RefreshCw, StickyNote, Clock,
} from 'lucide-vue-next';
import { api } from '../api';

interface ActivityEvent {
  id: string;
  entity_type: 'contact' | 'opportunity' | 'task';
  entity_id: string;
  actor_name: string | null;
  event_type: string;
  meta: Record<string, unknown>;
  created_at: string;
}

const props = defineProps<{
  entityType: 'contact' | 'opportunity' | 'task';
  entityId: string;
}>();

const events = ref<ActivityEvent[]>([]);
const loading = ref(true);
const noteBody = ref('');
const addingNote = ref(false);
let refreshTimer: ReturnType<typeof setInterval> | null = null;

async function load() {
  try {
    events.value = await api.get<ActivityEvent[]>(
      `/activity?entityType=${props.entityType}&entityId=${props.entityId}`,
    );
  } finally {
    loading.value = false;
  }
}

async function submitNote() {
  const body = noteBody.value.trim();
  if (!body) return;
  addingNote.value = true;
  try {
    await api.post('/activity/note', {
      entityType: props.entityType,
      entityId: props.entityId,
      body,
    });
    noteBody.value = '';
    await load();
  } finally {
    addingNote.value = false;
  }
}

onMounted(() => {
  load();
  refreshTimer = setInterval(load, 30_000);
});

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer);
});

// ── Íconos por evento ─────────────────────────────────────────────────────────
type IconComponent = typeof UserPlus;
const ICON_MAP: Record<string, IconComponent> = {
  contact_created:      UserPlus,
  contact_updated:      UserCog,
  opp_created:          TrendingUp,
  opp_updated:          Edit,
  opp_stage_changed:    ArrowRight,
  opp_won:              Star,
  opp_lost:             XCircle,
  opp_note_added:       MessageSquare,
  task_created:         CheckSquare,
  task_completed:       CheckCircle,
  task_status_changed:  RefreshCw,
  note:                 StickyNote,
};

function iconFor(eventType: string): IconComponent {
  return ICON_MAP[eventType] ?? Clock;
}

// ── Colores por categoría ────────────────────────────────────────────────────
function dotColor(eventType: string): string {
  if (eventType.startsWith('contact'))     return 'bg-blue-500';
  if (eventType === 'opp_won')             return 'bg-emerald-500';
  if (eventType === 'opp_lost')            return 'bg-red-500';
  if (eventType === 'opp_stage_changed')   return 'bg-[#F69008]';
  if (eventType === 'opp_note_added')      return 'bg-slate-400';
  if (eventType === 'note')                return 'bg-slate-400';
  if (eventType.startsWith('opp'))         return 'bg-emerald-500';
  if (eventType.startsWith('task'))        return 'bg-violet-500';
  return 'bg-slate-400';
}

function iconBg(eventType: string): string {
  if (eventType.startsWith('contact'))     return 'bg-blue-100 text-blue-600';
  if (eventType === 'opp_won')             return 'bg-emerald-100 text-emerald-600';
  if (eventType === 'opp_lost')            return 'bg-red-100 text-red-600';
  if (eventType === 'opp_stage_changed')   return 'bg-orange-100 text-[#F69008]';
  if (eventType === 'opp_note_added')      return 'bg-slate-100 text-slate-500';
  if (eventType === 'note')                return 'bg-slate-100 text-slate-500';
  if (eventType.startsWith('opp'))         return 'bg-emerald-100 text-emerald-600';
  if (eventType.startsWith('task'))        return 'bg-violet-100 text-violet-600';
  return 'bg-slate-100 text-slate-500';
}

// ── Texto descriptivo ─────────────────────────────────────────────────────────
function describe(ev: ActivityEvent): string {
  const actor = ev.actor_name ?? 'Sistema';
  const m = ev.meta;

  const money = (v: unknown) => {
    const n = Number(v);
    return isNaN(n) ? String(v) : n.toLocaleString('es-VE', { style: 'currency', currency: 'USD' });
  };

  switch (ev.event_type) {
    case 'contact_created':
      return `${actor} creó el contacto ${m.name ?? ''}`;
    case 'contact_updated':
      return `${actor} actualizó el contacto ${m.name ?? ''}`;
    case 'opp_created':
      return `${actor} creó la oportunidad "${m.title}" por ${money(m.value)}`;
    case 'opp_updated': {
      const changed = Array.isArray(m.changed) ? (m.changed as string[]).join(', ') : '';
      return `${actor} actualizó "${m.title}"${changed ? ` (${changed})` : ''}`;
    }
    case 'opp_stage_changed':
      return `${actor} movió "${m.title}" de ${m.from} → ${m.to}`;
    case 'opp_won':
      return `${actor} ganó la oportunidad "${m.title}" por ${money(m.value)}`;
    case 'opp_lost':
      return `${actor} marcó "${m.title}" como perdida`;
    case 'opp_status_changed':
      return `${actor} cambió el estado de "${m.title}" a ${m.to}`;
    case 'opp_note_added':
      return `${actor} añadió una nota: "${m.body_preview}"`;
    case 'task_created':
      return `${actor} creó la tarea "${m.title}"`;
    case 'task_completed':
      return `${actor} completó la tarea "${m.title}"`;
    case 'task_status_changed':
      return `${actor} cambió el estado de "${m.title}" a ${m.to}`;
    case 'note':
      return `${actor}: "${m.body_preview}"`;
    default:
      return `${actor} realizó una acción`;
  }
}

// ── Timestamp relativo ────────────────────────────────────────────────────────
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60)  return 'hace un momento';
  const mins = Math.floor(secs / 60);
  if (mins < 60)  return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `hace ${hrs} h`;
  const days = Math.floor(hrs / 24);
  if (days < 7)   return `hace ${days} día${days !== 1 ? 's' : ''}`;
  return new Date(iso).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });
}
</script>

<template>
  <div class="mt-6 mb-10">
    <h3 class="mb-3 text-base font-semibold text-slate-800">Actividad reciente</h3>

    <!-- Skeleton loader -->
    <div v-if="loading" class="space-y-4">
      <div v-for="i in 3" :key="i" class="flex gap-3 animate-pulse">
        <div class="h-8 w-8 shrink-0 rounded-full bg-slate-200"></div>
        <div class="flex-1 space-y-2 pt-1">
          <div class="h-3 w-3/4 rounded bg-slate-200"></div>
          <div class="h-2.5 w-1/4 rounded bg-slate-100"></div>
        </div>
      </div>
    </div>

    <!-- Estado vacío -->
    <div
      v-else-if="events.length === 0"
      class="rounded-xl border border-dashed border-slate-200 py-10 text-center"
    >
      <Clock class="mx-auto mb-2 h-8 w-8 text-slate-300" />
      <p class="text-sm text-slate-400">Sin actividad registrada todavía.</p>
    </div>

    <!-- Timeline -->
    <div v-else class="relative">
      <!-- Línea vertical -->
      <div class="absolute left-3.5 top-0 bottom-0 w-px bg-slate-200"></div>

      <div class="space-y-1">
        <div v-for="ev in events" :key="ev.id" class="relative flex gap-4 pl-1">
          <!-- Punto de color + ícono -->
          <div
            class="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full shadow-sm"
            :class="iconBg(ev.event_type)"
          >
            <component :is="iconFor(ev.event_type)" class="h-3.5 w-3.5" />
          </div>

          <!-- Contenido -->
          <div class="flex-1 pb-4 min-w-0">
            <p class="text-sm text-slate-800 leading-snug">{{ describe(ev) }}</p>
            <p class="mt-0.5 text-xs text-slate-400">{{ timeAgo(ev.created_at) }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Campo de nota manual -->
    <div class="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Agregar nota</p>
      <textarea
        v-model="noteBody"
        rows="2"
        placeholder="Escribe una nota de actividad…"
        class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#F69008] focus:ring-2 focus:ring-[#F69008]/20 focus:outline-none resize-none"
      ></textarea>
      <div class="mt-2 flex justify-end">
        <button
          :disabled="!noteBody.trim() || addingNote"
          class="rounded-md bg-[#F69008] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#D97706] disabled:opacity-50 cursor-pointer"
          @click="submitNote"
        >
          {{ addingNote ? 'Guardando…' : 'Guardar nota' }}
        </button>
      </div>
    </div>
  </div>
</template>
