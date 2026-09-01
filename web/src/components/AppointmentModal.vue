<script setup lang="ts">
import { ref, watch, computed, onMounted } from 'vue';
import { X, Calendar, Video, Pencil, Trash2, MapPin, AlertTriangle, RefreshCw, UserPlus, Mail } from 'lucide-vue-next';
import { api } from '../api';
import type { Appointment } from '../types';
import Spinner from './Spinner.vue';

// ─── Props / emits ────────────────────────────────────────────────────────────
const props = defineProps<{
  modelValue: boolean;
  date?: string;
  appointment?: Appointment;
  initialContactId?: string;
  initialContactName?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [boolean];
  saved: [];
  deleted: [];
}>();

// ─── Calendar settings ────────────────────────────────────────────────────────
const googleConnected = ref(false);
const zoomConnected   = ref(false);

async function loadSettings() {
  try {
    const s = await api.get<{ google_connected: boolean; zoom_connected: boolean }>('/calendar/settings');
    googleConnected.value = s.google_connected;
    zoomConnected.value   = s.zoom_connected;
  } catch { /* ignore */ }
}

// ─── Attendees ────────────────────────────────────────────────────────────────
interface Attendee {
  contact_id?: string | null;
  user_id?: string | null;
  email?: string | null;
  name: string;
}

const attendees       = ref<Attendee[]>([]);
const attendeeQuery   = ref('');
const attendeeResults = ref<{ id: string; name: string; email: string; type: 'contact' | 'user' }[]>([]);
const showAttendeeDrop = ref(false);
const freeEmail       = ref('');

let _attTimer: ReturnType<typeof setTimeout>;
watch(attendeeQuery, (val) => {
  clearTimeout(_attTimer);
  if (!val.trim()) { attendeeResults.value = []; showAttendeeDrop.value = false; return; }
  _attTimer = setTimeout(async () => {
    try {
      const [contacts, users] = await Promise.all([
        api.get<{ id: string; first_name: string; last_name: string | null; email: string }[]>(
          `/contacts?q=${encodeURIComponent(val)}&limit=6`,
        ),
        api.get<{ id: string; name: string; email: string }[]>(
          `/users?q=${encodeURIComponent(val)}&limit=4`,
        ).catch(() => [] as { id: string; name: string; email: string }[]),
      ]);
      attendeeResults.value = [
        ...contacts.map(c => ({ id: c.id, name: [c.first_name, c.last_name].filter(Boolean).join(' '), email: c.email ?? '', type: 'contact' as const })),
        ...users.map(u => ({ id: u.id, name: u.name, email: u.email, type: 'user' as const })),
      ];
      showAttendeeDrop.value = attendeeResults.value.length > 0;
    } catch { /* ignore */ }
  }, 250);
});

function addAttendeeFromResult(r: { id: string; name: string; email: string; type: 'contact' | 'user' }) {
  if (attendees.value.some(a => (r.type === 'contact' && a.contact_id === r.id) || (r.type === 'user' && a.user_id === r.id))) return;
  attendees.value.push(r.type === 'contact'
    ? { contact_id: r.id, name: r.name, email: r.email }
    : { user_id: r.id, name: r.name, email: r.email },
  );
  attendeeQuery.value = '';
  attendeeResults.value = [];
  showAttendeeDrop.value = false;
}

function addFreeEmail() {
  const email = freeEmail.value.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
  if (attendees.value.some(a => a.email === email && !a.contact_id && !a.user_id)) return;
  attendees.value.push({ email, name: email });
  freeEmail.value = '';
}

function removeAttendee(i: number) { attendees.value.splice(i, 1); }
function onAttendeeDrop() { setTimeout(() => { showAttendeeDrop.value = false; }, 200); }

// ─── Opportunities ────────────────────────────────────────────────────────────
const opportunities = ref<{ id: string; title: string }[]>([]);
async function loadOpps() {
  try { opportunities.value = await api.get<{ id: string; title: string }[]>('/opportunities'); }
  catch { /* ignore */ }
}

