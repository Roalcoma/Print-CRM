<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted } from 'vue';
import { X, Ban, ChevronDown, Clock } from 'lucide-vue-next';
import { api } from '../api';
import type { Calendar } from '../types';
import Spinner from './Spinner.vue';

const props = defineProps<{
  modelValue: boolean;
  date?: string;
  startTime?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [boolean];
  saved: [];
}>();

const calendars = ref<Calendar[]>([]);
const saving    = ref(false);
const error     = ref('');

type Mode = 'single' | 'range';
const mode = ref<Mode>('single');

// Solo horarios visibles en el grid del calendario (6AM–11:30PM)
const TIME_SLOTS = Array.from({ length: 32 }, (_, i) => {
  const h    = Math.floor(i / 2) + 6;
  const m    = i % 2 === 0 ? '00' : '30';
  const val  = `${String(h).padStart(2,'0')}:${m}`;
  const h12  = h === 12 ? 12 : h > 12 ? h - 12 : h;
  const ampm = h < 12 ? 'AM' : 'PM';
  return { value: val, label: `${h12}:${m} ${ampm}` };
});

function slotLabel(val: string) {
  return TIME_SLOTS.find(s => s.value === val)?.label ?? val;
}

// Estado dropdowns de hora
const startOpen = ref(false);
const endOpen   = ref(false);
const startRef  = ref<HTMLElement | null>(null);
const endRef    = ref<HTMLElement | null>(null);

