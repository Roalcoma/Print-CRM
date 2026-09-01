<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { ChevronLeft, ChevronRight, Plus, Settings, ExternalLink } from 'lucide-vue-next';
import { useRouter } from 'vue-router';
import { api } from '../api';
import type { Appointment, Calendar } from '../types';
import AppointmentModal from '../components/AppointmentModal.vue';

const router = useRouter();

// ─── View state ────────────────────────────────────────────────────────────────
type ViewMode = 'month' | 'week';
const viewMode = ref<ViewMode>('month');

const today = new Date();
const curYear  = ref(today.getFullYear());
const curMonth = ref(today.getMonth()); // 0-indexed

// For week view: current week start (Sunday)
const weekStart = ref<Date>(getWeekStart(today));

function getWeekStart(d: Date): Date {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  s.setDate(s.getDate() - s.getDay());
  return s;
}

// ─── Calendarios ─────────────────────────────────────────────────────────────
const calendars     = ref<Calendar[]>([]);
const visibleCalIds = ref<Set<string>>(new Set());

async function loadCalendars() {
  try {
    const list = await api.get<Calendar[]>('/calendars');
    calendars.value = list;
    // Por defecto todos visibles
    visibleCalIds.value = new Set(list.map(c => c.id));
  } catch { /* ignore */ }
}

function toggleCalendar(id: string) {
  if (visibleCalIds.value.has(id)) visibleCalIds.value.delete(id);
  else visibleCalIds.value.add(id);
  // Forzar reactividad
  visibleCalIds.value = new Set(visibleCalIds.value);
}

function calColor(calendarId: string | null): string {
  if (!calendarId) return '#F69008';
  return calendars.value.find(c => c.id === calendarId)?.color ?? '#F69008';
}

// ─── Appointments + Tasks data ────────────────────────────────────────────────
const allAppointments = ref<Appointment[]>([]);
const tasks           = ref<{ id: string; title: string; due_at: string; status: string; priority: string }[]>([]);
const loading         = ref(false);

// Filtrar por calendarios visibles
const appointments = computed(() =>
  allAppointments.value.filter(a =>
    !a.calendar_id || visibleCalIds.value.has(a.calendar_id)
  )
);

async function loadMonth() {
  loading.value = true;
  try {
    const m = curMonth.value + 1;
    const y = curYear.value;
    [allAppointments.value, tasks.value] = await Promise.all([
      api.get<Appointment[]>(`/appointments?month=${m}&year=${y}`),
      api.get<{ id: string; title: string; due_at: string; status: string; priority: string }[]>(
        `/tasks?month=${m}&year=${y}`
      ).catch(() => []),
    ]);
  } finally {
    loading.value = false;
  }
}

onMounted(async () => { await loadCalendars(); await loadMonth(); });
watch([curMonth, curYear], loadMonth);

// Also reload when week changes in week mode
watch(weekStart, () => {
  if (viewMode.value === 'week') {
    // load the month that the week start is in
    curMonth.value = weekStart.value.getMonth();
    curYear.value  = weekStart.value.getFullYear();
  }
});

// ─── Navigation ───────────────────────────────────────────────────────────────
const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DAYS_ES   = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

const headerTitle = computed(() => {
  if (viewMode.value === 'month') {
    return `${MONTHS_ES[curMonth.value]} ${curYear.value}`;
  }
  const end = new Date(weekStart.value);
  end.setDate(end.getDate() + 6);
  const sm = MONTHS_ES[weekStart.value.getMonth()];
  const em = MONTHS_ES[end.getMonth()];
  const sy = weekStart.value.getFullYear();
  const ey = end.getFullYear();
  if (sy !== ey) return `${weekStart.value.getDate()} ${sm} ${sy} – ${end.getDate()} ${em} ${ey}`;
  if (sm !== em) return `${weekStart.value.getDate()} ${sm} – ${end.getDate()} ${em} ${sy}`;
  return `${weekStart.value.getDate()} – ${end.getDate()} ${sm} ${sy}`;
});

