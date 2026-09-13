<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { ChevronLeft, ChevronRight, Plus, Settings, ExternalLink, CalendarDays } from 'lucide-vue-next';
import { useRouter } from 'vue-router';
import { api } from '../api';
import type { Appointment, Calendar } from '../types';
import AppointmentModal from '../components/AppointmentModal.vue';

const router = useRouter();

type ViewMode = 'month' | 'week';
const viewMode = ref<ViewMode>('month');

const today = new Date();
const curYear  = ref(today.getFullYear());
const curMonth = ref(today.getMonth());
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
    visibleCalIds.value = new Set(list.map(c => c.id));
  } catch { /* ignore */ }
}

function toggleCalendar(id: string) {
  if (visibleCalIds.value.has(id)) visibleCalIds.value.delete(id);
  else visibleCalIds.value.add(id);
  visibleCalIds.value = new Set(visibleCalIds.value);
}

function calColor(calendarId: string | null): string {
  if (!calendarId) return '#F69008';
  return calendars.value.find(c => c.id === calendarId)?.color ?? '#F69008';
}

// ─── Appointments + Tasks ─────────────────────────────────────────────────────
const allAppointments = ref<Appointment[]>([]);
const tasks = ref<{ id: string; title: string; due_at: string; status: string; priority: string }[]>([]);
const loading = ref(false);

const appointments = computed(() =>
  allAppointments.value.filter(a => !a.calendar_id || visibleCalIds.value.has(a.calendar_id))
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
  } finally { loading.value = false; }
}

onMounted(async () => {
  await loadCalendars();
  await loadMonth();
  clockTick = setInterval(() => { nowRef.value = new Date(); }, 60_000);
  if (viewMode.value === 'week') scrollToNow();
});
onUnmounted(() => clearInterval(clockTick));
watch([curMonth, curYear], loadMonth);
watch(weekStart, () => {
  if (viewMode.value === 'week') {
    curMonth.value = weekStart.value.getMonth();
    curYear.value  = weekStart.value.getFullYear();
  }
});

watch(viewMode, (v) => { if (v === 'week') scrollToNow(); });

// ─── Navigation ───────────────────────────────────────────────────────────────
const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DAYS_ES   = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

const headerTitle = computed(() => {
  if (viewMode.value === 'month') return `${MONTHS_ES[curMonth.value]} ${curYear.value}`;
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
    if (curMonth.value === 0) { curMonth.value = 11; curYear.value--; } else curMonth.value--;
  } else {
    const d = new Date(weekStart.value);
    d.setDate(d.getDate() - 7);
    weekStart.value = d;
  }
}
function next() {
  if (viewMode.value === 'month') {
    if (curMonth.value === 11) { curMonth.value = 0; curYear.value++; } else curMonth.value++;
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
  const cells: Array<{ year: number; month: number; day: number; current: boolean; weekend: boolean }> = [];

  const prevMonthDays = new Date(curYear.value, curMonth.value, 0).getDate();
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = prevMonthDays - i;
    const [y, m] = curMonth.value === 0 ? [curYear.value - 1, 11] : [curYear.value, curMonth.value - 1];
    const dow = new Date(y, m, d).getDay();
    cells.push({ year: y, month: m, day: d, current: false, weekend: dow === 0 || dow === 6 });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(curYear.value, curMonth.value, d).getDay();
    cells.push({ year: curYear.value, month: curMonth.value, day: d, current: true, weekend: dow === 0 || dow === 6 });
  }
  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    const [y, m] = curMonth.value === 11 ? [curYear.value + 1, 0] : [curYear.value, curMonth.value + 1];
    const dow = new Date(y, m, d).getDay();
    cells.push({ year: y, month: m, day: d, current: false, weekend: dow === 0 || dow === 6 });
  }
  return cells;
});

