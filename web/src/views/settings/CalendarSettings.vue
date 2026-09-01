<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { Check, ExternalLink, X } from 'lucide-vue-next';
import { api } from '../../api';
import Spinner from '../../components/Spinner.vue';

const route = useRoute();

// ─── Toast ─────────────────────────────────────────────────────────────────────
const toast = ref('');
const toastType = ref<'success' | 'error'>('success');
let toastTimer: ReturnType<typeof setTimeout>;

function showToast(msg: string, type: 'success' | 'error' = 'success') {
  toast.value = msg;
  toastType.value = type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.value = ''; }, 4000);
}

// ─── Settings state ────────────────────────────────────────────────────────────
const loadingSettings = ref(true);
const savingTz  = ref(false);
const savingWH  = ref(false);
const googleConnected = ref(false);
const zoomConnected   = ref(false);
const connectingGoogle = ref(false);
const connectingZoom   = ref(false);
const disconnectingGoogle = ref(false);
const disconnectingZoom   = ref(false);

const TIMEZONES = [
  'America/Caracas',
  'America/Bogota',
  'America/Lima',
  'America/Mexico_City',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'America/Santiago',
  'America/Argentina/Buenos_Aires',
  'America/Sao_Paulo',
  'America/Halifax',
  'America/Toronto',
  'Europe/Madrid',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'UTC',
];

const TIMEZONE_LABELS: Record<string, string> = {
  'America/Caracas':              'América/Caracas (VET, UTC-4)',
  'America/Bogota':               'América/Bogotá (COT, UTC-5)',
  'America/Lima':                 'América/Lima (PET, UTC-5)',
  'America/Mexico_City':          'América/Ciudad de México (CST, UTC-6)',
  'America/New_York':             'América/Nueva York (EST, UTC-5)',
  'America/Chicago':              'América/Chicago (CST, UTC-6)',
  'America/Los_Angeles':          'América/Los Ángeles (PST, UTC-8)',
  'America/Santiago':             'América/Santiago (CLT, UTC-4)',
  'America/Argentina/Buenos_Aires':'América/Buenos Aires (ART, UTC-3)',
  'America/Sao_Paulo':            'América/São Paulo (BRT, UTC-3)',
  'America/Halifax':              'América/Halifax (AST, UTC-4)',
  'America/Toronto':              'América/Toronto (EST, UTC-5)',
  'Europe/Madrid':                'Europa/Madrid (CET, UTC+1)',
  'Europe/London':                'Europa/Londres (GMT, UTC+0)',
  'Europe/Paris':                 'Europa/París (CET, UTC+1)',
  'Europe/Berlin':                'Europa/Berlín (CET, UTC+1)',
  'UTC':                          'UTC (UTC+0)',
};

const selectedTimezone = ref('America/Caracas');

// Working hours
const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

type WorkingHours = {
  enabled: boolean;
  start: string;
  end: string;
};

const workingHours = ref<WorkingHours[]>(
  DAY_KEYS.map((_, i) => ({
    enabled: i < 5,
    start: '09:00',
    end: '18:00',
  }))
);

async function loadSettings() {
  loadingSettings.value = true;
  try {
    const s = await api.get<{
      timezone: string;
      working_hours: Record<string, { enabled: boolean; start: string; end: string }> | null;
      google_connected: boolean;
      zoom_connected: boolean;
    }>('/calendar/settings');

    selectedTimezone.value = s.timezone ?? 'America/Caracas';
    googleConnected.value  = s.google_connected;
    zoomConnected.value    = s.zoom_connected;

    if (s.working_hours) {
      DAY_KEYS.forEach((key, i) => {
        const wh = s.working_hours![key];
        if (wh) workingHours.value[i] = { ...wh };
      });
    }
  } catch (e: any) {
    showToast('Error al cargar la configuración', 'error');
  } finally {
    loadingSettings.value = false;
  }
}

async function saveTz() {
  savingTz.value = true;
  try {
    await api.patch('/calendar/settings', { timezone: selectedTimezone.value });
    showToast('Zona horaria guardada');
  } catch {
    showToast('Error al guardar', 'error');
  } finally {
    savingTz.value = false;
  }
}

async function saveWH() {
  savingWH.value = true;
  try {
    const wh: Record<string, WorkingHours> = {};
    DAY_KEYS.forEach((key, i) => { wh[key] = workingHours.value[i]; });
    await api.patch('/calendar/settings', { working_hours: wh });
    showToast('Horario laboral guardado');
  } catch {
    showToast('Error al guardar', 'error');
  } finally {
    savingWH.value = false;
  }
}

// ─── Google ────────────────────────────────────────────────────────────────────
async function connectGoogle() {
  connectingGoogle.value = true;
  try {
    const res = await api.get<{ url?: string; error?: string }>('/calendar/google/connect');
    if (res.url) {
      window.location.href = res.url;
    } else {
      showToast(res.error ?? 'No se pudo conectar con Google Calendar', 'error');
      connectingGoogle.value = false;
    }
  } catch (e: any) {
    showToast(e.message ?? 'Error al conectar', 'error');
    connectingGoogle.value = false;
  }
}