// ─── Form helpers ────────────────────────────────────────────────────────────
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function pad(n: number) { return String(n).padStart(2, '0'); }
function isoToDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function isoToTime(iso: string) {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function addHour(time: string): string {
  const [h, m] = time.split(':').map(Number);
  return `${pad((h + 1) % 24)}:${pad(m)}`;
}
function toISO(date: string, time: string): string {
  return new Date(`${date}T${time}`).toISOString();
}

// ─── Form state ───────────────────────────────────────────────────────────────
const saving   = ref(false);
const deleting = ref(false);

const form = ref({
  title:           '',
  description:     '',
  date:            todayStr(),
  startTime:       '09:00',
  endTime:         '10:00',
  isAllDay:        false,
  opportunity_id:  '',
  location:        '',
  provider:        'manual' as 'manual' | 'google' | 'zoom',
  status:          'scheduled' as Appointment['status'],
  recurrenceType:  'none' as 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly',
  recurrenceDays:  [] as number[],
  recurrenceEnd:   'never' as 'never' | 'date' | 'count',
  recurrenceEndDate: '',
  recurrenceCount: 10,
});

const WEEKDAYS = [
  { label: 'L', value: 1 }, { label: 'M', value: 2 }, { label: 'X', value: 3 },
  { label: 'J', value: 4 }, { label: 'V', value: 5 }, { label: 'S', value: 6 },
  { label: 'D', value: 0 },
];

function toggleDay(d: number) {
  const idx = form.value.recurrenceDays.indexOf(d);
  if (idx >= 0) form.value.recurrenceDays.splice(idx, 1);
  else form.value.recurrenceDays.push(d);
}

function resetForm() {
  attendees.value = [];
  attendeeQuery.value = '';
  attendeeResults.value = [];
  showAttendeeDrop.value = false;
  freeEmail.value = '';
  if (props.appointment) {
    const a = props.appointment;
    form.value = {
      title:           a.title,
      description:     a.description ?? '',
      date:            isoToDate(a.start_at),
      startTime:       isoToTime(a.start_at),
      endTime:         isoToTime(a.end_at),
      isAllDay:        a.is_all_day ?? false,
      opportunity_id:  a.opportunity_id ?? '',
      location:        a.location ?? '',
      provider:        a.provider,
      status:          a.status,
      recurrenceType:  a.recurrence_type ?? 'none',
      recurrenceDays:  a.recurrence_days ? [...a.recurrence_days] : [],
      recurrenceEnd:   a.recurrence_end_at ? 'date' : a.recurrence_count ? 'count' : 'never',
      recurrenceEndDate: a.recurrence_end_at ? isoToDate(a.recurrence_end_at) : '',
      recurrenceCount: a.recurrence_count ?? 10,
    };
    // Pre-cargar contacto principal como asistente si existe
    if (a.contact_id && a.contact_name) {
      attendees.value.push({ contact_id: a.contact_id, name: a.contact_name.trim() });
    }
  } else {
    const date = props.date ?? todayStr();
    form.value = {
      title: '', description: '',
      date,
      startTime: '09:00', endTime: '10:00', isAllDay: false,
      opportunity_id: '', location: '',
      provider: 'manual', status: 'scheduled',
      recurrenceType: 'none', recurrenceDays: [],
      recurrenceEnd: 'never', recurrenceEndDate: '', recurrenceCount: 10,
    };
    // Pre-cargar contacto inicial como asistente si se pasó desde afuera
    if (props.initialContactId && props.initialContactName) {
      attendees.value.push({ contact_id: props.initialContactId, name: props.initialContactName });
    }
  }
}

watch(() => form.value.startTime, (val) => {
  if (!props.appointment) form.value.endTime = addHour(val);
});

watch(() => props.modelValue, (open) => {
  if (open) { resetForm(); loadSettings(); loadOpps(); }
});
onMounted(() => {
  if (props.modelValue) { resetForm(); loadSettings(); loadOpps(); }
});

// ─── Computed warnings ────────────────────────────────────────────────────────
const isEdit = computed(() => !!props.appointment);
const showGoogleWarning = computed(() => form.value.provider === 'google' && !googleConnected.value);
const showZoomWarning   = computed(() => form.value.provider === 'zoom'   && !zoomConnected.value);

const recurrenceLabel: Record<string, string> = {
  none: 'Sin repetición', daily: 'Diariamente',
  weekly: 'Semanalmente', monthly: 'Mensualmente', yearly: 'Anualmente',
};

// ─── Save / Delete ────────────────────────────────────────────────────────────
async function save() {
  if (!form.value.title.trim()) return;
  saving.value = true;
  try {
    const startISO = form.value.isAllDay
      ? new Date(`${form.value.date}T00:00:00`).toISOString()
      : toISO(form.value.date, form.value.startTime);
    const endISO = form.value.isAllDay
      ? new Date(`${form.value.date}T23:59:59`).toISOString()
      : toISO(form.value.date, form.value.endTime);

    const firstContactAttendee = attendees.value.find(a => a.contact_id);

    const payload: Record<string, unknown> = {
      title:          form.value.title.trim(),
      description:    form.value.description.trim() || null,
      start_at:       startISO,
      end_at:         endISO,
      is_all_day:     form.value.isAllDay,
      contact_id:     firstContactAttendee?.contact_id ?? null,
      opportunity_id: form.value.opportunity_id || null,
      location:       form.value.provider === 'manual' ? (form.value.location.trim() || null) : null,
      provider:       form.value.provider,
      status:         form.value.status,
      recurrence_type: form.value.recurrenceType,
    };

    if (form.value.recurrenceType !== 'none') {
      if (form.value.recurrenceType === 'weekly' && form.value.recurrenceDays.length > 0)
        payload.recurrence_days = form.value.recurrenceDays;
      if (form.value.recurrenceEnd === 'date' && form.value.recurrenceEndDate)
        payload.recurrence_end_at = new Date(`${form.value.recurrenceEndDate}T23:59:59`).toISOString();
      if (form.value.recurrenceEnd === 'count')
        payload.recurrence_count = form.value.recurrenceCount;
    }

    if (attendees.value.length) {
      payload.attendees = attendees.value.map(a => ({
        contact_id: a.contact_id ?? null,
        user_id:    a.user_id ?? null,
        email:      a.email ?? null,
        name:       a.name,
      }));
    }

    if (isEdit.value) {
      await api.patch(`/appointments/${props.appointment!.id}`, payload);
    } else {
      await api.post('/appointments', payload);
    }
    emit('saved');
    emit('update:modelValue', false);
  } finally {
    saving.value = false;
  }
}

async function remove() {
  if (!props.appointment) return;
  if (!confirm('¿Eliminar esta cita? Si es recurrente, solo se elimina esta instancia.')) return;
  deleting.value = true;
  try {
    await api.del(`/appointments/${props.appointment.id}`);
    emit('deleted');
    emit('update:modelValue', false);
  } finally {
    deleting.value = false;
  }
}

function close() { emit('update:modelValue', false); }
</script>

<template>
  <div>
    <Teleport to="body">
      <Transition name="modal">
      <div
        v-if="modelValue"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
        @click.self="close"
      >
        <div class="modal-panel flex max-h-[92vh] w-full max-w-[560px] flex-col overflow-hidden rounded-xl bg-white shadow-2xl">

          <!-- Header -->
          <div class="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <div class="flex items-center gap-2.5">
              <div class="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-[#F69008] to-[#D97706] text-white shadow-sm">
                <Calendar class="h-5 w-5" />
              </div>
              <h2 class="text-base font-semibold text-slate-900">
                {{ isEdit ? 'Editar cita' : 'Nueva cita' }}
              </h2>
            </div>
            <button class="cursor-pointer rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" @click="close">
              <X class="h-5 w-5" />
            </button>
          </div>

          <!-- Body -->
          <div class="flex-1 overflow-auto px-6 py-5 space-y-4">

            <!-- Título -->
            <div>
              <label class="mb-1 block text-sm font-medium text-slate-700">Título *</label>
              <input
                v-model="form.title"
                required
                placeholder="Ej: Reunión de seguimiento"
                class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#F69008] focus:ring-2 focus:ring-[#F69008]/20 focus:outline-none"
              />
            </div>

            <!-- Descripción -->
            <div>
              <label class="mb-1 block text-sm font-medium text-slate-700">Descripción</label>
              <textarea
                v-model="form.description"
                rows="2"
                placeholder="Detalles adicionales…"
                class="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#F69008] focus:ring-2 focus:ring-[#F69008]/20 focus:outline-none"
              />
            </div>

            <!-- Fecha + Toggle todo el día -->
            <div class="flex items-end gap-3">
              <div class="flex-1">
                <label class="mb-1 block text-sm font-medium text-slate-700">Fecha</label>
                <input
                  v-model="form.date"
                  type="date"
                  class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#F69008] focus:ring-2 focus:ring-[#F69008]/20 focus:outline-none"
                />
              </div>
              <!-- Toggle todo el día -->
              <label class="flex cursor-pointer items-center gap-2 pb-2 select-none">
                <div
                  class="relative h-5 w-9 rounded-full transition-colors duration-200"
                  :class="form.isAllDay ? 'bg-[#F69008]' : 'bg-slate-300'"
                  @click="form.isAllDay = !form.isAllDay"
                >
                  <div
                    class="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200"
                    :class="form.isAllDay ? 'translate-x-4' : 'translate-x-0.5'"
                  ></div>
                </div>
                <span class="text-sm text-slate-600">Todo el día</span>
              </label>
            </div>

            <!-- Horas: solo si NO es todo el día -->
            <div v-if="!form.isAllDay" class="grid grid-cols-2 gap-3">
              <div>
                <label class="mb-1 block text-sm font-medium text-slate-700">Hora inicio</label>
                <input
                  v-model="form.startTime"
                  type="time"
                  class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#F69008] focus:ring-2 focus:ring-[#F69008]/20 focus:outline-none"
                />
              </div>
              <div>
                <label class="mb-1 block text-sm font-medium text-slate-700">Hora fin</label>
                <input
                  v-model="form.endTime"
                  type="time"
                  class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#F69008] focus:ring-2 focus:ring-[#F69008]/20 focus:outline-none"
                />
              </div>
            </div>

            <!-- Recurrencia -->
            <div class="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
              <div class="flex items-center gap-2">
                <RefreshCw class="h-4 w-4 text-slate-400 shrink-0" />
                <label class="text-sm font-medium text-slate-700">Repetición</label>
              </div>

              <select
                v-model="form.recurrenceType"
                class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#F69008] focus:outline-none"
              >
                <option v-for="(label, key) in recurrenceLabel" :key="key" :value="key">{{ label }}</option>
              </select>

              <!-- Días de la semana (solo weekly) -->
              <div v-if="form.recurrenceType === 'weekly'" class="flex gap-1.5">
                <button
                  v-for="day in WEEKDAYS"
                  :key="day.value"
                  type="button"
                  class="h-8 w-8 rounded-full text-xs font-semibold transition-colors cursor-pointer"
                  :class="form.recurrenceDays.includes(day.value)
                    ? 'bg-[#F69008] text-white'
                    : 'bg-white border border-slate-300 text-slate-600 hover:border-[#F69008]'"
                  @click="toggleDay(day.value)"
                >
                  {{ day.label }}
                </button>
              </div>

              <!-- Fin de la recurrencia -->
              <div v-if="form.recurrenceType !== 'none'" class="space-y-2">
                <label class="text-xs font-medium text-slate-500 uppercase tracking-wide">Termina</label>
                <div class="flex flex-col gap-2">
                  <label class="flex items-center gap-2 cursor-pointer">
                    <input type="radio" v-model="form.recurrenceEnd" value="never" class="accent-[#F69008]" />
                    <span class="text-sm text-slate-700">Nunca</span>
                  </label>
                  <label class="flex items-center gap-2 cursor-pointer">
                    <input type="radio" v-model="form.recurrenceEnd" value="date" class="accent-[#F69008]" />
                    <span class="text-sm text-slate-700">En la fecha</span>
                    <input
                      v-if="form.recurrenceEnd === 'date'"
                      v-model="form.recurrenceEndDate"
                      type="date"
                      class="ml-1 rounded border border-slate-300 px-2 py-1 text-sm focus:border-[#F69008] focus:outline-none"
                    />
                  </label>
                  <label class="flex items-center gap-2 cursor-pointer">
                    <input type="radio" v-model="form.recurrenceEnd" value="count" class="accent-[#F69008]" />
                    <span class="text-sm text-slate-700">Después de</span>
                    <input
                      v-if="form.recurrenceEnd === 'count'"
                      v-model.number="form.recurrenceCount"
                      type="number"
                      min="1" max="365"
                      class="ml-1 w-16 rounded border border-slate-300 px-2 py-1 text-sm focus:border-[#F69008] focus:outline-none"
                    />
                    <span v-if="form.recurrenceEnd === 'count'" class="text-sm text-slate-500">veces</span>
                  </label>
                </div>
              </div>
            </div>

            <!-- Oportunidad -->
            <div>
              <label class="mb-1 block text-sm font-medium text-slate-700">Oportunidad</label>
              <select
                v-model="form.opportunity_id"
                class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#F69008] focus:outline-none"
              >
                <option value="">Sin oportunidad</option>
                <option v-for="o in opportunities" :key="o.id" :value="o.id">{{ o.title }}</option>
              </select>
            </div>

            <!-- Invitados -->
            <div class="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
              <div class="flex items-center gap-2">
                <UserPlus class="h-4 w-4 text-slate-400 shrink-0" />
                <label class="text-sm font-medium text-slate-700">Invitados</label>
              </div>

              <!-- Chips de invitados seleccionados -->
              <div v-if="attendees.length" class="flex flex-wrap gap-1.5">
                <span
                  v-for="(att, i) in attendees"
                  :key="i"
                  class="inline-flex items-center gap-1 rounded-full bg-white border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm"
                >
                  <span class="inline-block h-2 w-2 rounded-full shrink-0"
                    :class="att.user_id ? 'bg-violet-400' : 'bg-[#F69008]'"
                  ></span>
                  {{ att.name }}
                  <button type="button" class="ml-0.5 text-slate-400 hover:text-red-500 cursor-pointer" @click="removeAttendee(i)">
                    <X class="h-3 w-3" />
                  </button>
                </span>
              </div>

              <!-- Buscar contacto o usuario -->
              <div class="relative">
                <input
                  v-model="attendeeQuery"
                  type="text"
                  placeholder="Buscar contacto o usuario del CRM…"
                  autocomplete="off"
                  class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#F69008] focus:ring-2 focus:ring-[#F69008]/20 focus:outline-none"
                  @blur="onAttendeeDrop"
                />
                <div
                  v-if="showAttendeeDrop && attendeeResults.length > 0"
                  class="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg overflow-hidden"
                >
                  <button
                    v-for="r in attendeeResults"
                    :key="r.id + r.type"
                    type="button"
                    class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-[#F69008]/8 transition-colors cursor-pointer"
                    @click="addAttendeeFromResult(r)"
                  >
                    <span class="inline-block h-2 w-2 rounded-full shrink-0"
                      :class="r.type === 'user' ? 'bg-violet-400' : 'bg-[#F69008]'"
                    ></span>
                    <span class="font-medium">{{ r.name }}</span>
                    <span class="text-slate-400 text-xs truncate">{{ r.email }}</span>
                    <span class="ml-auto text-[10px] uppercase tracking-wide text-slate-400">{{ r.type === 'user' ? 'Usuario' : 'Contacto' }}</span>
                  </button>
                </div>
              </div>

              <!-- Email libre -->
              <div class="flex gap-2">
                <div class="relative flex-1">
                  <Mail class="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                  <input
                    v-model="freeEmail"
                    type="email"
                    placeholder="Añadir por correo electrónico"
                    class="w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3 py-2 text-sm focus:border-[#F69008] focus:ring-2 focus:ring-[#F69008]/20 focus:outline-none"
                    @keydown.enter.prevent="addFreeEmail"
                  />
                </div>
                <button
                  type="button"
                  class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                  @click="addFreeEmail"
                >
                  Añadir
                </button>
              </div>
              <p class="text-[11px] text-slate-400">
                Punto naranja = contacto · Punto violeta = usuario CRM
              </p>
            </div>

            <!-- Ubicación: solo para reuniones manuales (presenciales) -->
            <div v-if="form.provider === 'manual'">
              <label class="mb-1 block text-sm font-medium text-slate-700">Ubicación</label>
              <div class="relative">
                <MapPin class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <input
                  v-model="form.location"
                  placeholder="Ubicación o dirección"
                  class="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm focus:border-[#F69008] focus:ring-2 focus:ring-[#F69008]/20 focus:outline-none"
                />
              </div>
            </div>

            <!-- Canal -->
            <div>
              <label class="mb-1 block text-sm font-medium text-slate-700">Canal</label>
              <div class="grid grid-cols-3 gap-2">
                <!-- Manual -->
                <button
                  type="button"
                  class="flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-all cursor-pointer"
                  :class="form.provider === 'manual'
                    ? 'border-[#F69008] bg-[#F69008]/8 text-[#9a5a00]'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300'"
                  @click="form.provider = 'manual'"
                >
                  <Pencil class="h-4 w-4" /> Manual
                </button>
                <!-- Google -->
                <button
                  type="button"
                  class="flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-all cursor-pointer"
                  :class="form.provider === 'google'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300'"
                  @click="form.provider = 'google'"
                >
                  <!-- Google icon -->
                  <svg class="h-4 w-4" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Google
                </button>
                <!-- Zoom -->
                <button
                  type="button"
                  class="flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-all cursor-pointer"
                  :class="form.provider === 'zoom'
                    ? 'border-sky-500 bg-sky-50 text-sky-700'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300'"
                  @click="form.provider = 'zoom'"
                >
                  <Video class="h-4 w-4" /> Zoom
                </button>
              </div>
              <!-- Avisos de conexión -->
              <div v-if="showGoogleWarning" class="mt-2 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-2.5">
                <AlertTriangle class="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                <p class="text-xs text-amber-700">
                  Google Calendar no conectado.
                  <a href="/settings/calendar" target="_blank" class="underline font-medium">Conecta en Configuración</a>.
                </p>
              </div>
              <div v-if="showZoomWarning" class="mt-2 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-2.5">
                <AlertTriangle class="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                <p class="text-xs text-amber-700">
                  Zoom no conectado.
                  <a href="/settings/calendar" target="_blank" class="underline font-medium">Conecta en Configuración</a>.
                </p>
              </div>
            </div>

            <!-- Estado -->
            <div>
              <label class="mb-1 block text-sm font-medium text-slate-700">Estado</label>
              <select
                v-model="form.status"
                class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#F69008] focus:outline-none"
              >
                <option value="scheduled">Programada</option>
                <option value="completed">Completada</option>
                <option value="cancelled">Cancelada</option>
                <option value="no_show">No asistió</option>
              </select>
            </div>

          </div>

          <!-- Footer -->
          <div class="flex items-center justify-between border-t border-slate-200 px-6 py-4">
            <button
              v-if="isEdit"
              type="button"
              :disabled="deleting"
              class="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors cursor-pointer disabled:opacity-50"
              @click="remove"
            >
              <Spinner v-if="deleting" :size="14" />
              <Trash2 v-else class="h-4 w-4" />
              Eliminar
            </button>
            <div v-else></div>

            <div class="flex items-center gap-2">
              <button
                type="button"
                class="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
                @click="close"
              >
                Cancelar
              </button>
              <button
                type="button"
                :disabled="saving || !form.title.trim()"
                class="flex items-center gap-2 rounded-lg bg-[#F69008] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#D97706] transition-colors cursor-pointer disabled:opacity-60"
                @click="save"
              >
                <Spinner v-if="saving" :size="14" light />
                {{ saving ? 'Guardando…' : (isEdit ? 'Guardar cambios' : 'Crear cita') }}
              </button>
            </div>
          </div>

        </div>
      </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.modal-enter-active, .modal-leave-active {
  transition: opacity 0.2s ease;
}
.modal-enter-active .modal-panel, .modal-leave-active .modal-panel {
  transition: transform 0.2s ease, opacity 0.2s ease;
}
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-from .modal-panel, .modal-leave-to .modal-panel {
  transform: translateY(-12px); opacity: 0;
}
</style>
