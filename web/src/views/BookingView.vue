<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { ChevronLeft, ChevronRight, Clock, Calendar, CheckCircle, AlertCircle } from 'lucide-vue-next';

const route = useRoute();
const slug  = route.params.slug as string;

// ─── Estado ───────────────────────────────────────────────────────────────────
type Step = 'loading' | 'pick-date' | 'pick-time' | 'form' | 'success' | 'error' | 'disabled';

const step     = ref<Step>('loading');
const errMsg   = ref('');
const calendar = ref<{
  name: string; color: string; slug: string; timezone: string;
  description: string | null; duration_minutes: number;
  custom_message: string | null; owner_name: string;
} | null>(null);

const allSlots  = ref<{ date: string; times: string[] }[]>([]);
const selDate   = ref<string>('');
const selTime   = ref<string>('');

// Paginación de días (de 7 en 7)
const pageStart = ref(0);
const PAGE_SIZE = 7;
const visibleDays = computed(() => allSlots.value.slice(pageStart.value, pageStart.value + PAGE_SIZE));
const timesForDate = computed(() => allSlots.value.find(s => s.date === selDate.value)?.times ?? []);

// Formulario
const form = ref({ name: '', email: '', phone: '', notes: '' });
const saving = ref(false);
const successMsg = ref('');

// ─── Carga inicial ────────────────────────────────────────────────────────────
onMounted(async () => {
  try {
    const res = await fetch(`/api/public/book/${slug}`);
    if (res.status === 403) { step.value = 'disabled'; return; }
    if (!res.ok) { errMsg.value = 'Calendario no encontrado.'; step.value = 'error'; return; }
    const data = await res.json();
    calendar.value = data.calendar;
    allSlots.value  = data.slots;
    step.value = 'pick-date';
  } catch {
    errMsg.value = 'Error de conexión. Intenta de nuevo.';
    step.value = 'error';
  }
});

// ─── Navegación ───────────────────────────────────────────────────────────────
function pickDate(date: string) {
  selDate.value = date;
  selTime.value = '';
  step.value = 'pick-time';
}

function pickTime(time: string) {
  selTime.value = time;
  step.value = 'form';
}

function backToDate()  { step.value = 'pick-date'; selTime.value = ''; }
function backToTime()  { step.value = 'pick-time'; }

// ─── Formatters ───────────────────────────────────────────────────────────────
function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('es', { day: 'numeric', month: 'short' });
}

function dayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('es', { weekday: 'short' }).slice(0, 3);
}

