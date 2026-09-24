<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { ChevronLeft, ChevronRight, Plus, Settings, ExternalLink, CalendarDays, Ban, X } from 'lucide-vue-next';
import { useRouter } from 'vue-router';
import { api } from '../api';
import { useAuthStore } from '../stores/auth';
import type { Appointment, Calendar } from '../types';
import AppointmentModal from '../components/AppointmentModal.vue';
import BlockTimeModal from '../components/BlockTimeModal.vue';

const router = useRouter();
const auth   = useAuthStore();

type ViewMode = 'month' | 'week';
const viewMode = ref<ViewMode>('month');
const showMobileSidebar = ref(false);

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
    // Admin ve todos los calendarios de la org; el resto solo los propios.
    const endpoint = (auth.isAdmin || auth.can('view_all_calendars')) ? '/calendars' : '/calendars/mine';
    const list = await api.get<Calendar[]>(endpoint);
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

// ─── Appointments + Tasks + Google Events ────────────────────────────────────
interface GoogleEvent {
  id: string; title: string; startAt: string; endAt: string;
  isAllDay: boolean; meetLink?: string; htmlLink: string;
}

const allAppointments = ref<Appointment[]>([]);
const tasks = ref<{ id: string; title: string; due_at: string; status: string; priority: string }[]>([]);
const googleEvents    = ref<GoogleEvent[]>([]);
const loading = ref(false);

const appointments = computed(() =>
  allAppointments.value.filter(a => !a.calendar_id || visibleCalIds.value.has(a.calendar_id))
);

// IDs de Google events que ya están sincronizados como cita CRM (para no duplicar)
const knownGoogleIds = computed(() =>
  new Set(allAppointments.value.map(a => (a as any).provider_event_id).filter(Boolean))
);

async function loadMonth() {
  loading.value = true;
  try {
    const m = curMonth.value + 1;
    const y = curYear.value;
    const start = new Date(y, m - 1, 1).toISOString();
    const end   = new Date(y, m, 1).toISOString();
    [allAppointments.value, tasks.value, googleEvents.value] = await Promise.all([
      api.get<Appointment[]>(`/appointments?month=${m}&year=${y}`),
      api.get<{ id: string; title: string; due_at: string; status: string; priority: string }[]>(
        `/tasks?month=${m}&year=${y}`
      ).catch(() => []),
      api.get<GoogleEvent[]>(`/appointments/google-events?start=${start}&end=${end}`).catch(() => []),
    ]);
  } finally { loading.value = false; }
}

function googleEventsForDay(y: number, m: number, d: number): GoogleEvent[] {
  return googleEvents.value.filter(e =>
    !e.isAllDay && !knownGoogleIds.value.has(e.id) && isSameDay(e.startAt, y, m, d)
  );
}
function googleEventsAllDayForDay(y: number, m: number, d: number): GoogleEvent[] {
  return googleEvents.value.filter(e =>
    e.isAllDay && !knownGoogleIds.value.has(e.id) && isSameDay(e.startAt, y, m, d)
  );
}
function googleEventsForWeekDay(date: Date): GoogleEvent[] {
  return googleEvents.value.filter(e =>
    !e.isAllDay && !knownGoogleIds.value.has(e.id) &&
    isSameDay(e.startAt, date.getFullYear(), date.getMonth(), date.getDate())
  );
}
function weekGoogleTop(e: GoogleEvent): string {
  const d = new Date(e.startAt);
  return `${((d.getHours() - 6) * 60 + d.getMinutes()) / 60 * 64}px`;
}
function weekGoogleHeight(e: GoogleEvent): string {
  const mins = Math.max(15, (new Date(e.endAt).getTime() - new Date(e.startAt).getTime()) / 60000);
  return `${(mins / 60) * 64 - 2}px`;
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
  const c = calColor(a.calendar_id);
  if (a.status === 'blocked')   return { bg: '#f1f5f9', dot: '#94a3b8', text: '#64748b', outline: false };
  if (a.status === 'completed') return { bg: '#10b981', dot: '#10b981', text: '#ffffff', outline: false };
  if (a.status === 'cancelled' || a.status === 'no_show')
    return { bg: '#ffffff',   dot: c,         text: c,         outline: true };
  return                               { bg: c,         dot: c,         text: '#ffffff',  outline: false };
}