async function disconnectGoogle() {
  if (!confirm('¿Desconectar Google Calendar?')) return;
  disconnectingGoogle.value = true;
  try {
    await api.get('/calendar/google/disconnect');
    googleConnected.value = false;
    showToast('Google Calendar desconectado');
  } catch {
    showToast('Error al desconectar', 'error');
  } finally {
    disconnectingGoogle.value = false;
  }
}

// ─── Zoom ──────────────────────────────────────────────────────────────────────
async function connectZoom() {
  connectingZoom.value = true;
  try {
    const res = await api.get<{ url?: string; error?: string }>('/calendar/zoom/connect');
    if (res.url) {
      window.location.href = res.url;
    } else {
      showToast(res.error ?? 'No se pudo conectar con Zoom', 'error');
      connectingZoom.value = false;
    }
  } catch (e: any) {
    showToast(e.message ?? 'Error al conectar', 'error');
    connectingZoom.value = false;
  }
}

async function disconnectZoom() {
  if (!confirm('¿Desconectar Zoom?')) return;
  disconnectingZoom.value = true;
  try {
    await api.get('/calendar/zoom/disconnect');
    zoomConnected.value = false;
    showToast('Zoom desconectado');
  } catch {
    showToast('Error al desconectar', 'error');
  } finally {
    disconnectingZoom.value = false;
  }
}

// ─── Init ──────────────────────────────────────────────────────────────────────
onMounted(async () => {
  await loadSettings();

  // Show success toast if redirected back from OAuth
  const connected = route.query.connected as string | undefined;
  if (connected === 'google') showToast('¡Google Calendar conectado correctamente!');
  else if (connected === 'zoom') showToast('¡Zoom conectado correctamente!');
});
</script>