function prev() {
  if (viewMode.value === 'month') {
    if (curMonth.value === 0) { curMonth.value = 11; curYear.value--; }
    else curMonth.value--;
  } else {
    const d = new Date(weekStart.value);
    d.setDate(d.getDate() - 7);
    weekStart.value = d;
  }
}

function next() {
  if (viewMode.value === 'month') {
    if (curMonth.value === 11) { curMonth.value = 0; curYear.value++; }
    else curMonth.value++;
  } else {
    const d = new Date(weekStart.value);
    d.setDate(d.getDate() + 7);
    weekStart.value = d;
  }
}

function goToday() {
  const n = new Date();
  curYear.value  = n.getFullYear();
  curMonth.value = n.getMonth();
  weekStart.value = getWeekStart(n);
}

// ─── Month grid ───────────────────────────────────────────────────────────────
const calendarDays = computed(() => {
  const firstDay = new Date(curYear.value, curMonth.value, 1).getDay();
  const daysInMonth = new Date(curYear.value, curMonth.value + 1, 0).getDate();
  const cells: Array<{ year: number; month: number; day: number; current: boolean }> = [];

  // Prev month fill
  const prevMonthDays = new Date(curYear.value, curMonth.value, 0).getDate();
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = prevMonthDays - i;
    const [y, m] = curMonth.value === 0
      ? [curYear.value - 1, 11]
      : [curYear.value, curMonth.value - 1];
    cells.push({ year: y, month: m, day: d, current: false });
  }

  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ year: curYear.value, month: curMonth.value, day: d, current: true });
  }

  // Next month fill to complete grid
  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    const [y, m] = curMonth.value === 11
      ? [curYear.value + 1, 0]
      : [curYear.value, curMonth.value + 1];
    cells.push({ year: y, month: m, day: d, current: false });
  }

  return cells;
});

function appsForDay(y: number, m: number, d: number): Appointment[] {
  return appointments.value.filter(a => isSameDay(a.start_at, y, m, d));
}

function tasksForDay(y: number, m: number, d: number) {
  return tasks.value.filter(t => t.due_at && isSameDay(t.due_at, y, m, d));
}

function isSameDay(iso: string, y: number, m: number, d: number): boolean {
  const date = new Date(iso);
  return date.getFullYear() === y && date.getMonth() === m && date.getDate() === d;
}

function taskChipClass(t: { status: string; priority: string }): string {
  if (t.status === 'done')      return 'bg-emerald-100 border-l-2 border-emerald-500 text-emerald-700 line-through';
  if (t.status === 'cancelled') return 'bg-slate-100 border-l-2 border-slate-300 text-slate-400 line-through';
  if (t.priority === 'high')    return 'bg-red-100 border-l-2 border-red-500 text-red-700';
  return 'bg-violet-100 border-l-2 border-violet-500 text-violet-700';
}

function isToday(y: number, m: number, d: number): boolean {
  return y === today.getFullYear() && m === today.getMonth() && d === today.getDate();
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: true });
}

// ─── Appointment chip colors ──────────────────────────────────────────────────
function chipStyle(a: Appointment): Record<string, string> {
  if (a.status === 'completed') return {};
  if (a.status === 'cancelled' || a.status === 'no_show') return {};
  const color = calColor(a.calendar_id);
  return { 'border-left-color': color, 'background': color + '22', 'color': color };
}

function chipClass(a: Appointment): string {
  if (a.status === 'completed') return 'bg-emerald-100 border-l-2 border-emerald-500 text-emerald-700';
  if (a.status === 'cancelled' || a.status === 'no_show') return 'bg-slate-100 border-l-2 border-slate-300 text-slate-400 line-through';
  return 'border-l-2';
}

// ─── Week view ────────────────────────────────────────────────────────────────
const WEEK_HOURS = Array.from({ length: 16 }, (_, i) => i + 7); // 07:00-22:00