function weekBlockStyle(a: Appointment): string {
  if (a.status !== 'blocked') return '';
  return 'repeating-linear-gradient(135deg,#f1f5f9 0px,#f1f5f9 6px,#e2e8f0 6px,#e2e8f0 12px)';
}

function taskChipStyle(t: { status: string; priority: string }) {
  if (t.status === 'done')      return { bg: '#d1fae5', dot: '#10b981', text: '#065f46' };
  if (t.status === 'cancelled') return { bg: '#f1f5f9', dot: '#94a3b8', text: '#94a3b8' };
  if (t.priority === 'high')    return { bg: '#fee2e2', dot: '#ef4444', text: '#991b1b' };
  return { bg: '#ede9fe', dot: '#8b5cf6', text: '#5b21b6' };
}

// ─── Week view ────────────────────────────────────────────────────────────────
const WEEK_HOURS = Array.from({ length: 18 }, (_, i) => i + 6);
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
  const minutes = (d.getHours() - 6) * 60 + d.getMinutes();
  return `${(minutes / 60) * 64}px`;
}
function weekAppHeight(a: Appointment): string {
  const start = new Date(a.start_at);
  const end   = new Date(a.end_at);
  const mins  = Math.max(15, (end.getTime() - start.getTime()) / 60000);
  return `${(mins / 60) * 64 - 2}px`;
}

// ─── Layout de columnas para eventos superpuestos ─────────────────────────────
type AppWithLayout    = Appointment  & { _col: number; _totalCols: number };
type GoogleWithLayout = GoogleEvent  & { _col: number; _totalCols: number };

function computeUnifiedLayout(
  apps: Appointment[],
  googleEvts: GoogleEvent[],
): { appsLayout: AppWithLayout[]; googleLayout: GoogleWithLayout[] } {
  // Normalizar ambos tipos a un item genérico
  type Item = { key: string; start: number; end: number };
  const items: Item[] = [
    ...apps.map(a => ({ key: a.id, start: new Date(a.start_at).getTime(), end: new Date(a.end_at).getTime() })),
    ...googleEvts.map(g => ({ key: 'g::' + g.id, start: new Date(g.startAt).getTime(), end: new Date(g.endAt).getTime() })),
  ];
  const colOf      = new Map<string, number>();
  const totalColOf = new Map<string, number>();
  if (items.length) {
    const sorted = [...items].sort((a, b) => a.start - b.start);
    let i = 0;
    while (i < sorted.length) {
      const cluster = [sorted[i]];
      let maxEnd = sorted[i].end;
      let j = i + 1;
      while (j < sorted.length && sorted[j].start < maxEnd) {
        maxEnd = Math.max(maxEnd, sorted[j].end);
        cluster.push(sorted[j]);
        j++;
      }
      const colEnds: number[] = [];
      for (const item of cluster) {
        let col = colEnds.findIndex(end => end <= item.start);
        if (col === -1) { col = colEnds.length; colEnds.push(0); }
        colEnds[col] = item.end;
        colOf.set(item.key, col);
      }
      const totalCols = colEnds.length;
      for (const item of cluster) totalColOf.set(item.key, totalCols);
      i = j;
    }
  }
  return {
    appsLayout:   apps.map(a => ({ ...a, _col: colOf.get(a.id) ?? 0,         _totalCols: totalColOf.get(a.id) ?? 1 })),
    googleLayout: googleEvts.map(g => ({ ...g, _col: colOf.get('g::' + g.id) ?? 0, _totalCols: totalColOf.get('g::' + g.id) ?? 1 })),
  };
}

// weekData precalcula layout unificado (CRM + Google) por día
const weekData = computed(() =>
  weekDays.value.map(date => {
    const apps   = appsForWeekDay(date);
    const google = googleEventsForWeekDay(date);
    const { appsLayout, googleLayout } = computeUnifiedLayout(apps, google);
    return { date, dayApps: appsLayout, dayGoogle: googleLayout };
  })
);