function onDocClick(e: MouseEvent) {
  if (startRef.value && !startRef.value.contains(e.target as Node)) startOpen.value = false;
  if (endRef.value   && !endRef.value.contains(e.target as Node))   endOpen.value   = false;
}
onMounted(() => document.addEventListener('click', onDocClick, true));
onUnmounted(() => document.removeEventListener('click', onDocClick, true));

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function addHour(t: string) {
  const [h, m] = t.split(':').map(Number);
  const nh = (h + 1) % 24;
  const val = `${String(nh).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  return TIME_SLOTS.find(s => s.value === val) ? val : TIME_SLOTS[TIME_SLOTS.length - 1].value;
}
function addDays(date: string, n: number): string {
  const [y, mo, d] = date.split('-').map(Number);
  const dt = new Date(y, mo - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
}
function toISO(date: string, time: string, tz: string): string {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi]    = time.split(':').map(Number);
  const ref = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
  const raw = new Intl.DateTimeFormat('en', { timeZone: tz, timeZoneName: 'shortOffset' })
                      .formatToParts(ref).find(p => p.type === 'timeZoneName')?.value ?? 'UTC';
  const mx  = raw.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  const off = mx ? (mx[1] === '+' ? 1 : -1) * (parseInt(mx[2]) * 60 + parseInt(mx[3] ?? '0')) : 0;
  return new Date(Date.UTC(y, mo - 1, d, h, mi) - off * 60_000).toISOString();
}

const defaultStart = computed(() => {
  const s = props.startTime ?? '09:00';
  return TIME_SLOTS.find(t => t.value === s)?.value ?? '09:00';
});

const form = ref({
  calendar_id: '',
  date:        today(),
  dateFrom:    today(),
  dateTo:      today(),
  startTime:   '09:00',
  endTime:     '10:00',
  note:        '',
});

const rangeDays = computed(() => {
  if (mode.value !== 'range') return 1;
  const from = new Date(form.value.dateFrom);
  const to   = new Date(form.value.dateTo);
  return Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000) + 1);
});

async function loadCalendars() {
  try {
    calendars.value = await api.get<Calendar[]>('/calendars/mine');
    if (calendars.value.length && !form.value.calendar_id)
      form.value.calendar_id = calendars.value[0].id;
  } catch { /* ignore */ }
}

function reset() {
  error.value = '';
  mode.value  = 'single';
  startOpen.value = false;
  endOpen.value   = false;
  const st = defaultStart.value;
  form.value = {
    calendar_id: calendars.value[0]?.id ?? '',
    date:        props.date ?? today(),
    dateFrom:    props.date ?? today(),
    dateTo:      props.date ?? today(),
    startTime:   st,
    endTime:     addHour(st),
    note:        '',
  };
}

watch(() => props.modelValue, (open) => { if (open) reset(); });
watch(() => form.value.startTime, (val) => { form.value.endTime = addHour(val); });
watch(() => form.value.dateFrom, (val) => { if (form.value.dateTo < val) form.value.dateTo = val; });

onMounted(() => { loadCalendars(); });

async function save() {
  if (!form.value.calendar_id) { error.value = 'Selecciona un calendario'; return; }
  if (form.value.startTime >= form.value.endTime) { error.value = 'La hora de fin debe ser mayor a la de inicio'; return; }
  if (mode.value === 'range' && form.value.dateTo < form.value.dateFrom) {
    error.value = 'La fecha de fin debe ser mayor o igual a la de inicio'; return;
  }
  saving.value = true; error.value = '';
  try {
    const title    = form.value.note.trim() || 'Ocupado';
    const days     = mode.value === 'range' ? rangeDays.value : 1;
    const baseDate = mode.value === 'range' ? form.value.dateFrom : form.value.date;
    const tz       = calendars.value.find(c => c.id === form.value.calendar_id)?.timezone ?? 'America/Caracas';

    await Promise.all(Array.from({ length: days }, (_, i) => {
      const date = addDays(baseDate, i);
      return api.post('/appointments', {
        title,
        start_at:    toISO(date, form.value.startTime, tz),
        end_at:      toISO(date, form.value.endTime, tz),
        calendar_id: form.value.calendar_id,
        timezone:    tz,
        status:      'blocked',
      });
    }));

    emit('saved');
    emit('update:modelValue', false);
  } catch (e: unknown) {
    error.value = (e as { message?: string })?.message ?? 'Error al guardar';
  } finally {
    saving.value = false;
  }
}

function close() { emit('update:modelValue', false); }
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="modelValue" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" @click="close" />

        <div class="relative w-full max-w-sm rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200/60">
          <!-- Header -->
          <div class="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div class="flex items-center gap-2.5">
              <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
                <Ban class="h-4 w-4 text-slate-500" />
              </div>
              <span class="text-[15px] font-semibold text-slate-800">Bloquear horario</span>
            </div>
            <button class="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors cursor-pointer" @click="close">
              <X class="h-4 w-4" />
            </button>
          </div>

          <!-- Body -->
          <div class="space-y-4 p-5">

            <!-- Modo -->
            <div class="flex overflow-hidden rounded-lg border border-slate-200 bg-slate-50 p-0.5 gap-0.5">
              <button
                class="flex-1 cursor-pointer rounded-md px-3 py-1.5 text-[12px] font-medium transition-all"
                :class="mode === 'single' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'"
                @click="mode = 'single'"
              >Día específico</button>
              <button
                class="flex-1 cursor-pointer rounded-md px-3 py-1.5 text-[12px] font-medium transition-all"
                :class="mode === 'range' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'"
                @click="mode = 'range'"
              >Rango de fechas</button>
            </div>

            <!-- Calendario -->
            <div v-if="calendars.length" class="space-y-1.5">
              <label class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Calendario</label>
              <select
                v-model="form.calendar_id"
                class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
              >
                <option v-for="cal in calendars" :key="cal.id" :value="cal.id">{{ cal.name }}</option>
              </select>
            </div>
            <p v-else class="text-sm text-slate-400 italic">No tienes calendarios creados.</p>

            <!-- Fecha única -->
            <div v-if="mode === 'single'" class="space-y-1.5">
              <label class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Fecha</label>
              <input v-model="form.date" type="date"
                class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </div>

            <!-- Rango -->
            <div v-else class="grid grid-cols-2 gap-3">
              <div class="space-y-1.5">
                <label class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Desde</label>
                <input v-model="form.dateFrom" type="date"
                  class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
              <div class="space-y-1.5">
                <label class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Hasta</label>
                <input v-model="form.dateTo" type="date" :min="form.dateFrom"
                  class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
            </div>

            <p v-if="mode === 'range' && rangeDays > 1" class="text-[11px] text-slate-400">
              Se bloqueará el mismo horario en <span class="font-semibold text-slate-600">{{ rangeDays }} días</span>.
            </p>

            <!-- Horas — dropdowns personalizados -->
            <div class="grid grid-cols-2 gap-3">

              <!-- Inicio -->
              <div class="space-y-1.5">
                <label class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Inicio</label>
                <div ref="startRef" class="relative">
                  <button
                    type="button"
                    class="w-full flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:border-slate-300 transition-colors cursor-pointer focus:outline-none"
                    :class="startOpen ? 'border-primary ring-2 ring-primary/20' : ''"
                    @click.stop="startOpen = !startOpen; endOpen = false"
                  >
                    <Clock class="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <span class="flex-1 text-left font-medium">{{ slotLabel(form.startTime) }}</span>
                    <ChevronDown class="h-3.5 w-3.5 text-slate-400 shrink-0 transition-transform" :class="startOpen ? 'rotate-180' : ''" />
                  </button>
                  <Transition name="drop">
                    <div v-if="startOpen" class="absolute z-50 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
                      <div class="max-h-52 overflow-y-auto py-1">
                        <button
                          v-for="s in TIME_SLOTS"
                          :key="s.value"
                          type="button"
                          class="w-full px-3 py-2 text-[13px] text-left cursor-pointer transition-colors"
                          :class="form.startTime === s.value
                            ? 'bg-primary/10 text-primary font-semibold'
                            : 'text-slate-700 hover:bg-slate-50'"
                          @click.stop="form.startTime = s.value; startOpen = false"
                        >{{ s.label }}</button>
                      </div>
                    </div>
                  </Transition>
                </div>
              </div>

              <!-- Fin -->
              <div class="space-y-1.5">
                <label class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Fin</label>
                <div ref="endRef" class="relative">
                  <button
                    type="button"
                    class="w-full flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:border-slate-300 transition-colors cursor-pointer focus:outline-none"
                    :class="endOpen ? 'border-primary ring-2 ring-primary/20' : ''"
                    @click.stop="endOpen = !endOpen; startOpen = false"
                  >
                    <Clock class="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <span class="flex-1 text-left font-medium">{{ slotLabel(form.endTime) }}</span>
                    <ChevronDown class="h-3.5 w-3.5 text-slate-400 shrink-0 transition-transform" :class="endOpen ? 'rotate-180' : ''" />
                  </button>
                  <Transition name="drop">
                    <div v-if="endOpen" class="absolute z-50 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
                      <div class="max-h-52 overflow-y-auto py-1">
                        <button
                          v-for="s in TIME_SLOTS"
                          :key="s.value"
                          type="button"
                          class="w-full px-3 py-2 text-[13px] text-left cursor-pointer transition-colors"
                          :class="form.endTime === s.value
                            ? 'bg-primary/10 text-primary font-semibold'
                            : s.value <= form.startTime
                              ? 'text-slate-300 cursor-not-allowed'
                              : 'text-slate-700 hover:bg-slate-50'"
                          @click.stop="s.value > form.startTime && (form.endTime = s.value, endOpen = false)"
                        >{{ s.label }}</button>
                      </div>
                    </div>
                  </Transition>
                </div>
              </div>

            </div>

            <!-- Nota -->
            <div class="space-y-1.5">
              <label class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Nota <span class="normal-case font-normal text-slate-300">(opcional)</span>
              </label>
              <input v-model="form.note" type="text" placeholder="Ocupado"
                class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </div>

            <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{{ error }}</p>
          </div>

          <!-- Footer -->
          <div class="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
            <button class="btn btn-secondary btn-sm" @click="close">Cancelar</button>
            <button
              class="btn btn-sm gap-1.5 bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-50"
              :disabled="saving || !calendars.length"
              @click="save"
            >
              <Spinner v-if="saving" :size="13" light />
              <Ban v-else class="h-3.5 w-3.5" />
              {{ saving ? 'Guardando…' : mode === 'range' && rangeDays > 1 ? `Bloquear ${rangeDays} días` : 'Bloquear horario' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-fade-enter-active, .modal-fade-leave-active { transition: all 0.18s ease; }
.modal-fade-enter-from, .modal-fade-leave-to { opacity: 0; transform: scale(0.96); }
.drop-enter-active, .drop-leave-active { transition: all 0.12s ease; }
.drop-enter-from, .drop-leave-to { opacity: 0; transform: translateY(-4px) scale(0.98); }
</style>
