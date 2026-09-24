<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { ChevronLeft, ChevronRight, Clock, Calendar, CheckCircle, AlertCircle, Globe, ChevronDown, Search, Check, MapPin } from 'lucide-vue-next';

const route = useRoute();
const slug  = route.params.slug as string;

type Step = 'loading' | 'pick-date' | 'pick-time' | 'form' | 'success' | 'error' | 'disabled';

const step     = ref<Step>('loading');
const errMsg   = ref('');
const calendar = ref<{
  name: string; color: string; slug: string; timezone: string;
  description: string | null; duration_minutes: number;
  custom_message: string | null; owner_name: string;
  logo_url: string | null; location: string | null; location_type: string | null;
} | null>(null);

// times[] son instantes UTC ISO (e.g. "2026-09-14T13:00:00.000Z")
const allSlots   = ref<{ date: string; times: string[] }[]>([]);
const selDate    = ref('');
const selTime    = ref(''); // UTC ISO string del slot seleccionado
const form       = ref({ name: '', email: '', phone: '', notes: '' });
const saving          = ref(false);
const successMsg      = ref('');
const bookingLocation = ref<string | null>(null);
const cancelToken     = ref<string | null>(null);
const appointmentId   = ref<string | null>(null);

// ── Zona horaria del visitante ────────────────────────────────────────────────
const systemTz   = Intl.DateTimeFormat().resolvedOptions().timeZone;
const systemCity = systemTz.split('/').pop()?.replace(/_/g, ' ') ?? systemTz;
const visitorTz  = ref(systemTz);

const TZ_LIST = [
  { group: 'América del Sur', zones: [
    { id: 'America/Caracas',                label: 'Venezuela' },
    { id: 'America/Bogota',                 label: 'Colombia, Perú, Ecuador' },
    { id: 'America/La_Paz',                 label: 'Bolivia' },
    { id: 'America/Santiago',               label: 'Chile' },
    { id: 'America/Argentina/Buenos_Aires', label: 'Argentina, Uruguay' },
    { id: 'America/Sao_Paulo',              label: 'Brasil (São Paulo)' },
    { id: 'America/Manaus',                 label: 'Brasil (Amazonas)' },
  ]},
  { group: 'América Central y Norte', zones: [
    { id: 'America/Panama',                 label: 'Panamá, Costa Rica' },
    { id: 'America/Mexico_City',            label: 'México (Centro)' },
    { id: 'America/New_York',               label: 'EE.UU. Este' },
    { id: 'America/Chicago',                label: 'EE.UU. Centro' },
    { id: 'America/Denver',                 label: 'EE.UU. Montaña' },
    { id: 'America/Los_Angeles',            label: 'EE.UU. Pacífico' },
  ]},
  { group: 'Europa', zones: [
    { id: 'Europe/Madrid',                  label: 'España' },
    { id: 'Europe/London',                  label: 'Reino Unido' },
    { id: 'Europe/Paris',                   label: 'Europa Central' },
  ]},
  { group: 'Otros', zones: [
    { id: 'UTC',                            label: 'UTC' },
  ]},
];

const systemTzInList = TZ_LIST.flatMap(g => g.zones).some(z => z.id === systemTz);

// Label legible para la TZ del calendario (para mostrar al visitante)
const calTzLabel = computed(() => {
  if (!calendar.value) return '';
  const found = TZ_LIST.flatMap(g => g.zones).find(z => z.id === calendar.value!.timezone);
  if (found) return found.label;
  return calendar.value.timezone.split('/').pop()?.replace(/_/g, ' ') ?? calendar.value.timezone;
});

// UTC ISO → hora en la TZ del visitante
function slotDisplayTime(utcIso: string): string {
  return new Date(utcIso).toLocaleTimeString('es', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: visitorTz.value,
  });
}

// Todos los slots reagrupados por fecha en la TZ del visitante
const visitorSlots = computed(() => {
  const byDate: Record<string, string[]> = {};
  for (const group of allSlots.value) {
    for (const utcIso of group.times) {
      const d = new Date(utcIso).toLocaleDateString('en-CA', { timeZone: visitorTz.value });
      if (!byDate[d]) byDate[d] = [];
      byDate[d].push(utcIso);
    }
  }
  return Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, times]) => ({ date, times }));
});

// Al cambiar TZ, reiniciar selección y navegar al primer mes disponible
watch(visitorTz, () => {
  selDate.value = '';
  selTime.value = '';
  if (step.value === 'pick-time' || step.value === 'form') step.value = 'pick-date';
  if (visitorSlots.value.length) {
    const [y, m] = visitorSlots.value[0].date.split('-').map(Number);
    calView.value = new Date(y, m - 1, 1);
  }
});