function slotStyle(col: number, n: number): { leftVal: string; widthVal: string } {
  const slotPct = (100 / n).toFixed(3);
  const leftPct = (col / n * 100).toFixed(3);
  return {
    leftVal:  col === 0 ? '4px' : `calc(${leftPct}% + 2px)`,
    widthVal: n === 1 ? 'calc(100% - 8px)'
      : (col === 0 || col === n - 1) ? `calc(${slotPct}% - 6px)`
      : `calc(${slotPct}% - 4px)`,
  };
}

function weekAppStyleLayout(a: AppWithLayout): string {
  const { _col: col, _totalCols: n } = a;
  const chip = apptChipStyle(a);
  const border = chip.outline
    ? `border:1.5px solid ${chip.dot};border-left:3px solid ${chip.dot}`
    : `border-left:3px solid ${chip.dot}`;

  // left + width (más predecible que left + right en todos los navegadores)
  const slotPct  = (100 / n).toFixed(3);
  const leftPct  = (col / n * 100).toFixed(3);
  const { leftVal, widthVal } = slotStyle(col, n);
  return [
    `top:${weekAppTop(a)}`,
    `height:${weekAppHeight(a)}`,
    `left:${leftVal}`,
    `width:${widthVal}`,
    `background:${weekBlockStyle(a) || chip.bg}`,
    border,
  ].join(';');
}

function weekGoogleStyleLayout(ge: GoogleWithLayout): string {
  const { leftVal, widthVal } = slotStyle(ge._col, ge._totalCols);
  return [
    `top:${weekGoogleTop(ge)}`,
    `height:${weekGoogleHeight(ge)}`,
    `left:${leftVal}`,
    `width:${widthVal}`,
    `background:#4285F410`,
    `border-left:3px solid #4285F4`,
  ].join(';');
}

// ─── Hora actual (indicador en grid de semana) ───────────────────────────────
const nowRef  = ref(new Date());
const nowTop  = computed(() => {
  const mins = (nowRef.value.getHours() - 6) * 60 + nowRef.value.getMinutes();
  return `${Math.max(0, (mins / 60) * 64)}px`;
});
const nowVisible = computed(() => {
  const h = nowRef.value.getHours();
  return h >= 6 && h < 24;
});
const timeGridEl = ref<HTMLElement | null>(null);

let clockTick: ReturnType<typeof setInterval>;

function scrollToNow() {
  nextTick(() => {
    if (!timeGridEl.value) return;
    const mins = (nowRef.value.getHours() - 6) * 60 + nowRef.value.getMinutes();
    timeGridEl.value.scrollTop = Math.max(0, (mins / 60) * 64 - 140);
  });
}

// ─── Modal cita ───────────────────────────────────────────────────────────────
const showModal        = ref(false);
const modalDate        = ref<string | undefined>();
const modalStartTime   = ref<string | undefined>();
const modalAppointment = ref<Appointment | undefined>();

function openNew(ds?: string, st?: string) {
  modalDate.value      = ds;
  modalStartTime.value = st;
  modalAppointment.value = undefined;
  showModal.value = true;
}
function openEdit(a: Appointment) { modalDate.value = undefined; modalStartTime.value = undefined; modalAppointment.value = a; showModal.value = true; }
function onSaved()   { loadMonth(); }
function onDeleted() { loadMonth(); }

// ─── Modal bloquear hora ──────────────────────────────────────────────────────
const showBlockModal   = ref(false);
const blockDate        = ref<string | undefined>();
const blockStartTime   = ref<string | undefined>();

function openBlock(ds?: string, startTime?: string) {
  blockDate.value      = ds;
  blockStartTime.value = startTime;
  showBlockModal.value = true;
}

// Calcular hora desde la posición Y del click en el grid de semana
function onWeekGridClick(e: MouseEvent, date: Date) {
  const target     = e.currentTarget as HTMLElement;
  const rect       = target.getBoundingClientRect();
  const y          = e.clientY - rect.top;
  const totalMins  = Math.round((y / 64) * 60) + 6 * 60;
  const rounded    = Math.round(totalMins / 30) * 30;
  const h  = Math.floor(rounded / 60) % 24;
  const m  = rounded % 60;
  const st = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const ds = mkDateStr(date.getFullYear(), date.getMonth(), date.getDate());
  openNew(ds, st);
}

