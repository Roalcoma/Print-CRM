<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useDialog } from '../composables/useDialog';
import { Calendar, Clock, AlertCircle, CheckCircle, XCircle, RefreshCw } from 'lucide-vue-next';

const route = useRoute();
const slug  = route.params.slug as string;
const token = route.params.token as string;

type Status = 'loading' | 'loaded' | 'error' | 'cancelled' | 'rescheduled' | 'picking';

const { confirm } = useDialog();
const status  = ref<Status>('loading');
const errMsg  = ref('');
const msgText = ref('');

const appt = ref<{
  id: string; title: string; start_at: string; end_at: string;
  status: string; meeting_url: string | null; timezone: string;
} | null>(null);

const slots    = ref<string[]>([]);
const selSlot  = ref('');
const saving   = ref(false);

function fmt(iso: string) {
  return new Date(iso).toLocaleString('es', {
    weekday: 'long', day: 'numeric', month: 'long',
    hour: '2-digit', minute: '2-digit',
  });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

async function load() {
  try {
    const res = await fetch(`/api/public/book/${slug}/manage/${token}`);
    if (!res.ok) { errMsg.value = 'No encontramos tu cita. El enlace puede haber expirado.'; status.value = 'error'; return; }
    appt.value = await res.json();
    status.value = appt.value!.status === 'cancelled' ? 'cancelled' : 'loaded';
  } catch {
    errMsg.value = 'Error de conexión.';
    status.value = 'error';
  }
}

async function cancel() {
  if (!await confirm('¿Seguro que deseas cancelar esta cita?', 'Cancelar cita')) return;
  saving.value = true;
  try {
    const res = await fetch(`/api/public/book/${slug}/cancel/${token}`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) { errMsg.value = data.error; status.value = 'error'; return; }
    msgText.value = data.message;
    status.value = 'cancelled';
  } finally { saving.value = false; }
}

// Carga los slots disponibles para reagendar (siguiente semana)
async function startReschedule() {
  status.value = 'picking';
  const start = new Date();
  const end   = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  try {
    const res  = await fetch(`/api/public/book/${slug}?start=${start.toISOString()}&end=${end.toISOString()}`);
    const data = await res.json();
    const allSlots: string[] = [];
    for (const d of (data.slots ?? [])) {
      for (const t of d.times) allSlots.push(t);
    }
    slots.value = allSlots.slice(0, 40);
  } catch {
    slots.value = [];
  }
}

async function confirmReschedule() {
  if (!selSlot.value) return;
  saving.value = true;
  try {
    const res = await fetch(`/api/public/book/${slug}/reschedule/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ start_at: selSlot.value }),
    });
    const data = await res.json();
    if (!res.ok) { errMsg.value = data.error; status.value = 'error'; return; }
    msgText.value = data.message;
    if (appt.value) {
      appt.value.start_at = data.start_at;
      appt.value.end_at   = data.end_at;
    }
    status.value = 'rescheduled';
  } finally { saving.value = false; }
}

onMounted(load);
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center p-4">

    <!-- Loading -->
    <div v-if="status === 'loading'" class="flex flex-col items-center gap-3 text-slate-500">
      <div class="h-8 w-8 rounded-full border-2 border-slate-300 border-t-[#F69008] animate-spin"></div>
      <span class="text-sm">Cargando…</span>
    </div>

    <!-- Error -->
    <div v-else-if="status === 'error'" class="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
      <AlertCircle class="h-12 w-12 text-slate-300 mx-auto mb-4" />
      <h2 class="text-lg font-semibold text-slate-700 mb-2">No encontramos tu cita</h2>
      <p class="text-sm text-slate-500">{{ errMsg }}</p>
    </div>

    <!-- Cancelada -->
    <div v-else-if="status === 'cancelled'" class="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
      <XCircle class="h-12 w-12 text-red-300 mx-auto mb-4" />
      <h2 class="text-xl font-bold text-slate-800 mb-2">Cita cancelada</h2>
      <p class="text-sm text-slate-500">{{ msgText || 'Tu cita ha sido cancelada.' }}</p>
      <a :href="`/book/${slug}`"
        class="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#F69008] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#D97706] transition-colors">
        Reservar nueva cita
      </a>
    </div>

    <!-- Reagendada -->
    <div v-else-if="status === 'rescheduled'" class="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
      <CheckCircle class="h-12 w-12 text-emerald-400 mx-auto mb-4" />
      <h2 class="text-xl font-bold text-slate-800 mb-2">¡Cita reagendada!</h2>
      <p class="text-sm text-slate-600 mb-4">{{ msgText }}</p>
      <div class="rounded-xl border border-slate-200 bg-slate-50 p-4 text-left space-y-2">
        <div class="flex items-center gap-2 text-sm text-slate-700">
          <Calendar class="h-4 w-4 text-slate-400" />
          <span>{{ fmtDate(appt!.start_at) }}</span>
        </div>
        <div class="flex items-center gap-2 text-sm text-slate-700">
          <Clock class="h-4 w-4 text-slate-400" />
          <span>{{ fmtTime(appt!.start_at) }} – {{ fmtTime(appt!.end_at) }}</span>
        </div>
      </div>
    </div>

    <!-- Eligiendo nuevo horario -->
    <div v-else-if="status === 'picking'" class="max-w-md w-full bg-white rounded-2xl shadow-lg p-6">
      <div class="flex items-center gap-2 mb-5">
        <button class="text-slate-400 hover:text-slate-600 transition-colors" @click="status = 'loaded'">←</button>
        <h2 class="text-base font-bold text-slate-800">Selecciona nuevo horario</h2>
      </div>

      <div v-if="slots.length === 0" class="text-center py-8 text-sm text-slate-400">
        No hay horarios disponibles próximamente.
      </div>
      <div v-else class="max-h-72 overflow-y-auto space-y-2 pr-1">
        <button
          v-for="s in slots"
          :key="s"
          type="button"
          class="w-full rounded-xl border px-4 py-3 text-sm font-medium transition-all cursor-pointer text-left"
          :class="selSlot === s
            ? 'border-[#F69008] bg-[#F69008]/8 text-[#9a5a00]'
            : 'border-slate-200 text-slate-700 hover:border-[#F69008]/50 hover:bg-slate-50'"
          @click="selSlot = s"
        >
          {{ fmt(s) }}
        </button>
      </div>

      <button
        :disabled="!selSlot || saving"
        class="mt-5 w-full rounded-xl bg-[#F69008] px-4 py-3 text-sm font-bold text-white hover:bg-[#D97706] transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        @click="confirmReschedule"
      >
        {{ saving ? 'Guardando…' : 'Confirmar reagendado' }}
      </button>
    </div>

    <!-- Vista principal de la cita -->
    <div v-else class="max-w-md w-full bg-white rounded-2xl shadow-lg p-6">
      <h2 class="text-lg font-bold text-slate-800 mb-1">Tu cita</h2>
      <p class="text-xs text-slate-400 mb-5">Puedes cancelar o reagendar desde aquí.</p>

      <div class="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3 mb-6">
        <div class="flex items-start gap-3">
          <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#F69008]/10">
            <Calendar class="h-5 w-5 text-[#F69008]" />
          </div>
          <div>
            <p class="text-sm font-semibold text-slate-800">{{ appt?.title }}</p>
            <p class="text-xs text-slate-500 mt-0.5">{{ fmtDate(appt!.start_at) }}</p>
            <p class="text-xs text-slate-500">{{ fmtTime(appt!.start_at) }} – {{ fmtTime(appt!.end_at) }}</p>
          </div>
        </div>

        <!-- Enlace de Meet si existe -->
        <a v-if="appt?.meeting_url"
          :href="appt.meeting_url"
          target="_blank" rel="noopener"
          class="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors"
        >
          <svg class="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
          Unirse a la reunión (Google Meet)
        </a>
      </div>

      <div class="flex flex-col gap-2">
        <button
          class="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:border-[#F69008]/60 hover:bg-[#F69008]/5 hover:text-[#9a5a00] transition-all cursor-pointer"
          @click="startReschedule"
        >
          <RefreshCw class="h-4 w-4" />
          Reagendar cita
        </button>
        <button
          :disabled="saving"
          class="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-3 text-sm font-semibold text-red-600 hover:bg-red-50 transition-all cursor-pointer disabled:opacity-50"
          @click="cancel"
        >
          <XCircle class="h-4 w-4" />
          Cancelar cita
        </button>
      </div>
    </div>

  </div>
</template>