onMounted(async () => {
  try {
    const res = await fetch(`/api/public/book/${slug}`);
    if (res.status === 403) { step.value = 'disabled'; return; }
    if (!res.ok) { errMsg.value = 'Calendario no encontrado.'; step.value = 'error'; return; }
    const data = await res.json();
    calendar.value = data.calendar;
    allSlots.value = data.slots;
    step.value = 'pick-date';
    // Navegar al primer mes disponible en la TZ del visitante
    if (visitorSlots.value.length) {
      const [y, m] = visitorSlots.value[0].date.split('-').map(Number);
      calView.value = new Date(y, m - 1, 1);
    }
  } catch {
    errMsg.value = 'Error de conexión. Intenta de nuevo.';
    step.value = 'error';
  }
});

// ── Mini calendario ───────────────────────────────────────────────────────────
const DAYS_ES   = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                   'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const calView = ref(new Date(new Date().getFullYear(), new Date().getMonth(), 1));

const availSet = computed(() => new Set(visitorSlots.value.map(s => s.date)));

const calDays = computed(() => {
  const year         = calView.value.getFullYear();
  const month        = calView.value.getMonth();
  const firstWeekDay = new Date(year, month, 1).getDay();
  const daysInMonth  = new Date(year, month + 1, 0).getDate();

  const cells: Array<{ dateStr: string; day: number; available: boolean; isToday: boolean } | null> = [];
  for (let i = 0; i < firstWeekDay; i++) cells.push(null);

  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: visitorTz.value });
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ dateStr, day: d, available: availSet.value.has(dateStr), isToday: dateStr === todayStr });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
});

const calWeeks = computed(() => {
  const weeks = [];
  for (let i = 0; i < calDays.value.length; i += 7)
    weeks.push(calDays.value.slice(i, i + 7));
  return weeks;
});

const todayMonthStart = computed(() => {
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: visitorTz.value });
  const [y, m] = todayStr.split('-').map(Number);
  return new Date(y, m - 1, 1);
});

const canGoPrev = computed(() => calView.value > todayMonthStart.value);
const canGoNext = computed(() => {
  if (!visitorSlots.value.length) return false;
  const lastDate = visitorSlots.value[visitorSlots.value.length - 1].date;
  const [ly, lm] = lastDate.split('-').map(Number);
  const nextView = new Date(calView.value.getFullYear(), calView.value.getMonth() + 1, 1);
  return nextView <= new Date(ly, lm - 1, 1);
});

function prevMonth() { if (canGoPrev.value) calView.value = new Date(calView.value.getFullYear(), calView.value.getMonth() - 1, 1); }
function nextMonth() { if (canGoNext.value) calView.value = new Date(calView.value.getFullYear(), calView.value.getMonth() + 1, 1); }

// ── Navegación de pasos ───────────────────────────────────────────────────────
const timesForDate = computed(() => visitorSlots.value.find(s => s.date === selDate.value)?.times ?? []);

function pickDate(dateStr: string) { selDate.value = dateStr; selTime.value = ''; step.value = 'pick-time'; }
function pickTime(utcIso: string)  { selTime.value = utcIso; step.value = 'form'; }
function backToDate() { step.value = 'pick-date'; selTime.value = ''; }
function backToTime() { step.value = 'pick-time'; }

// ── Formatters ────────────────────────────────────────────────────────────────
function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' })
    .format(new Date(y, m - 1, d));
}