function mkDateStr(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

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
function isToday(y: number, m: number, d: number): boolean {
  return y === today.getFullYear() && m === today.getMonth() && d === today.getDate();
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function apptChipStyle(a: Appointment) {
  if (a.status === 'completed') return { bg: '#d1fae5', dot: '#10b981', text: '#065f46' };
  if (a.status === 'cancelled' || a.status === 'no_show') return { bg: '#f1f5f9', dot: '#94a3b8', text: '#94a3b8' };
  const c = calColor(a.calendar_id);
  return { bg: c + '1a', dot: c, text: c };
}

function taskChipStyle(t: { status: string; priority: string }) {
  if (t.status === 'done')      return { bg: '#d1fae5', dot: '#10b981', text: '#065f46' };
  if (t.status === 'cancelled') return { bg: '#f1f5f9', dot: '#94a3b8', text: '#94a3b8' };
  if (t.priority === 'high')    return { bg: '#fee2e2', dot: '#ef4444', text: '#991b1b' };
  return { bg: '#ede9fe', dot: '#8b5cf6', text: '#5b21b6' };
}

// ─── Week view ────────────────────────────────────────────────────────────────
const WEEK_HOURS = Array.from({ length: 16 }, (_, i) => i + 7);
const weekDays = computed<Date[]>(() =>
  Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart.value);
    d.setDate(d.getDate() + i);
    return d;
  })
);

// Solo citas con hora (no todo-el-día) → van en la cuadrícula de tiempo
function appsForWeekDay(date: Date): Appointment[] {
  return appointments.value.filter(a =>
    !a.is_all_day &&
    isSameDay(a.start_at, date.getFullYear(), date.getMonth(), date.getDate())
  );
}

// Citas de todo-el-día + tareas → van en la fila superior de la semana
function allDayItemsForWeekDay(date: Date) {
  const y = date.getFullYear(), m = date.getMonth(), d = date.getDate();
  const allDayApps = appointments.value.filter(a => a.is_all_day && isSameDay(a.start_at, y, m, d));
  const dayTasks   = tasks.value.filter(t => t.due_at && isSameDay(t.due_at, y, m, d));
  return { allDayApps, dayTasks };
}
function weekAppTop(a: Appointment): string {
  const d = new Date(a.start_at);
  const minutes = (d.getHours() - 7) * 60 + d.getMinutes();
  return `${(minutes / 60) * 64}px`;
}
function weekAppHeight(a: Appointment): string {
  const start = new Date(a.start_at);
  const end   = new Date(a.end_at);
  const mins  = Math.max(15, (end.getTime() - start.getTime()) / 60000);
  return `${(mins / 60) * 64 - 2}px`;
}

// ─── Hora actual (indicador en grid de semana) ───────────────────────────────
const nowRef  = ref(new Date());
const nowTop  = computed(() => {
  const mins = (nowRef.value.getHours() - 7) * 60 + nowRef.value.getMinutes();
  return `${Math.max(0, (mins / 60) * 64)}px`;
});
const nowVisible = computed(() => {
  const h = nowRef.value.getHours();
  return h >= 7 && h < 23;
});
const timeGridEl = ref<HTMLElement | null>(null);

let clockTick: ReturnType<typeof setInterval>;

function scrollToNow() {
  nextTick(() => {
    if (!timeGridEl.value) return;
    const mins = (nowRef.value.getHours() - 7) * 60 + nowRef.value.getMinutes();
    timeGridEl.value.scrollTop = Math.max(0, (mins / 60) * 64 - 140);
  });
}

// ─── Modal ────────────────────────────────────────────────────────────────────
const showModal        = ref(false);
const modalDate        = ref<string | undefined>();
const modalAppointment = ref<Appointment | undefined>();

function openNew(ds?: string) { modalDate.value = ds; modalAppointment.value = undefined; showModal.value = true; }
function openEdit(a: Appointment) { modalDate.value = undefined; modalAppointment.value = a; showModal.value = true; }
function onSaved()   { loadMonth(); }
function onDeleted() { loadMonth(); }
</script>