const weekDays = computed<Date[]>(() => {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart.value);
    d.setDate(d.getDate() + i);
    return d;
  });
});

function appsForWeekDay(date: Date): Appointment[] {
  return appointments.value.filter(a =>
    isSameDay(a.start_at, date.getFullYear(), date.getMonth(), date.getDate())
  );
}

function weekAppTop(a: Appointment): string {
  const d = new Date(a.start_at);
  const minutes = (d.getHours() - 7) * 60 + d.getMinutes();
  return `${(minutes / 60) * 56}px`; // 56px per hour
}

function weekAppHeight(a: Appointment): string {
  const start = new Date(a.start_at);
  const end   = new Date(a.end_at);
  const mins  = Math.max(15, (end.getTime() - start.getTime()) / 60000);
  return `${(mins / 60) * 56 - 2}px`;
}

// ─── Modal ────────────────────────────────────────────────────────────────────
const showModal     = ref(false);
const modalDate     = ref<string | undefined>();
const modalAppointment = ref<Appointment | undefined>();

function openNew(dateStr?: string) {
  modalDate.value = dateStr;
  modalAppointment.value = undefined;
  showModal.value = true;
}

function openEdit(a: Appointment) {
  modalDate.value = undefined;
  modalAppointment.value = a;
  showModal.value = true;
}

function onSaved() {
  loadMonth();
}

function onDeleted() {
  loadMonth();
}
</script>