// Formato 12 horas para las etiquetas del grid
function fmtHour(h: number): string {
  if (h === 0 || h === 24) return '12AM';
  if (h === 12) return '12PM';
  return h < 12 ? `${h}AM` : `${h - 12}PM`;
}

// Navegar a la vista semana enfocada en un día concreto
function goToWeekDay(year: number, month: number, day: number) {
  weekStart.value = getWeekStart(new Date(year, month, day));
  viewMode.value  = 'week';
}
</script>

<template>
  <div class="flex h-full overflow-hidden bg-slate-50">

    <!-- ── Sidebar ──────────────────────────────────────────────────────────── -->
    <!-- Backdrop móvil sidebar calendarios -->
    <div v-if="showMobileSidebar" class="fixed inset-0 z-40 bg-black/30 md:hidden" @click="showMobileSidebar = false" />

    <aside
      class="w-56 shrink-0 flex-col bg-white border-r border-slate-200"
      :class="showMobileSidebar ? 'flex fixed inset-y-0 left-0 z-50 shadow-2xl' : 'hidden md:flex'"
    >

      <!-- Encabezado -->
      <div class="flex items-center justify-between px-4 pt-5 pb-3">
        <div class="flex items-center gap-2">
          <CalendarDays class="h-3.5 w-3.5 text-slate-400" />
          <span class="text-[11px] font-bold uppercase tracking-widest text-slate-400">Calendarios</span>
        </div>
        <div class="flex items-center gap-1">
          <button
            class="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            title="Gestionar calendarios"
            @click="router.push('/settings/calendars')"
          >
            <Settings class="h-3.5 w-3.5" />
          </button>
          <button
            class="md:hidden rounded-lg p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            title="Cerrar"
            @click="showMobileSidebar = false"
          >
            <X class="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <!-- Lista de calendarios -->
      <div class="flex-1 overflow-y-auto px-2 space-y-0.5 pb-4">
        <button
          v-for="cal in calendars"
          :key="cal.id"
          class="group flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-all cursor-pointer hover:bg-slate-50"
          :class="visibleCalIds.has(cal.id) ? '' : 'opacity-40'"
          @click="toggleCalendar(cal.id)"
        >
          <!-- Avatar: logo o inicial coloreada -->
          <div
            class="relative h-8 w-8 shrink-0 rounded-lg overflow-hidden flex items-center justify-center text-sm font-bold flex-none"
            :style="`background: ${cal.color}22`"
          >
            <img v-if="(cal as any).logo_url" :src="(cal as any).logo_url"
              class="h-full w-full object-cover" alt="" />
            <span v-else class="text-xs font-bold" :style="`color: ${cal.color}`">{{ cal.name[0].toUpperCase() }}</span>
            <!-- Punto de estado de visibilidad -->
            <span
              class="absolute bottom-0.5 right-0.5 h-1.5 w-1.5 rounded-full border border-white"
              :style="`background: ${visibleCalIds.has(cal.id) ? cal.color : '#cbd5e1'}`"
            ></span>
          </div>

          <!-- Nombre y dueño -->
          <div class="min-w-0 flex-1">
            <p class="truncate text-[13px] font-semibold leading-tight"
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
          class="flex w-full items-center gap-2 rounded-lg border border-dashed border-slate-200 px-3 py-2 text-xs font-semibold text-slate-400 hover:border-[#F69008]/50 hover:text-[#F69008] hover:bg-[#F69008]/5 transition-all cursor-pointer"
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
      <div class="page-toolbar">
        <!-- Botón calendarios móvil -->
        <button class="md:hidden btn btn-secondary btn-sm !px-2" @click="showMobileSidebar = true" title="Calendarios">
          <CalendarDays class="h-4 w-4" />
        </button>

        <!-- Título + subtítulo -->
        <div class="hidden sm:flex flex-col justify-center mr-1">
          <span class="font-semibold text-slate-900 text-[15px] leading-tight capitalize">{{ headerTitle }}</span>
          <span class="text-[12px] text-slate-400 leading-tight">Calendario</span>
        </div>

        <div class="hidden sm:block mx-1 h-5 w-px bg-slate-200"></div>

        <!-- Navegación prev/next -->
        <div class="flex items-center gap-1">
          <button class="btn btn-secondary btn-sm !px-2" @click="prev">
            <ChevronLeft class="h-4 w-4" />
          </button>
          <!-- Título en móvil -->
          <span class="sm:hidden min-w-[150px] text-center text-[13px] font-semibold text-slate-800 capitalize">{{ headerTitle }}</span>
          <button class="btn btn-secondary btn-sm !px-2" @click="next">
            <ChevronRight class="h-4 w-4" />
          </button>
        </div>

        <!-- Botón Hoy -->
        <button class="btn btn-secondary btn-sm" @click="goToday">Hoy</button>

        <!-- Toggle mes/semana -->
        <div class="flex overflow-hidden rounded-lg border border-slate-200 bg-slate-50 p-0.5 gap-0.5">
          <button
            class="cursor-pointer rounded-md px-3 py-1 text-[13px] font-medium transition-all"
            :class="viewMode === 'month' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'"
            @click="viewMode = 'month'"
          >Mes</button>
          <button
            class="cursor-pointer rounded-md px-3 py-1 text-[13px] font-medium transition-all"
            :class="viewMode === 'week' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'"
            @click="viewMode = 'week'"
          >Semana</button>
        </div>

        <div class="ml-auto flex items-center gap-2">
          <button
            class="btn btn-sm gap-1.5 border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            @click="openBlock()"
          >
            <Ban class="h-3.5 w-3.5" />
            <span class="hidden sm:inline">Bloquear hora</span>
          </button>
          <button class="btn btn-primary btn-sm" @click="openNew()">
            <Plus class="h-4 w-4" />
            <span class="hidden sm:inline">Nueva cita</span>
          </button>
        </div>
      </div>

      <!-- ── Vista mes ─────────────────────────────────────────────────────── -->
      <div v-if="viewMode === 'month'" class="flex flex-1 flex-col overflow-hidden">
        <!-- Cabecera días -->
        <div class="grid grid-cols-7 bg-white border-b border-slate-200">
          <div
            v-for="(day, idx) in DAYS_ES"
            :key="day"
            class="py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider"
            :class="idx === 0 || idx === 6 ? 'text-slate-300' : 'text-slate-400'"
          >
            {{ day }}
          </div>
        </div>

        <!-- Grid -->
        <div class="grid flex-1 grid-cols-7 overflow-auto" style="grid-auto-rows: minmax(110px, 1fr)">
          <div
            v-for="cell in calendarDays"
            :key="`${cell.year}-${cell.month}-${cell.day}`"
            class="group relative border-r border-b border-slate-200 p-1.5 transition-colors cursor-pointer"
            :class="[
              !cell.current
                ? 'bg-slate-50'
                : cell.weekend
                  ? 'bg-white hover:bg-slate-50/70'
                  : 'bg-white hover:bg-slate-50',
              isToday(cell.year, cell.month, cell.day) ? '!bg-orange-50/40' : '',
            ]"
            @click="openNew(mkDateStr(cell.year, cell.month, cell.day))"
          >
            <!-- Número + botón + en hover -->
            <div class="mb-1 flex items-center justify-between px-0.5">
              <span
                class="flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-semibold"
                :class="[
                  !cell.current ? 'text-slate-300' : cell.weekend ? 'text-slate-400' : 'text-slate-600',
                  isToday(cell.year, cell.month, cell.day) ? '!bg-[#F69008] !text-white !font-bold' : '',
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

            <!-- Chips / Pills -->
            <div class="space-y-0.5">
              <template v-for="a in appsForDay(cell.year, cell.month, cell.day).slice(0, 4)" :key="a.id">
                <div
                  class="flex items-center gap-1.5 rounded-md px-1.5 py-[2px] text-[11px] font-medium leading-tight cursor-pointer transition-all hover:brightness-95 truncate"
                  :class="a.status === 'blocked' ? 'opacity-70' : ''"
                  :style="`
                    background:${weekBlockStyle(a) || apptChipStyle(a).bg};
                    color:${apptChipStyle(a).text};
                    ${apptChipStyle(a).outline ? 'border:1px solid ' + apptChipStyle(a).dot + ';' : ''}
                  `"
                  @click.stop="openEdit(a)"
                >
                  <span class="h-1.5 w-1.5 shrink-0 flex-none rounded-full"
                    :style="`background:${apptChipStyle(a).dot}`"></span>
                  <span class="truncate" :class="a.status === 'cancelled' || a.status === 'no_show' ? 'line-through' : ''">
                    <span v-if="!a.is_all_day" class="opacity-70 text-[10px]">{{ fmtTime(a.start_at) }} </span>{{ a.title }}
                    <span v-if="a.recurrence_type && a.recurrence_type !== 'none'" class="opacity-40 ml-0.5">↻</span>
                  </span>
                </div>
              </template>

              <!-- Google events externos (no sincronizados como cita CRM) -->
              <template v-for="ge in googleEventsForDay(cell.year, cell.month, cell.day).slice(0, Math.max(0, 4 - appsForDay(cell.year, cell.month, cell.day).length))" :key="'g-' + ge.id">
                <a
                  :href="ge.htmlLink" target="_blank"
                  class="flex items-center gap-1.5 rounded-md px-1.5 py-[2px] text-[11px] font-medium leading-tight truncate bg-[#4285F4]/10 text-[#1a73e8] hover:bg-[#4285F4]/20 transition-colors"
                  @click.stop
                >
                  <svg class="h-2 w-2 shrink-0" viewBox="0 0 24 24" fill="none">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  <span class="truncate">
                    <span class="opacity-60 text-[10px]">{{ fmtTime(ge.startAt) }} </span>{{ ge.title }}
                    <span v-if="ge.meetLink" class="opacity-40 ml-0.5 text-[10px]">· Meet</span>
                  </span>
                </a>
              </template>

              <template v-for="t in tasksForDay(cell.year, cell.month, cell.day).slice(0, Math.max(0, 4 - appsForDay(cell.year, cell.month, cell.day).length - googleEventsForDay(cell.year, cell.month, cell.day).length))" :key="'t-' + t.id">
                <div
                  class="flex items-center gap-1.5 rounded-md px-1.5 py-[2px] text-[11px] font-medium leading-tight truncate"
                  :class="t.status === 'done' || t.status === 'cancelled' ? 'line-through opacity-50' : ''"
                  :style="`background:${taskChipStyle(t).bg}; color:${taskChipStyle(t).text}`"
                >
                  <span class="h-1.5 w-1.5 shrink-0 flex-none rounded-full"
                    :style="`background:${taskChipStyle(t).dot}`"></span>
                  <span class="truncate">{{ t.title }}</span>
                </div>
              </template>

              <div
                v-if="appsForDay(cell.year, cell.month, cell.day).length + googleEventsForDay(cell.year, cell.month, cell.day).length + tasksForDay(cell.year, cell.month, cell.day).length > 4"
                class="flex items-center gap-1 px-1.5 py-[1px] text-[10px] font-semibold text-slate-400 hover:text-[#F69008] cursor-pointer transition-colors"
                @click.stop="goToWeekDay(cell.year, cell.month, cell.day)"
              >
                +{{ appsForDay(cell.year, cell.month, cell.day).length + googleEventsForDay(cell.year, cell.month, cell.day).length + tasksForDay(cell.year, cell.month, cell.day).length - 4 }} más →
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Vista semana ───────────────────────────────────────────────────── -->
      <div v-else class="flex flex-1 flex-col overflow-hidden">
        <!-- Wrapper para scroll horizontal en móvil -->
        <div class="flex flex-1 flex-col overflow-x-auto min-h-0">
        <div class="flex flex-1 flex-col min-w-[560px]">
        <!-- Cabecera columnas -->
        <div class="flex border-b border-slate-200 bg-white">
          <div class="w-16 shrink-0 border-r border-slate-200"></div>
          <div
            v-for="d in weekDays"
            :key="d.toISOString()"
            class="flex flex-1 flex-col items-center py-3"
            :class="d.getDay() === 0 || d.getDay() === 6 ? 'bg-slate-50/70' : ''"
          >
            <span class="text-[10px] font-semibold uppercase tracking-wider"
              :class="d.getDay() === 0 || d.getDay() === 6 ? 'text-slate-300' : 'text-slate-400'">
              {{ DAYS_ES[d.getDay()] }}
            </span>
            <span
              class="mt-1 flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-semibold transition-all"
              :class="isToday(d.getFullYear(), d.getMonth(), d.getDate())
                ? 'bg-[#F69008] text-white shadow-sm shadow-[#F69008]/30'
                : d.getDay() === 0 || d.getDay() === 6 ? 'text-slate-400' : 'text-slate-700'"
            >
              {{ d.getDate() }}
            </span>
          </div>
        </div>

        <!-- Fila "Todo el día": citas all-day + tareas (scroll interno) -->
        <div class="flex border-b border-slate-200 bg-slate-50/40">
          <!-- Etiqueta fija -->
          <div class="w-16 shrink-0 border-r border-slate-200 flex items-center justify-center self-stretch py-2">
            <span class="text-[9px] font-semibold uppercase tracking-widest text-slate-400">Todo día</span>
          </div>
          <!-- Columnas de días con scroll vertical cuando hay muchos ítems -->
          <div class="flex flex-1 max-h-24 overflow-y-auto min-h-[34px]">
            <div
              v-for="d in weekDays"
              :key="d.toISOString()"
              class="flex-1 border-r border-slate-200 p-1 space-y-[2px] min-w-0"
              :class="d.getDay() === 0 || d.getDay() === 6 ? 'bg-slate-50/60' : ''"
            >
              <div
                v-for="a in allDayItemsForWeekDay(d).allDayApps"
                :key="a.id"
                class="flex items-center gap-1 rounded-md px-1.5 py-[2px] text-[10px] font-medium truncate cursor-pointer hover:brightness-95"
                :style="`background:${apptChipStyle(a).bg}; color:${apptChipStyle(a).text}`"
                @click.stop="openEdit(a)"
              >
                <span class="h-1.5 w-1.5 shrink-0 flex-none rounded-full" :style="`background:${apptChipStyle(a).dot}`"></span>
                <span class="truncate">{{ a.title }}</span>
              </div>
              <div
                v-for="t in allDayItemsForWeekDay(d).dayTasks"
                :key="'t-' + t.id"
                class="flex items-center gap-1 rounded-md px-1.5 py-[2px] text-[10px] font-medium truncate"
                :class="t.status === 'done' || t.status === 'cancelled' ? 'line-through opacity-50' : ''"
                :style="`background:${taskChipStyle(t).bg}; color:${taskChipStyle(t).text}`"
              >
                <span class="h-1.5 w-1.5 shrink-0 flex-none rounded-full" :style="`background:${taskChipStyle(t).dot}`"></span>
                <span class="truncate">{{ t.title }}</span>
              </div>
              <!-- Google events todo el día -->
              <a
                v-for="ge in googleEventsAllDayForDay(d.getFullYear(), d.getMonth(), d.getDate())"
                :key="'gad-' + ge.id"
                :href="ge.htmlLink" target="_blank"
                class="flex items-center gap-1 rounded-md px-1.5 py-[2px] text-[10px] font-medium truncate bg-[#4285F4]/10 text-[#1a73e8] hover:bg-[#4285F4]/20"
                @click.stop
              >
                <span class="h-1.5 w-1.5 shrink-0 flex-none rounded-full bg-[#4285F4]"></span>
                <span class="truncate">{{ ge.title }}</span>
              </a>
            </div>
          </div>
        </div>

        <!-- Grid de tiempo -->
        <div ref="timeGridEl" class="flex flex-1 overflow-auto">
          <div class="relative flex flex-1">
            <!-- Etiquetas de hora -->
            <div class="w-16 shrink-0 border-r border-slate-200 bg-white sticky left-0 z-10">
              <div v-for="h in WEEK_HOURS" :key="h" class="flex h-16 items-start justify-end pr-3 pt-1.5">
                <span class="text-[11px] font-semibold tabular-nums"
                  :class="isToday(nowRef.getFullYear(), nowRef.getMonth(), nowRef.getDate()) && h === nowRef.getHours() ? 'text-red-500' : 'text-slate-500'">
                  {{ fmtHour(h) }}
                </span>
              </div>
            </div>

            <!-- Columnas de días -->
            <div class="flex flex-1">
              <div
                v-for="wd in weekData"
                :key="wd.date.toISOString()"
                class="relative flex-1 border-r border-slate-200 cursor-pointer hover:bg-orange-50/10 transition-colors"
                :class="wd.date.getDay() === 0 || wd.date.getDay() === 6 ? 'bg-slate-50/50' : 'bg-white'"
                :style="`height: ${WEEK_HOURS.length * 64}px`"
                @click="onWeekGridClick($event, wd.date)"
              >
                <!-- Líneas de hora (sólidas) y media hora (punteadas) -->
                <div v-for="h in WEEK_HOURS" :key="h"
                  class="absolute w-full border-t"
                  :class="h === 12 ? 'border-slate-500' : 'border-slate-300'"
                  :style="`top:${(h - 6) * 64}px`"></div>
                <div v-for="h in WEEK_HOURS" :key="'hh-' + h"
                  class="absolute w-full border-t border-slate-200 border-dashed"
                  :style="`top:${(h - 6) * 64 + 32}px`"></div>

                <!-- Indicador de hora actual -->
                <div
                  v-if="isToday(wd.date.getFullYear(), wd.date.getMonth(), wd.date.getDate()) && nowVisible"
                  class="absolute left-0 right-0 z-20 flex items-center pointer-events-none"
                  :style="`top: ${nowTop}`"
                >
                  <div class="h-2 w-2 shrink-0 rounded-full bg-red-500 border-2 border-white shadow-sm -ml-1"></div>
                  <div class="flex-1 border-t border-red-500"></div>
                </div>

                <!-- Citas con hora -->
                <div
                  v-for="a in wd.dayApps"
                  :key="a.id"
                  class="absolute overflow-hidden rounded-lg px-2 py-1.5 cursor-pointer transition-all hover:brightness-95 hover:shadow-sm z-10"
                  :class="a.status === 'blocked' ? 'opacity-80' : ''"
                  :style="weekAppStyleLayout(a)"
                  @click.stop="openEdit(a)"
                >
                  <span
                    class="block truncate text-[11px] font-semibold leading-tight"
                    :class="a.status === 'cancelled' || a.status === 'no_show' ? 'line-through' : ''"
                    :style="`color:${apptChipStyle(a).text}`"
                  >{{ a.title }}</span>
                  <span
                    v-if="a.status !== 'blocked'"
                    class="block truncate text-[10px] opacity-70 mt-0.5"
                    :class="a.status === 'cancelled' || a.status === 'no_show' ? 'line-through' : ''"
                    :style="`color:${apptChipStyle(a).text}`"
                  >{{ fmtTime(a.start_at) }}</span>
                  <span v-else class="block text-[9px] opacity-50 mt-0.5" style="color:#64748b">
                    {{ fmtTime(a.start_at) }} – {{ fmtTime(a.end_at) }}
                  </span>
                </div>

                <!-- Google Calendar events externos -->
                <a
                  v-for="ge in wd.dayGoogle"
                  :key="'gw-' + ge.id"
                  :href="ge.htmlLink" target="_blank"
                  class="absolute overflow-hidden rounded-lg px-2 py-1.5 z-10 transition-all hover:brightness-95 hover:shadow-sm"
                  :style="weekGoogleStyleLayout(ge)"
                  @click.stop
                >
                  <span class="block truncate text-[11px] font-semibold leading-tight text-[#1a73e8]">{{ ge.title }}</span>
                  <span class="flex items-center gap-1 text-[10px] text-[#1a73e8]/60 mt-0.5">
                    {{ fmtTime(ge.startAt) }}
                    <span v-if="ge.meetLink" class="ml-1">· Meet</span>
                  </span>
                </a>
              </div>
            </div>
          </div>
        </div>
        </div><!-- /min-w wrapper -->
        </div><!-- /overflow-x-auto wrapper -->
      </div>

      <!-- ── Modal cita ────────────────────────────────────────────────────── -->
      <AppointmentModal
        v-model="showModal"
        :date="modalDate"
        :start-time="modalStartTime"
        :appointment="modalAppointment"
        @saved="onSaved"
        @deleted="onDeleted"
      />

      <!-- ── Modal bloquear hora ───────────────────────────────────────────── -->
      <BlockTimeModal
        v-model="showBlockModal"
        :date="blockDate"
        :start-time="blockStartTime"
        @saved="loadMonth"
      />

    </div>
  </div>
</template>