<template>
  <div class="flex h-full overflow-hidden bg-slate-50">

    <!-- ── Sidebar ──────────────────────────────────────────────────────────── -->
    <aside class="hidden md:flex w-60 shrink-0 flex-col bg-white border-r border-slate-200/80">

      <!-- Encabezado -->
      <div class="flex items-center justify-between px-4 pt-5 pb-3">
        <div class="flex items-center gap-2">
          <CalendarDays class="h-4 w-4 text-slate-400" />
          <span class="text-xs font-bold uppercase tracking-widest text-slate-400">Calendarios</span>
        </div>
        <button
          class="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          title="Gestionar calendarios"
          @click="router.push('/settings/calendars')"
        >
          <Settings class="h-3.5 w-3.5" />
        </button>
      </div>

      <!-- Lista de calendarios -->
      <div class="flex-1 overflow-y-auto px-2 space-y-0.5 pb-4">
        <button
          v-for="cal in calendars"
          :key="cal.id"
          class="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all cursor-pointer hover:bg-slate-50"
          :class="visibleCalIds.has(cal.id) ? '' : 'opacity-40'"
          @click="toggleCalendar(cal.id)"
        >
          <!-- Avatar: logo o inicial coloreada -->
          <div
            class="relative h-9 w-9 shrink-0 rounded-xl overflow-hidden flex items-center justify-center text-sm font-bold flex-none"
            :style="`background: ${cal.color}22`"
          >
            <img v-if="(cal as any).logo_url" :src="(cal as any).logo_url"
              class="h-full w-full object-cover" alt="" />
            <span v-else :style="`color: ${cal.color}`">{{ cal.name[0].toUpperCase() }}</span>
            <!-- Punto de estado de visibilidad -->
            <span
              class="absolute bottom-0.5 right-0.5 h-2 w-2 rounded-full border border-white"
              :style="`background: ${visibleCalIds.has(cal.id) ? cal.color : '#cbd5e1'}`"
            ></span>
          </div>

          <!-- Nombre y dueño -->
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-semibold leading-tight"
              :class="visibleCalIds.has(cal.id) ? 'text-slate-800' : 'text-slate-500'">
              {{ cal.name }}
            </p>
            <p class="truncate text-[11px] text-slate-400 mt-0.5">{{ cal.owner_name }}</p>
          </div>

          <!-- Link de reserva -->
          <a
            v-if="cal.booking_enabled"
            :href="`/book/${cal.slug}`"
            target="_blank"
            class="shrink-0 text-slate-300 hover:text-[#F69008] transition-colors opacity-0 group-hover:opacity-100"
            title="Abrir página de reserva"
            @click.stop
          >
            <ExternalLink class="h-3.5 w-3.5" />
          </a>
        </button>
      </div>

      <!-- Nuevo calendario -->
      <div class="border-t border-slate-100 p-3">
        <button
          class="flex w-full items-center gap-2 rounded-xl border border-dashed border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-400 hover:border-[#F69008]/50 hover:text-[#F69008] hover:bg-[#F69008]/5 transition-all cursor-pointer"
          @click="router.push('/settings/calendars')"
        >
          <Plus class="h-3.5 w-3.5" />
          Nuevo calendario
        </button>
      </div>
    </aside>

    <!-- ── Contenido principal ────────────────────────────────────────────── -->
    <div class="flex flex-1 flex-col overflow-hidden">

      <!-- ── Toolbar ────────────────────────────────────────────────────────── -->
      <div class="flex flex-wrap items-center gap-3 border-b border-slate-200/80 bg-white px-6 py-3">
        <div class="flex items-center gap-1.5">
          <button
            class="cursor-pointer rounded-lg border border-slate-200 p-1.5 text-slate-500 transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800"
            @click="prev"
          >
            <ChevronLeft class="h-4 w-4" />
          </button>
          <h2 class="min-w-[180px] text-center text-base font-bold text-slate-800 capitalize">
            {{ headerTitle }}
          </h2>
          <button
            class="cursor-pointer rounded-lg border border-slate-200 p-1.5 text-slate-500 transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800"
            @click="next"
          >
            <ChevronRight class="h-4 w-4" />
          </button>
        </div>

        <button
          class="cursor-pointer rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800"
          @click="goToday"
        >
          Hoy
        </button>

        <!-- Toggle mes/semana: estilo pill segmentado -->
        <div class="flex overflow-hidden rounded-lg border border-slate-200 bg-slate-50 p-0.5 gap-0.5">
          <button
            class="cursor-pointer rounded-md px-4 py-1.5 text-sm font-semibold transition-all"
            :class="viewMode === 'month'
              ? 'bg-white text-slate-800 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'"
            @click="viewMode = 'month'"
          >
            Mes
          </button>
          <button
            class="cursor-pointer rounded-md px-4 py-1.5 text-sm font-semibold transition-all"
            :class="viewMode === 'week'
              ? 'bg-white text-slate-800 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'"
            @click="viewMode = 'week'"
          >
            Semana
          </button>
        </div>

        <div class="ml-auto">
          <button
            class="flex cursor-pointer items-center gap-2 rounded-xl bg-[#F69008] px-4 py-2 text-sm font-bold text-white shadow-sm shadow-[#F69008]/25 transition-all hover:bg-[#D97706] active:scale-95"
            @click="openNew()"
          >
            <Plus class="h-4 w-4" />
            Nueva cita
          </button>
        </div>
      </div>

      <!-- ── Vista mes ─────────────────────────────────────────────────────── -->
      <div v-if="viewMode === 'month'" class="flex flex-1 flex-col overflow-hidden">
        <!-- Cabecera días -->
        <div class="grid grid-cols-7 bg-white border-b border-slate-200/80">
          <div
            v-for="(day, idx) in DAYS_ES"
            :key="day"
            class="py-2.5 text-center text-[11px] font-bold uppercase tracking-widest"
            :class="idx === 0 || idx === 6 ? 'text-slate-400' : 'text-slate-500'"
          >
            {{ day }}
          </div>
        </div>

        <!-- Grid -->
        <div class="grid flex-1 grid-cols-7 overflow-auto" style="grid-auto-rows: minmax(110px, 1fr)">
          <div
            v-for="cell in calendarDays"
            :key="`${cell.year}-${cell.month}-${cell.day}`"
            class="group relative border-r border-b border-slate-200/80 p-2 transition-colors cursor-pointer"
            :class="[
              !cell.current
                ? 'bg-slate-50/80'
                : cell.weekend
                  ? 'bg-white hover:bg-slate-50/60'
                  : 'bg-white hover:bg-slate-50/80',
              isToday(cell.year, cell.month, cell.day) ? '!bg-orange-50/50' : '',
            ]"
            @click="openNew(mkDateStr(cell.year, cell.month, cell.day))"
          >
            <!-- Número + botón + en hover -->
            <div class="mb-1.5 flex items-center justify-between">
              <span
                class="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold"
                :class="[
                  !cell.current ? 'text-slate-300' : cell.weekend ? 'text-slate-500' : 'text-slate-700',
                  isToday(cell.year, cell.month, cell.day) ? '!bg-[#F69008] !text-white' : '',
                ]"
              >
                {{ cell.day }}
              </span>
              <button
                class="opacity-0 group-hover:opacity-100 flex h-5 w-5 items-center justify-center rounded-md text-slate-400 hover:text-[#F69008] hover:bg-[#F69008]/10 transition-all"
                @click.stop="openNew(mkDateStr(cell.year, cell.month, cell.day))"
              >
                <Plus class="h-3 w-3" />
              </button>
            </div>

            <!-- Chips -->
            <div class="space-y-[3px]">
              <template v-for="a in appsForDay(cell.year, cell.month, cell.day).slice(0, 3)" :key="a.id">
                <div
                  class="flex items-center gap-1.5 rounded-lg px-2 py-[3px] text-[11px] font-semibold leading-tight cursor-pointer transition-all hover:brightness-95 truncate"
                  :class="a.status === 'cancelled' || a.status === 'no_show' ? 'line-through opacity-60' : ''"
                  :style="`background:${apptChipStyle(a).bg}; color:${apptChipStyle(a).text}`"
                  @click.stop="openEdit(a)"
                >
                  <span class="h-1.5 w-1.5 shrink-0 flex-none rounded-full"
                    :style="`background:${apptChipStyle(a).dot}`"></span>
                  <span class="truncate">
                    <span v-if="!a.is_all_day" class="opacity-70">{{ fmtTime(a.start_at) }} </span>{{ a.title }}
                    <span v-if="a.recurrence_type && a.recurrence_type !== 'none'" class="opacity-50 ml-0.5">↻</span>
                  </span>
                </div>
              </template>

              <template v-for="t in tasksForDay(cell.year, cell.month, cell.day).slice(0, Math.max(0, 3 - appsForDay(cell.year, cell.month, cell.day).length))" :key="'t-' + t.id">
                <div
                  class="flex items-center gap-1.5 rounded-lg px-2 py-[3px] text-[11px] font-semibold leading-tight truncate"
                  :class="t.status === 'done' || t.status === 'cancelled' ? 'line-through opacity-60' : ''"
                  :style="`background:${taskChipStyle(t).bg}; color:${taskChipStyle(t).text}`"
                >
                  <span class="h-1.5 w-1.5 shrink-0 flex-none rounded-full"
                    :style="`background:${taskChipStyle(t).dot}`"></span>
                  <span class="truncate">{{ t.title }}</span>
                </div>
              </template>

              <div
                v-if="appsForDay(cell.year, cell.month, cell.day).length + tasksForDay(cell.year, cell.month, cell.day).length > 3"
                class="px-2 py-[2px] text-[10px] font-bold text-slate-400 hover:text-slate-600 cursor-pointer transition-colors"
              >
                +{{ appsForDay(cell.year, cell.month, cell.day).length + tasksForDay(cell.year, cell.month, cell.day).length - 3 }} más
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Vista semana ───────────────────────────────────────────────────── -->
      <div v-else class="flex flex-1 flex-col overflow-hidden">
        <!-- Cabecera columnas -->
        <div class="flex border-b border-slate-200/80 bg-white">
          <div class="w-16 shrink-0 border-r border-slate-200/80"></div>
          <div
            v-for="d in weekDays"
            :key="d.toISOString()"
            class="flex flex-1 flex-col items-center py-2.5"
            :class="d.getDay() === 0 || d.getDay() === 6 ? 'bg-slate-50/60' : ''"
          >
            <span class="text-[10px] font-bold uppercase tracking-widest"
              :class="d.getDay() === 0 || d.getDay() === 6 ? 'text-slate-400' : 'text-slate-500'">
              {{ DAYS_ES[d.getDay()] }}
            </span>
            <span
              class="mt-1 flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold transition-all"
              :class="isToday(d.getFullYear(), d.getMonth(), d.getDate())
                ? 'bg-[#F69008] text-white shadow-sm shadow-[#F69008]/40'
                : 'text-slate-700'"
            >
              {{ d.getDate() }}
            </span>
          </div>
        </div>

        <!-- Fila "Todo el día": citas all-day + tareas (scroll interno) -->
        <div class="flex border-b border-slate-200/80 bg-slate-50/30">
          <!-- Etiqueta fija -->
          <div class="w-16 shrink-0 border-r border-slate-200/80 flex items-center justify-center self-stretch py-2">
            <span class="text-[9px] font-bold uppercase tracking-widest text-slate-400">Todo día</span>
          </div>
          <!-- Columnas de días con scroll vertical cuando hay muchos ítems -->
          <div class="flex flex-1 max-h-24 overflow-y-auto min-h-[34px]">
            <div
              v-for="d in weekDays"
              :key="d.toISOString()"
              class="flex-1 border-r border-slate-200/80 p-1 space-y-[2px] min-w-0"
              :class="d.getDay() === 0 || d.getDay() === 6 ? 'bg-slate-50/50' : ''"
            >
              <div
                v-for="a in allDayItemsForWeekDay(d).allDayApps"
                :key="a.id"
                class="flex items-center gap-1 rounded-md px-1.5 py-[2px] text-[10px] font-semibold truncate cursor-pointer hover:brightness-95"
                :style="`background:${apptChipStyle(a).bg}; color:${apptChipStyle(a).text}`"
                @click.stop="openEdit(a)"
              >
                <span class="h-1.5 w-1.5 shrink-0 flex-none rounded-full" :style="`background:${apptChipStyle(a).dot}`"></span>
                <span class="truncate">{{ a.title }}</span>
              </div>
              <div
                v-for="t in allDayItemsForWeekDay(d).dayTasks"
                :key="'t-' + t.id"
                class="flex items-center gap-1 rounded-md px-1.5 py-[2px] text-[10px] font-semibold truncate"
                :class="t.status === 'done' || t.status === 'cancelled' ? 'line-through opacity-50' : ''"
                :style="`background:${taskChipStyle(t).bg}; color:${taskChipStyle(t).text}`"
              >
                <span class="h-1.5 w-1.5 shrink-0 flex-none rounded-full" :style="`background:${taskChipStyle(t).dot}`"></span>
                <span class="truncate">{{ t.title }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Grid de tiempo -->
        <div ref="timeGridEl" class="flex flex-1 overflow-auto">
          <div class="relative flex flex-1">
            <!-- Etiquetas de hora -->
            <div class="w-16 shrink-0 border-r border-slate-200/80 bg-white sticky left-0 z-10">
              <div v-for="h in WEEK_HOURS" :key="h" class="flex h-16 items-start justify-end pr-3 pt-1.5">
                <span class="text-[10px] font-semibold tabular-nums"
                  :class="isToday(nowRef.getFullYear(), nowRef.getMonth(), nowRef.getDate()) && h === nowRef.getHours() ? 'text-red-500' : 'text-slate-400'">
                  {{ String(h).padStart(2, '0') }}:00
                </span>
              </div>
            </div>

            <!-- Columnas de días -->
            <div class="flex flex-1">
              <div
                v-for="d in weekDays"
                :key="d.toISOString()"
                class="relative flex-1 border-r border-slate-200/80 cursor-pointer hover:bg-blue-50/20 transition-colors"
                :class="d.getDay() === 0 || d.getDay() === 6 ? 'bg-slate-50/40' : 'bg-white'"
                :style="`height: ${WEEK_HOURS.length * 64}px`"
                @click="openNew(mkDateStr(d.getFullYear(), d.getMonth(), d.getDate()))"
              >
                <!-- Líneas de hora (sólidas) y media hora (punteadas) -->
                <div v-for="h in WEEK_HOURS" :key="h"
                  class="absolute w-full border-t"
                  :class="h === 12 ? 'border-slate-300/80' : 'border-slate-200/60'"
                  :style="`top:${(h - 7) * 64}px`"></div>
                <div v-for="h in WEEK_HOURS" :key="'hh-' + h"
                  class="absolute w-full border-t border-slate-100/80 border-dashed"
                  :style="`top:${(h - 7) * 64 + 32}px`"></div>

                <!-- Indicador de hora actual -->
                <div
                  v-if="isToday(d.getFullYear(), d.getMonth(), d.getDate()) && nowVisible"
                  class="absolute left-0 right-0 z-20 flex items-center pointer-events-none"
                  :style="`top: ${nowTop}`"
                >
                  <div class="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500 border-2 border-white shadow-sm -ml-1"></div>
                  <div class="flex-1 border-t-2 border-red-500 opacity-80"></div>
                </div>

                <!-- Citas con hora -->
                <div
                  v-for="a in appsForWeekDay(d)"
                  :key="a.id"
                  class="absolute left-1 right-1 overflow-hidden rounded-xl px-2.5 py-1.5 cursor-pointer transition-all hover:brightness-95 hover:shadow-md z-10"
                  :class="a.status === 'cancelled' || a.status === 'no_show' ? 'opacity-50 line-through' : ''"
                  :style="`
                    top:${weekAppTop(a)};
                    height:${weekAppHeight(a)};
                    background:${apptChipStyle(a).bg};
                    border-left:3px solid ${apptChipStyle(a).dot};
                  `"
                  @click.stop="openEdit(a)"
                >
                  <span class="block truncate text-[11px] font-bold leading-tight"
                    :style="`color:${apptChipStyle(a).text}`">{{ a.title }}</span>
                  <span class="block truncate text-[10px] opacity-70 mt-0.5"
                    :style="`color:${apptChipStyle(a).text}`">{{ fmtTime(a.start_at) }}</span>
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

    </div>
  </div>
</template>