// ─── Submit ───────────────────────────────────────────────────────────────────
async function submit() {
  if (!form.value.name.trim() || !form.value.email.trim()) return;
  saving.value = true;
  try {
    // Construir ISO con fecha + hora seleccionada
    const startISO = new Date(`${selDate.value}T${selTime.value}:00`).toISOString();

    const res = await fetch(`/api/public/book/${slug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name:     form.value.name.trim(),
        email:    form.value.email.trim(),
        phone:    form.value.phone.trim() || null,
        notes:    form.value.notes.trim() || null,
        start_at: startISO,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      errMsg.value = data.error ?? 'Error al agendar. Intenta de nuevo.';
      step.value = 'error';
      return;
    }
    successMsg.value = data.message;
    step.value = 'success';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">

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
        :style="`background:${calendar?.color}20`">
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
          <span>{{ selTime }} · {{ calendar?.duration_minutes }} min</span>
        </div>
      </div>
      <p class="mt-4 text-xs text-slate-400">Recibirás un correo de confirmación en {{ form.email }}.</p>
    </div>

    <!-- Booking panel -->
    <div v-else class="w-full max-w-3xl bg-white rounded-2xl shadow-xl overflow-hidden">
      <div class="flex flex-col md:flex-row min-h-[520px]">

        <!-- Columna izquierda: info del calendario -->
        <div class="md:w-72 shrink-0 p-6 border-b md:border-b-0 md:border-r border-slate-100 flex flex-col gap-4">
          <!-- Avatar / color -->
          <div class="flex h-12 w-12 items-center justify-center rounded-xl text-white font-bold text-lg shadow-sm"
            :style="`background:${calendar?.color}`">
            {{ (calendar?.owner_name ?? 'C')[0].toUpperCase() }}
          </div>

          <div>
            <p class="text-xs font-medium text-slate-500 uppercase tracking-wide">{{ calendar?.owner_name }}</p>
            <h1 class="text-xl font-bold text-slate-900 mt-0.5">{{ calendar?.name }}</h1>
          </div>

          <div class="flex items-center gap-2 text-sm text-slate-600">
            <Clock class="h-4 w-4 text-slate-400 shrink-0" />
            <span>{{ calendar?.duration_minutes }} minutos</span>
          </div>

          <p v-if="calendar?.description" class="text-sm text-slate-500 leading-relaxed">
            {{ calendar.description }}
          </p>

          <div v-if="calendar?.custom_message"
            class="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600 leading-relaxed">
            {{ calendar.custom_message }}
          </div>

          <!-- Breadcrumb en móvil -->
          <div v-if="step !== 'pick-date'" class="flex items-center gap-1 text-xs text-slate-400 mt-auto">
            <button class="hover:text-slate-700 cursor-pointer" @click="backToDate">Fecha</button>
            <span>/</span>
            <button v-if="step === 'form'" class="hover:text-slate-700 cursor-pointer" @click="backToTime">Hora</button>
            <span v-if="step === 'form'">/</span>
            <span class="text-slate-600 font-medium">
              {{ step === 'pick-time' ? 'Hora' : 'Tus datos' }}
            </span>
          </div>
        </div>

        <!-- Columna derecha: selección -->
        <div class="flex-1 p-6 flex flex-col">

          <!-- PASO 1: Elegir fecha -->
          <template v-if="step === 'pick-date'">
            <h2 class="text-base font-semibold text-slate-800 mb-4">Selecciona un día</h2>

            <!-- Paginación semana -->
            <div class="flex items-center justify-between mb-3">
              <button
                class="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer disabled:opacity-30"
                :disabled="pageStart === 0"
                @click="pageStart = Math.max(0, pageStart - PAGE_SIZE)"
              >
                <ChevronLeft class="h-5 w-5" />
              </button>
              <span class="text-sm text-slate-500">
                {{ visibleDays[0] ? formatShortDate(visibleDays[0].date) : '' }}
                — {{ visibleDays[visibleDays.length-1] ? formatShortDate(visibleDays[visibleDays.length-1].date) : '' }}
              </span>
              <button
                class="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer disabled:opacity-30"
                :disabled="pageStart + PAGE_SIZE >= allSlots.length"
                @click="pageStart += PAGE_SIZE"
              >
                <ChevronRight class="h-5 w-5" />
              </button>
            </div>

            <div v-if="allSlots.length === 0" class="flex-1 flex items-center justify-center text-sm text-slate-400">
              No hay horarios disponibles en los próximos días.
            </div>

            <!-- Grid de días -->
            <div class="grid grid-cols-7 gap-1.5">
              <button
                v-for="slot in visibleDays"
                :key="slot.date"
                class="flex flex-col items-center gap-1 rounded-xl border py-3 text-sm font-medium transition-all cursor-pointer hover:border-[#F69008] hover:bg-[#F69008]/5"
                :class="selDate === slot.date
                  ? 'border-[#F69008] bg-[#F69008]/8 text-[#b86e00]'
                  : 'border-slate-200 text-slate-700'"
                @click="pickDate(slot.date)"
              >
                <span class="text-[10px] uppercase tracking-wide text-slate-400">{{ dayLabel(slot.date) }}</span>
                <span class="text-base font-bold">{{ new Date(slot.date + 'T12:00:00').getDate() }}</span>
                <span class="text-[10px] text-slate-400">{{ slot.times.length }} slots</span>
              </button>
            </div>
          </template>

          <!-- PASO 2: Elegir hora -->
          <template v-else-if="step === 'pick-time'">
            <div class="flex items-center gap-2 mb-4">
              <button class="rounded-lg p-1 text-slate-400 hover:bg-slate-100 cursor-pointer" @click="backToDate">
                <ChevronLeft class="h-5 w-5" />
              </button>
              <h2 class="text-base font-semibold text-slate-800">{{ formatDate(selDate) }}</h2>
            </div>

            <div class="grid grid-cols-3 gap-2 overflow-auto flex-1">
              <button
                v-for="time in timesForDate"
                :key="time"
                class="rounded-xl border py-3 text-sm font-semibold transition-all cursor-pointer hover:border-[#F69008] hover:bg-[#F69008]/5"
                :class="selTime === time
                  ? 'border-[#F69008] bg-[#F69008] text-white'
                  : 'border-slate-200 text-slate-700'"
                @click="pickTime(time)"
              >
                {{ time }}
              </button>
            </div>
          </template>

          <!-- PASO 3: Formulario -->
          <template v-else-if="step === 'form'">
            <div class="flex items-center gap-2 mb-1">
              <button class="rounded-lg p-1 text-slate-400 hover:bg-slate-100 cursor-pointer" @click="backToTime">
                <ChevronLeft class="h-5 w-5" />
              </button>
              <h2 class="text-base font-semibold text-slate-800">Tus datos</h2>
            </div>
            <p class="text-xs text-slate-500 mb-5 ml-8">
              {{ formatDate(selDate) }} · {{ selTime }} · {{ calendar?.duration_minutes }} min
            </p>

            <div class="space-y-3 flex-1">
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">Nombre *</label>
                <input
                  v-model="form.name"
                  type="text" placeholder="Tu nombre completo" required
                  class="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:border-[#F69008] focus:ring-2 focus:ring-[#F69008]/20 focus:outline-none"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">Correo electrónico *</label>
                <input
                  v-model="form.email"
                  type="email" placeholder="tucorreo@ejemplo.com" required
                  class="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:border-[#F69008] focus:ring-2 focus:ring-[#F69008]/20 focus:outline-none"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">Teléfono</label>
                <input
                  v-model="form.phone"
                  type="tel" placeholder="+58 412 000 0000"
                  class="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:border-[#F69008] focus:ring-2 focus:ring-[#F69008]/20 focus:outline-none"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">Notas adicionales</label>
                <textarea
                  v-model="form.notes"
                  rows="2" placeholder="¿Hay algo que quieras comentar antes de la reunión?"
                  class="w-full resize-none rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:border-[#F69008] focus:ring-2 focus:ring-[#F69008]/20 focus:outline-none"
                />
              </div>
            </div>

            <button
              :disabled="saving || !form.name.trim() || !form.email.trim()"
              class="mt-5 w-full rounded-xl py-3 text-sm font-bold text-white shadow-sm transition-colors disabled:opacity-60 cursor-pointer"
              :style="`background:${calendar?.color}`"
              @click="submit"
            >
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

  </div>
</template>