<template>
  <div class="flex h-full overflow-hidden">

    <!-- ── Sidebar de calendarios ─────────────────────────────────────────── -->
    <aside class="hidden md:flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white overflow-y-auto">
      <div class="px-4 pt-4 pb-2 flex items-center justify-between">
        <span class="text-xs font-semibold uppercase tracking-wide text-slate-500">Calendarios</span>
        <button
          class="rounded p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
          title="Gestionar calendarios"
          @click="router.push('/settings/calendars')"
        >
          <Settings class="h-3.5 w-3.5" />
        </button>
      </div>

      <div class="flex-1 px-2 pb-4 space-y-0.5">
        <button
          v-for="cal in calendars"
          :key="cal.id"
          class="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition-colors cursor-pointer hover:bg-slate-50"
          :class="visibleCalIds.has(cal.id) ? 'text-slate-800' : 'text-slate-400'"
          @click="toggleCalendar(cal.id)"
        >
          <!-- Checkbox visual -->
          <span
            class="flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition-colors"
            :style="visibleCalIds.has(cal.id)
              ? `background:${cal.color};border-color:${cal.color}`
              : 'border-color:#cbd5e1;background:transparent'"
          >
            <svg v-if="visibleCalIds.has(cal.id)" class="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 12 12">
              <path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </span>
          <span class="truncate text-left leading-tight">
            <span class="block font-medium text-xs">{{ cal.name }}</span>
            <span class="block text-[10px] text-slate-400">{{ cal.owner_name }}</span>
          </span>
          <!-- Link de booking -->
          <a
            v-if="cal.booking_enabled"
            :href="`/book/${cal.slug}`"
            target="_blank"
            class="ml-auto shrink-0 text-slate-300 hover:text-slate-500"
            title="Abrir página de reserva"
            @click.stop
          >
            <ExternalLink class="h-3 w-3" />
          </a>
        </button>
      </div>

      <div class="border-t border-slate-100 p-3">
        <button
          class="flex w-full items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-400 hover:border-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
          @click="router.push('/settings/calendars')"
        >
          <Plus class="h-3.5 w-3.5" /> Nuevo calendario
        </button>
      </div>
    </aside>

    <!-- ── Contenido principal ────────────────────────────────────────────── -->
    <div class="flex flex-1 flex-col overflow-hidden">

    <!-- ── Toolbar ─────────────────────────────────────────────────────────── -->
    <div class="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-6 py-3 shadow-toolbar">
      <!-- Nav arrows + title -->
      <div class="flex items-center gap-2">
        <button
          class="cursor-pointer rounded-md border border-slate-200 p-1.5 text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
          @click="prev"
        >
          <ChevronLeft class="h-4 w-4" />
        </button>
        <h2 class="min-w-[200px] text-center text-base font-semibold text-slate-800">{{ headerTitle }}</h2>
        <button
          class="cursor-pointer rounded-md border border-slate-200 p-1.5 text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
          @click="next"
        >
          <ChevronRight class="h-4 w-4" />
        </button>
      </div>

      <!-- Hoy -->
      <button
        class="cursor-pointer rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50"
        @click="goToday"
      >
        Hoy
      </button>

      <!-- View toggle -->
      <div class="flex overflow-hidden rounded-lg border border-slate-200">
        <button
          class="cursor-pointer px-3 py-1.5 text-sm font-medium transition-colors"
          :class="viewMode === 'month' ? 'bg-[#F69008] text-white' : 'bg-white text-slate-600 hover:bg-slate-50'"
          @click="viewMode = 'month'"
        >
          Mes
        </button>
        <button
          class="cursor-pointer border-l border-slate-200 px-3 py-1.5 text-sm font-medium transition-colors"
          :class="viewMode === 'week' ? 'bg-[#F69008] text-white' : 'bg-white text-slate-600 hover:bg-slate-50'"
          @click="viewMode = 'week'"
        >
          Semana
        </button>
      </div>

      <div class="ml-auto">
        <button
          class="flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#F69008] px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-[#F69008]/30 transition-all hover:bg-[#D97706]"
          @click="openNew()"
        >
          <Plus class="h-4 w-4" />
          Nueva cita
        </button>
      </div>
    </div>

    <!-- ── Month view ──────────────────────────────────────────────────────── -->
    <div v-if="viewMode === 'month'" class="flex flex-1 flex-col overflow-hidden bg-slate-50/40">
      <!-- Day headers -->
      <div class="grid grid-cols-7 border-b border-slate-200 bg-white">
        <div
          v-for="day in DAYS_ES"
          :key="day"
          class="py-2 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide"
        >
          {{ day }}
        </div>
      </div>

      <!-- Grid -->
      <div class="grid flex-1 grid-cols-7 overflow-auto" style="grid-auto-rows: minmax(110px, 1fr)">
        <div
          v-for="cell in calendarDays"
          :key="`${cell.year}-${cell.month}-${cell.day}`"
          class="cursor-pointer border-r border-b border-slate-200 p-1.5 transition-colors hover:bg-slate-50"
          :class="!cell.current ? 'bg-slate-50/60' : 'bg-white'"
          @click="openNew(`${cell.year}-${String(cell.month + 1).padStart(2, '0')}-${String(cell.day).padStart(2, '0')}`)"
        >
          <!-- Day number -->
          <div class="mb-1 flex justify-end">
            <span
              class="flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium"
              :class="[
                !cell.current ? 'text-slate-300' : 'text-slate-700',
                isToday(cell.year, cell.month, cell.day) ? 'bg-[#F69008] text-white font-bold' : ''
              ]"
            >
              {{ cell.day }}
            </span>
          </div>

          <!-- Chips: citas + tareas (max 3 total + overflow) -->
          <div class="space-y-0.5">
            <template v-for="a in appsForDay(cell.year, cell.month, cell.day).slice(0, 3)" :key="a.id">
              <div
                class="truncate rounded px-1.5 py-0.5 text-[11px] font-medium leading-tight cursor-pointer"
                :class="chipClass(a)"
                :style="chipStyle(a)"
                @click.stop="openEdit(a)"
              >
                <span v-if="!a.is_all_day">{{ fmtTime(a.start_at) }} </span>{{ a.title }}
                <span v-if="a.recurrence_type && a.recurrence_type !== 'none'" class="opacity-60 ml-0.5">↻</span>
              </div>
            </template>
            <template v-for="t in tasksForDay(cell.year, cell.month, cell.day).slice(0, Math.max(0, 3 - appsForDay(cell.year, cell.month, cell.day).length))" :key="'t-' + t.id">
              <div
                class="truncate rounded px-1.5 py-0.5 text-[11px] font-medium leading-tight"
                :class="taskChipClass(t)"
              >
                ✓ {{ t.title }}
              </div>
            </template>
            <div
              v-if="appsForDay(cell.year, cell.month, cell.day).length + tasksForDay(cell.year, cell.month, cell.day).length > 3"
              class="rounded px-1.5 py-0.5 text-[11px] font-medium text-slate-400"
            >
              +{{ appsForDay(cell.year, cell.month, cell.day).length + tasksForDay(cell.year, cell.month, cell.day).length - 3 }} más
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Week view ───────────────────────────────────────────────────────── -->
    <div v-else class="flex flex-1 flex-col overflow-hidden">
      <!-- Day columns header -->
      <div class="flex border-b border-slate-200 bg-white">
        <div class="w-16 flex-shrink-0 border-r border-slate-200"></div>
        <div
          v-for="d in weekDays"
          :key="d.toISOString()"
          class="flex flex-1 flex-col items-center py-2"
        >
          <span class="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {{ DAYS_ES[d.getDay()] }}
          </span>
          <span
            class="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold"
            :class="isToday(d.getFullYear(), d.getMonth(), d.getDate())
              ? 'bg-[#F69008] text-white'
              : 'text-slate-700'"
          >
            {{ d.getDate() }}
          </span>
        </div>
      </div>

      <!-- Time grid -->
      <div class="flex flex-1 overflow-auto">
        <div class="relative flex flex-1">
          <!-- Hour labels -->
          <div class="w-16 flex-shrink-0 border-r border-slate-300 bg-white">
            <div
              v-for="h in WEEK_HOURS"
              :key="h"
              class="flex h-14 items-start justify-end pr-2 pt-1"
            >
              <span class="text-[11px] font-medium text-slate-400">
                {{ String(h).padStart(2, '0') }}:00
              </span>
            </div>
          </div>

          <!-- Day columns -->
          <div class="flex flex-1">
            <div
              v-for="d in weekDays"
              :key="d.toISOString()"
              class="relative flex-1 border-r border-slate-300 cursor-pointer hover:bg-slate-50/50"
              :style="`height: ${WEEK_HOURS.length * 56}px`"
              @click="openNew(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`)"
            >
              <!-- Hour lines (media hora punteada, hora llena sólida) -->
              <div
                v-for="h in WEEK_HOURS"
                :key="h"
                class="absolute w-full border-t border-slate-200"
                :style="`top: ${(h - 7) * 56}px`"
              ></div>
              <div
                v-for="h in WEEK_HOURS"
                :key="'half-' + h"
                class="absolute w-full border-t border-slate-100 border-dashed"
                :style="`top: ${(h - 7) * 56 + 28}px`"
              ></div>

              <!-- Appointments -->
              <div
                v-for="a in appsForWeekDay(d)"
                :key="a.id"
                class="absolute left-0.5 right-0.5 overflow-hidden rounded px-1.5 py-0.5 text-[11px] font-medium cursor-pointer"
                :class="chipClass(a)"
                :style="`top: ${weekAppTop(a)}; height: ${weekAppHeight(a)}; ${Object.entries(chipStyle(a)).map(([k,v]) => k+':'+v).join(';')}`"
                @click.stop="openEdit(a)"
              >
                <span class="block truncate font-semibold">{{ a.title }}</span>
                <span class="block truncate opacity-75">{{ fmtTime(a.start_at) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Modal ──────────────────────────────────────────────────────────── -->
    <AppointmentModal
      v-model="showModal"
      :date="modalDate"
      :appointment="modalAppointment"
      @saved="onSaved"
      @deleted="onDeleted"
    />

    </div><!-- fin contenido principal -->
  </div><!-- fin flex root -->
</template>