<template>
  <div class="min-h-full bg-slate-50 p-8">
    <div class="mx-auto max-w-2xl space-y-8">

      <div>
        <h1 class="text-2xl font-bold text-slate-900">Configuración del Calendario</h1>
        <p class="mt-1 text-sm text-slate-500">Personaliza tu calendario, horario laboral e integraciones.</p>
      </div>

      <!-- Loading -->
      <div v-if="loadingSettings" class="flex items-center justify-center py-20">
        <Spinner :size="28" />
      </div>

      <template v-else>

        <!-- ── Zona horaria ──────────────────────────────────────────────── -->
        <section class="rounded-xl border border-slate-200 bg-white p-6 shadow-card">
          <h2 class="mb-1 text-base font-semibold text-slate-800">Zona horaria</h2>
          <p class="mb-4 text-sm text-slate-500">Todas las citas se guardarán en esta zona horaria.</p>
          <div class="flex gap-3">
            <select
              v-model="selectedTimezone"
              class="flex-1 cursor-pointer rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#F69008] focus:ring-2 focus:ring-[#F69008]/20 focus:outline-none"
            >
              <option v-for="tz in TIMEZONES" :key="tz" :value="tz">
                {{ TIMEZONE_LABELS[tz] ?? tz }}
              </option>
            </select>
            <button
              :disabled="savingTz"
              class="flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#F69008] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#D97706] disabled:opacity-60"
              @click="saveTz"
            >
              <Spinner v-if="savingTz" :size="14" light />
              {{ savingTz ? 'Guardando…' : 'Guardar' }}
            </button>
          </div>
        </section>

        <!-- ── Horario laboral ───────────────────────────────────────────── -->
        <section class="rounded-xl border border-slate-200 bg-white p-6 shadow-card">
          <h2 class="mb-1 text-base font-semibold text-slate-800">Horario laboral</h2>
          <p class="mb-4 text-sm text-slate-500">Define los días y horas en que estás disponible.</p>

          <div class="space-y-3">
            <div
              v-for="(wh, i) in workingHours"
              :key="i"
              class="flex flex-wrap items-center gap-3"
            >
              <label class="flex w-32 cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  v-model="wh.enabled"
                  class="h-4 w-4 cursor-pointer accent-[#F69008] rounded"
                />
                {{ DAYS[i] }}
              </label>
              <template v-if="wh.enabled">
                <input
                  v-model="wh.start"
                  type="time"
                  class="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-[#F69008] focus:outline-none"
                />
                <span class="text-xs text-slate-400">a</span>
                <input
                  v-model="wh.end"
                  type="time"
                  class="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-[#F69008] focus:outline-none"
                />
              </template>
              <span v-else class="text-sm text-slate-400">No disponible</span>
            </div>
          </div>

          <button
            :disabled="savingWH"
            class="mt-5 flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#F69008] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#D97706] disabled:opacity-60"
            @click="saveWH"
          >
            <Spinner v-if="savingWH" :size="14" light />
            {{ savingWH ? 'Guardando…' : 'Guardar horario' }}
          </button>
        </section>

        <!-- ── Google Calendar ───────────────────────────────────────────── -->
        <section class="rounded-xl border border-slate-200 bg-white p-6 shadow-card">
          <div class="flex items-start justify-between gap-4">
            <div class="flex items-start gap-4">
              <!-- Google logo -->
              <div class="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-white shadow-md ring-1 ring-slate-200">
                <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
              </div>
              <div>
                <h2 class="text-base font-semibold text-slate-800">Google Calendar</h2>
                <p class="mt-0.5 text-sm text-slate-500">Sincroniza tus citas con Google Calendar.</p>
                <div class="mt-2 flex items-center gap-1.5">
                  <span
                    class="h-2 w-2 rounded-full"
                    :class="googleConnected ? 'bg-emerald-500' : 'bg-slate-300'"
                  ></span>
                  <span class="text-xs font-medium" :class="googleConnected ? 'text-emerald-600' : 'text-slate-400'">
                    {{ googleConnected ? 'Conectado' : 'No conectado' }}
                  </span>
                </div>
              </div>
            </div>
            <div>
              <button
                v-if="!googleConnected"
                :disabled="connectingGoogle"
                class="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:shadow-md disabled:opacity-60"
                @click="connectGoogle"
              >
                <Spinner v-if="connectingGoogle" :size="14" />
                <ExternalLink v-else class="h-4 w-4" />
                {{ connectingGoogle ? 'Conectando…' : 'Conectar con Google' }}
              </button>
              <button
                v-else
                :disabled="disconnectingGoogle"
                class="flex cursor-pointer items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 transition-all hover:border-red-300 disabled:opacity-60"
                @click="disconnectGoogle"
              >
                <Spinner v-if="disconnectingGoogle" :size="14" />
                <X v-else class="h-4 w-4" />
                {{ disconnectingGoogle ? 'Desconectando…' : 'Desconectar' }}
              </button>
            </div>
          </div>
        </section>

        <!-- ── Zoom ─────────────────────────────────────────────────────── -->
        <section class="rounded-xl border border-slate-200 bg-white p-6 shadow-card">
          <div class="flex items-start justify-between gap-4">
            <div class="flex items-start gap-4">
              <!-- Zoom logo -->
              <div class="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-[#2D8CFF] shadow-md">
                <svg viewBox="0 0 24 24" class="h-6 w-6" fill="white">
                  <path d="M4.5 7.5A2.5 2.5 0 0 0 2 10v4a2.5 2.5 0 0 0 2.5 2.5h9A2.5 2.5 0 0 0 16 14v-4a2.5 2.5 0 0 0-2.5-2.5h-9zm11.5 2.086 4.243-2.829A.5.5 0 0 1 21 7.5v9a.5.5 0 0 1-.757.429L16 14.086V9.586z"/>
                </svg>
              </div>
              <div>
                <h2 class="text-base font-semibold text-slate-800">Zoom</h2>
                <p class="mt-0.5 text-sm text-slate-500">Genera enlaces de Zoom automáticamente para tus citas.</p>
                <div class="mt-2 flex items-center gap-1.5">
                  <span
                    class="h-2 w-2 rounded-full"
                    :class="zoomConnected ? 'bg-emerald-500' : 'bg-slate-300'"
                  ></span>
                  <span class="text-xs font-medium" :class="zoomConnected ? 'text-emerald-600' : 'text-slate-400'">
                    {{ zoomConnected ? 'Conectado' : 'No conectado' }}
                  </span>
                </div>
              </div>
            </div>
            <div>
              <button
                v-if="!zoomConnected"
                :disabled="connectingZoom"
                class="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:shadow-md disabled:opacity-60"
                @click="connectZoom"
              >
                <Spinner v-if="connectingZoom" :size="14" />
                <ExternalLink v-else class="h-4 w-4" />
                {{ connectingZoom ? 'Conectando…' : 'Conectar con Zoom' }}
              </button>
              <button
                v-else
                :disabled="disconnectingZoom"
                class="flex cursor-pointer items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 transition-all hover:border-red-300 disabled:opacity-60"
                @click="disconnectZoom"
              >
                <Spinner v-if="disconnectingZoom" :size="14" />
                <X v-else class="h-4 w-4" />
                {{ disconnectingZoom ? 'Desconectando…' : 'Desconectar' }}
              </button>
            </div>
          </div>
        </section>

      </template>
    </div>

    <!-- Toast -->
    <Transition name="toast">
      <div
        v-if="toast"
        class="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium shadow-xl"
        :class="toastType === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'"
      >
        <Check v-if="toastType === 'success'" class="h-4 w-4" />
        <X v-else class="h-4 w-4" />
        {{ toast }}
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.toast-enter-active, .toast-leave-active { transition: all 0.3s ease; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(8px); }
</style>