// ── Submit ────────────────────────────────────────────────────────────────────
async function submit() {
  if (!form.value.name.trim() || !form.value.email.trim()) return;
  saving.value = true;
  try {
    const res = await fetch(`/api/public/book/${slug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name:     form.value.name.trim(),
        email:    form.value.email.trim(),
        phone:    form.value.phone.trim() || null,
        notes:    form.value.notes.trim() || null,
        start_at: selTime.value, // ya es UTC ISO string
      }),
    });
    const data = await res.json();
    if (!res.ok) { errMsg.value = data.error ?? 'Error al agendar.'; step.value = 'error'; return; }
    bookingLocation.value = data.location ?? null;
    cancelToken.value     = data.cancel_token ?? null;
    appointmentId.value   = data.appointment?.id ?? null;
    successMsg.value = data.message;
    step.value = 'success';
  } finally { saving.value = false; }
}
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center p-4">

    <!-- Loading -->
    <div v-if="step === 'loading'" class="flex flex-col items-center gap-3 text-slate-500">
      <div class="h-8 w-8 rounded-full border-2 border-slate-300 border-t-[#F69008] animate-spin"></div>
      <span class="text-sm">Cargando…</span>
    </div>

    <!-- Error / Disabled -->
    <div v-else-if="step === 'error' || step === 'disabled'"
      class="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
      <AlertCircle class="h-12 w-12 text-slate-300 mx-auto mb-4" />
      <h2 class="text-lg font-semibold text-slate-700 mb-2">
        {{ step === 'disabled' ? 'Reservas no disponibles' : 'Calendario no encontrado' }}
      </h2>
      <p class="text-sm text-slate-500">
        {{ step === 'disabled' ? 'Este calendario no acepta citas en línea por el momento.' : errMsg }}
      </p>
    </div>

    <!-- Success -->
    <div v-else-if="step === 'success'"
      class="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
      <div class="flex h-16 w-16 items-center justify-center rounded-full mx-auto mb-4"
        :style="`background:${calendar?.color}25`">
        <CheckCircle class="h-8 w-8" :style="`color:${calendar?.color}`" />
      </div>
      <h2 class="text-xl font-bold text-slate-900 mb-2">¡Cita confirmada!</h2>
      <p class="text-sm text-slate-600 mb-6">{{ successMsg }}</p>
      <div class="rounded-xl border border-slate-200 bg-slate-50 p-4 text-left space-y-2">
        <div class="flex items-center gap-2 text-sm text-slate-700">
          <Calendar class="h-4 w-4 text-slate-400" />
          <span>{{ formatDate(selDate) }}</span>
        </div>
        <div class="flex items-center gap-2 text-sm text-slate-700">
          <Clock class="h-4 w-4 text-slate-400" />
          <span>{{ slotDisplayTime(selTime) }} · {{ calendar?.duration_minutes }} min</span>
        </div>
        <div class="flex items-center gap-2 text-xs text-slate-400">
          <Globe class="h-3.5 w-3.5" />
          <span>{{ visitorTz }}</span>
        </div>
        <!-- Enlace / ubicación -->
        <div v-if="bookingLocation" class="flex items-start gap-2 pt-1 border-t border-slate-200">
          <MapPin class="h-4 w-4 shrink-0 text-slate-400 mt-0.5" />
          <a v-if="bookingLocation.startsWith('http')" :href="bookingLocation" target="_blank" rel="noopener"
            class="text-sm font-medium break-all" :style="`color:${calendar?.color}`">
            Unirse a la reunión →
          </a>
          <span v-else class="text-sm text-slate-700 break-words">{{ bookingLocation }}</span>
        </div>
      </div>
      <p class="mt-4 text-xs text-slate-400">Recibirás un correo de confirmación en {{ form.email }}.</p>

      <!-- Gestionar cita -->
      <div v-if="cancelToken && slug" class="mt-5 border-t border-slate-100 pt-4">
        <p class="text-xs text-slate-400 mb-2">¿Necesitas cambiar tu cita?</p>
        <a
          :href="`/book/${slug}/manage/${cancelToken}`"
          class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:border-slate-300 hover:bg-slate-50 transition-colors"
        >
          Cancelar o reagendar →
        </a>
      </div>
    </div>

    <!-- Panel principal de booking -->
    <div v-else class="w-full max-w-3xl bg-white rounded-2xl shadow-xl overflow-hidden">
      <div class="flex flex-col md:flex-row min-h-[540px]">

        <!-- ── Panel izquierdo ────────────────────────────────────────────── -->
        <div class="md:w-64 shrink-0 p-6 border-b md:border-b-0 md:border-r border-slate-100 flex flex-col gap-4">

          <!-- Logo o avatar -->
          <div>
            <img v-if="calendar?.logo_url"
              :src="calendar.logo_url"
              alt="Logo"
              class="h-14 w-14 rounded-2xl object-cover border border-slate-100 shadow-sm"
            />
            <div v-else
              class="flex h-14 w-14 items-center justify-center rounded-2xl text-white text-xl font-bold shadow-sm"
              :style="`background:${calendar?.color}`">
              {{ (calendar?.owner_name ?? 'C')[0].toUpperCase() }}
            </div>
          </div>

          <div>
            <p class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{{ calendar?.owner_name }}</p>
            <h1 class="text-lg font-bold text-slate-900 mt-0.5 leading-tight">{{ calendar?.name }}</h1>
          </div>

          <div class="flex items-center gap-2 text-sm text-slate-500">
            <Clock class="h-4 w-4 shrink-0" :style="`color:${calendar?.color}`" />
            <span>{{ calendar?.duration_minutes }} minutos</span>
          </div>

          <!-- Zona horaria del visitante -->
          <div class="rounded-xl border border-slate-100 bg-slate-50 p-3 space-y-2">
            <p class="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Tu zona horaria</p>
            <div class="flex items-center gap-1.5">
              <Globe class="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <select
                v-model="visitorTz"
                class="flex-1 min-w-0 bg-transparent text-xs text-slate-700 outline-none cursor-pointer"
              >
                <option v-if="!systemTzInList" :value="systemTz">{{ systemCity }} (auto)</option>
                <optgroup v-for="group in TZ_LIST" :key="group.group" :label="group.group">
                  <option v-for="z in group.zones" :key="z.id" :value="z.id">{{ z.label }}</option>
                </optgroup>
              </select>
            </div>
            <p v-if="calendar?.timezone !== visitorTz"
              class="text-[10px] text-slate-400 leading-tight">
              Agenda en {{ calTzLabel || calendar?.timezone }}
            </p>
          </div>

          <p v-if="calendar?.description" class="text-sm text-slate-500 leading-relaxed">
            {{ calendar.description }}
          </p>

          <div v-if="calendar?.custom_message"
            class="mt-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 leading-relaxed">
            {{ calendar.custom_message }}
          </div>

          <!-- Breadcrumb (pasos 2 y 3) -->
          <div v-if="step !== 'pick-date'" class="flex items-center gap-1 text-xs text-slate-400 mt-auto">
            <button class="hover:text-slate-700 cursor-pointer transition-colors" @click="backToDate">Fecha</button>
            <span>/</span>
            <button v-if="step === 'form'" class="hover:text-slate-700 cursor-pointer transition-colors" @click="backToTime">Hora</button>
            <span v-if="step === 'form'">/</span>
            <span class="font-semibold text-slate-700">
              {{ step === 'pick-time' ? 'Hora' : 'Tus datos' }}
            </span>
          </div>
        </div>

        <!-- ── Panel derecho ──────────────────────────────────────────────── -->
        <div class="flex-1 p-6 flex flex-col overflow-hidden">

          <!-- PASO 1: Mini calendario mensual -->
          <template v-if="step === 'pick-date'">
            <h2 class="text-base font-semibold text-slate-800 mb-5">Selecciona un día</h2>

            <div v-if="allSlots.length === 0" class="flex-1 flex items-center justify-center text-sm text-slate-400">
              No hay horarios disponibles en los próximos días.
            </div>

            <div v-else class="flex-1 flex flex-col">
              <!-- Navegación mes -->
              <div class="mb-4 flex items-center justify-between">
                <button
                  class="rounded-lg p-1.5 transition-colors cursor-pointer"
                  :class="canGoPrev ? 'text-slate-500 hover:bg-slate-100 hover:text-slate-800' : 'text-slate-200 cursor-not-allowed'"
                  :disabled="!canGoPrev"
                  @click="prevMonth">
                  <ChevronLeft class="h-5 w-5" />
                </button>
                <span class="text-sm font-semibold text-slate-800 capitalize">
                  {{ MONTHS_ES[calView.getMonth()] }} {{ calView.getFullYear() }}
                </span>
                <button
                  class="rounded-lg p-1.5 transition-colors cursor-pointer"
                  :class="canGoNext ? 'text-slate-500 hover:bg-slate-100 hover:text-slate-800' : 'text-slate-200 cursor-not-allowed'"
                  :disabled="!canGoNext"
                  @click="nextMonth">
                  <ChevronRight class="h-5 w-5" />
                </button>
              </div>

              <!-- Cabecera días de semana -->
              <div class="mb-1 grid grid-cols-7 text-center">
                <span v-for="d in DAYS_ES" :key="d" class="text-[11px] font-semibold uppercase tracking-wide text-slate-400 py-1">
                  {{ d }}
                </span>
              </div>

              <!-- Grid de semanas -->
              <div class="space-y-1">
                <div v-for="(week, wi) in calWeeks" :key="wi" class="grid grid-cols-7 gap-0.5">
                  <template v-for="(cell, ci) in week" :key="ci">
                    <div v-if="!cell" class="h-9"></div>
                    <button v-else
                      class="relative h-9 w-full rounded-lg text-sm font-medium transition-all"
                      :class="[
                        cell.available
                          ? selDate === cell.dateStr
                            ? 'text-white font-semibold shadow-sm'
                            : 'text-slate-700 hover:font-semibold cursor-pointer'
                          : 'text-slate-300 cursor-not-allowed',
                        cell.isToday && selDate !== cell.dateStr && cell.available
                          ? 'ring-1 ring-inset'
                          : '',
                      ]"
                      :style="selDate === cell.dateStr
                        ? `background:${calendar?.color}`
                        : cell.isToday && cell.available
                          ? `ring-color:${calendar?.color}`
                          : ''"
                      :disabled="!cell.available"
                      @click="pickDate(cell.dateStr)"
                    >
                      {{ cell.day }}
                      <span v-if="cell.available && selDate !== cell.dateStr"
                        class="absolute bottom-1 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full"
                        :style="`background:${calendar?.color}`"
                      ></span>
                    </button>
                  </template>
                </div>
              </div>
            </div>
          </template>

          <!-- PASO 2: Elegir hora -->
          <template v-else-if="step === 'pick-time'">
            <div class="flex items-center gap-2 mb-5">
              <button class="rounded-lg p-1 text-slate-400 hover:bg-slate-100 cursor-pointer transition-colors" @click="backToDate">
                <ChevronLeft class="h-5 w-5" />
              </button>
              <h2 class="text-base font-semibold text-slate-800 capitalize">{{ formatDate(selDate) }}</h2>
            </div>

            <div class="grid grid-cols-3 gap-2 overflow-auto flex-1 content-start">
              <button
                v-for="utcIso in timesForDate"
                :key="utcIso"
                class="rounded-xl border py-3 text-sm font-semibold transition-all cursor-pointer"
                :class="selTime === utcIso
                  ? 'border-transparent text-white shadow-sm'
                  : 'border-slate-200 text-slate-700 hover:border-[#F69008]/60 hover:bg-[#F69008]/5'"
                :style="selTime === utcIso ? `background:${calendar?.color}` : ''"
                @click="pickTime(utcIso)"
              >
                {{ slotDisplayTime(utcIso) }}
              </button>
            </div>
          </template>

          <!-- PASO 3: Formulario -->
          <template v-else-if="step === 'form'">
            <div class="flex items-center gap-2 mb-1">
              <button class="rounded-lg p-1 text-slate-400 hover:bg-slate-100 cursor-pointer transition-colors" @click="backToTime">
                <ChevronLeft class="h-5 w-5" />
              </button>
              <h2 class="text-base font-semibold text-slate-800">Tus datos</h2>
            </div>
            <p class="text-xs text-slate-400 mb-5 ml-8 capitalize">
              {{ formatDate(selDate) }} · {{ slotDisplayTime(selTime) }} · {{ calendar?.duration_minutes }} min
            </p>

            <div class="space-y-3 flex-1">
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">Nombre *</label>
                <input v-model="form.name" type="text" placeholder="Tu nombre completo" required
                  class="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none transition focus:border-[#F69008] focus:ring-2 focus:ring-[#F69008]/20" />
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">Correo electrónico *</label>
                <input v-model="form.email" type="email" placeholder="tucorreo@ejemplo.com" required
                  class="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none transition focus:border-[#F69008] focus:ring-2 focus:ring-[#F69008]/20" />
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">Teléfono</label>
                <input v-model="form.phone" type="tel" placeholder="+58 412 000 0000"
                  class="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none transition focus:border-[#F69008] focus:ring-2 focus:ring-[#F69008]/20" />
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">Notas adicionales</label>
                <textarea v-model="form.notes" rows="2" placeholder="¿Algo que quieras comentar?"
                  class="w-full resize-none rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none transition focus:border-[#F69008] focus:ring-2 focus:ring-[#F69008]/20" />
              </div>
            </div>

            <button
              :disabled="saving || !form.name.trim() || !form.email.trim()"
              class="mt-5 w-full rounded-xl py-3 text-sm font-bold text-white shadow-sm transition-opacity disabled:opacity-60 cursor-pointer"
              :style="`background:${calendar?.color}`"
              @click="submit">
              <span v-if="saving" class="flex items-center justify-center gap-2">
                <span class="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin inline-block"></span>
                Confirmando…
              </span>
              <span v-else>Confirmar cita</span>
            </button>
          </template>

        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="text-center py-6 text-xs text-gray-400">
      Powered by <span class="font-medium text-gray-500">Rocco CRM</span> ·
      <router-link to="/privacy" class="hover:text-indigo-500 hover:underline transition-colors">
        Política de Privacidad
      </router-link>
    </div>

  </div>
</template>
