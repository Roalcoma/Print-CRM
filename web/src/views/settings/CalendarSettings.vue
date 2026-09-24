<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  Check, X, Plus, Clock, CalendarDays, Copy, Eye, Trash2,
  Globe, CalendarOff, Users,
} from 'lucide-vue-next';
import { api } from '../../api';
import { useDialog } from '../../composables/useDialog';
import { useAuthStore } from '../../stores/auth';
import type { Calendar } from '../../types';
import Spinner from '../../components/Spinner.vue';
import { TIMEZONES, tzLabel } from '../../utils/timezones';

const { alert, confirm } = useDialog();
const router = useRouter();
const auth = useAuthStore();

// ─── Selector de usuario (solo admins) ────────────────────────────────────────
interface OrgUser { id: string; name: string; email: string; role: string; }
const ALL_OPTION: OrgUser = { id: 'all', name: 'Todos los usuarios', email: '', role: '' };

const orgUsers     = ref<OrgUser[]>([]);
const selectedUser = ref<OrgUser | null>(null); // null = yo mismo; ALL_OPTION = todos
const selectorOpen = ref(false);
const selectorEl   = ref<HTMLElement | null>(null);

const isAllSelected = computed(() => selectedUser.value?.id === 'all');
const otherUsers    = computed(() => orgUsers.value.filter(u => u.id !== auth.user?.id));

function userInitials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase() || '?';
}
const AVATAR_COLORS = ['#F69008','#10B981','#8B5CF6','#3B82F6','#EC4899','#EF4444','#6366F1'];
function userAvatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function roleLabel(role: string) {
  return role === 'owner' ? 'Dueño' : role === 'admin' ? 'Admin' : 'Agente';
}
function roleColor(role: string) {
  return role === 'owner' ? 'text-primary' : role === 'admin' ? 'text-blue-500' : 'text-slate-400';
}

function selectUser(u: OrgUser | null) {
  selectedUser.value = u;
  selectorOpen.value = false;
}

function onClickOutside(e: MouseEvent) {
  if (selectorOpen.value && selectorEl.value && !selectorEl.value.contains(e.target as Node)) {
    selectorOpen.value = false;
  }
}

const targetUserId = () => selectedUser.value?.id ?? null;

// ─── Pestañas ──────────────────────────────────────────────────────────────────
type Tab = 'calendarios' | 'disponibilidad';
const activeTab = ref<Tab>('calendarios');
const TABS: { id: Tab; label: string }[] = [
  { id: 'calendarios',    label: 'Calendarios' },
  { id: 'disponibilidad', label: 'Disponibilidad' },
];

// ─── Toast ─────────────────────────────────────────────────────────────────────
const toast     = ref('');
const toastType = ref<'success' | 'error'>('success');
let toastTimer: ReturnType<typeof setTimeout>;
function showToast(msg: string, type: 'success' | 'error' = 'success') {
  toast.value = msg; toastType.value = type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.value = ''; }, 4000);
}

// ─── Calendarios ───────────────────────────────────────────────────────────────
const calendars   = ref<Calendar[]>([]);
const loadingCals = ref(true);
const copied      = ref<string | null>(null);
const deleting    = ref<string | null>(null);

async function loadCalendars() {
  loadingCals.value = true;
  const uid = targetUserId();
  try {
    calendars.value = uid === 'all'
      ? await api.get<Calendar[]>('/calendars')
      : await api.get<Calendar[]>(`/calendars/mine${uid ? `?forUserId=${uid}` : ''}`);
  } finally { loadingCals.value = false; }
}
function bookingUrl(slug: string) { return `${window.location.origin}/book/${slug}`; }
async function copyLink(slug: string) {
  await navigator.clipboard.writeText(bookingUrl(slug));
  copied.value = slug;
  setTimeout(() => { copied.value = null; }, 2000);
}
async function deleteCalendar(cal: Calendar) {
  if (!await confirm(`¿Eliminar "${cal.name}"? Las citas existentes se conservan.`, 'Eliminar calendario')) return;
  deleting.value = cal.id;
  try {
    await api.del(`/calendars/${cal.id}`);
    await loadCalendars();
  } catch (err: unknown) {
    await alert((err as { message?: string })?.message ?? 'No se puede eliminar');
  } finally { deleting.value = null; }
}

// ─── Disponibilidad ────────────────────────────────────────────────────────────
const loadingSettings = ref(true);
const savingTz        = ref(false);
const savingWH        = ref(false);


const DAYS     = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

type WorkingHours = { enabled: boolean; start: string; end: string };

const selectedTimezone = ref('America/Caracas');
const workingHours     = ref<WorkingHours[]>(
  DAY_KEYS.map((_, i) => ({ enabled: i < 5, start: '09:00', end: '18:00' }))
);

// ─── Fechas específicas ────────────────────────────────────────────────────────
interface DateOverride {
  id?: string;
  override_date: string;
  is_available: boolean;
  start_time?: string | null;
  end_time?: string | null;
}

const overrides       = ref<DateOverride[]>([]);
const showAddForm     = ref(false);
const newDate         = ref('');
const newType         = ref<'unavailable' | 'custom'>('unavailable');
const newStart        = ref('09:00');
const newEnd          = ref('17:00');

function addOverride() {
  if (!newDate.value) return;
  const idx = overrides.value.findIndex(o => o.override_date === newDate.value);
  const entry: DateOverride = {
    override_date: newDate.value,
    is_available:  newType.value === 'custom',
    start_time:    newType.value === 'custom' ? newStart.value : null,
    end_time:      newType.value === 'custom' ? newEnd.value   : null,
  };
  if (idx >= 0) overrides.value[idx] = entry;
  else overrides.value.push(entry);
  overrides.value.sort((a, b) => a.override_date.localeCompare(b.override_date));
  showAddForm.value = false;
  newDate.value = '';
  newType.value = 'unavailable';
}

function removeOverride(idx: number) {
  overrides.value.splice(idx, 1);
}

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('es-VE', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

async function loadSettings() {
  loadingSettings.value = true;
  const uid = targetUserId();
  try {
    const s = await api.get<{
      timezone: string;
      working_hours: Record<string, WorkingHours> | null;
      overrides?: DateOverride[];
    }>(`/calendar/settings${uid ? `?forUserId=${uid}` : ''}`);
    selectedTimezone.value = s.timezone ?? 'America/Caracas';
    if (s.working_hours) {
      DAY_KEYS.forEach((key, i) => {
        const wh = (s.working_hours as Record<string, WorkingHours>)[key];
        if (wh) workingHours.value[i] = { ...wh };
      });
    }
    if (s.overrides) overrides.value = s.overrides;
  } catch {
    showToast('Error al cargar la configuración', 'error');
  } finally {
    loadingSettings.value = false;
  }
}

async function saveTz() {
  savingTz.value = true;
  const uid = targetUserId();
  try {
    await api.patch(`/calendar/settings${uid ? `?forUserId=${uid}` : ''}`, { timezone: selectedTimezone.value });
    showToast('Zona horaria guardada');
  } catch {
    showToast('Error al guardar', 'error');
  } finally {
    savingTz.value = false;
  }
}

async function saveWH() {
  savingWH.value = true;
  const uid = targetUserId();
  try {
    const wh: Record<string, WorkingHours> = {};
    DAY_KEYS.forEach((key, i) => { wh[key] = workingHours.value[i]; });
    await api.patch(`/calendar/settings${uid ? `?forUserId=${uid}` : ''}`, { working_hours: wh, overrides: overrides.value });
    showToast('Disponibilidad guardada');
  } catch {
    showToast('Error al guardar', 'error');
  } finally {
    savingWH.value = false;
  }
}

// ─── Init ──────────────────────────────────────────────────────────────────────
onMounted(async () => {
  document.addEventListener('click', onClickOutside, true);
  if (auth.isAdmin) {
    try { orgUsers.value = await api.get<OrgUser[]>('/users'); } catch { /* sin acceso */ }
  }
  await Promise.all([loadCalendars(), loadSettings()]);
});
onUnmounted(() => { document.removeEventListener('click', onClickOutside, true); });

watch(selectedUser, () => { Promise.all([loadCalendars(), isAllSelected.value ? Promise.resolve() : loadSettings()]); });
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden">

    <!-- Toolbar -->
    <div class="page-toolbar justify-between">
      <div class="flex items-center gap-2 sm:gap-3">
        <button class="btn btn-secondary btn-sm" @click="router.back()">
          ← <span class="hidden sm:inline">Regresar</span>
        </button>
        <div class="h-5 w-px bg-slate-200"></div>
        <div>
          <h3 class="text-[15px] font-semibold text-slate-900">Calendarios</h3>
          <p class="hidden text-[12px] text-slate-400 sm:block">Gestiona tus calendarios y disponibilidad</p>
        </div>
      </div>
      <button
        v-if="activeTab === 'calendarios'"
        class="btn btn-primary btn-sm"
        @click="router.push('/settings/calendars/new')"
      >
        <Plus class="h-4 w-4" /> <span class="hidden sm:inline">Nuevo calendario</span>
      </button>
    </div>

    <!-- Selector de usuario (solo admins con más de 1 usuario) -->
    <div
      v-if="auth.isAdmin && orgUsers.length > 0"
      class="flex flex-shrink-0 items-center gap-3 border-b border-slate-100 bg-white px-4 py-2.5 sm:px-6"
    >
      <span class="text-[12px] font-medium text-slate-400 whitespace-nowrap">Viendo:</span>

      <!-- Custom dropdown -->
      <div class="relative" ref="selectorEl">
        <!-- Trigger -->
        <button
          class="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 shadow-sm transition-colors hover:border-slate-300 focus:outline-none"
          :class="selectorOpen ? 'border-primary/40 ring-2 ring-primary/10' : ''"
          @click="selectorOpen = !selectorOpen"
        >
          <!-- Avatar / icono -->
          <template v-if="isAllSelected">
            <div class="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-slate-100">
              <Users class="h-3.5 w-3.5 text-slate-400" />
            </div>
            <span class="text-[13px] font-medium text-slate-700">Todos los usuarios</span>
          </template>
          <template v-else-if="selectedUser">
            <div
              class="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
              :style="{ background: userAvatarColor(selectedUser.name) }"
            >{{ userInitials(selectedUser.name) }}</div>
            <span class="text-[13px] font-medium text-slate-700">{{ selectedUser.name }}</span>
          </template>
          <template v-else>
            <div
              class="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
              :style="{ background: userAvatarColor(auth.user?.name ?? '') }"
            >{{ userInitials(auth.user?.name ?? '') }}</div>
            <span class="text-[13px] font-medium text-slate-700">{{ auth.user?.name }} <span class="text-[11px] font-normal text-slate-400">(Tú)</span></span>
          </template>
          <svg class="h-3.5 w-3.5 flex-shrink-0 text-slate-400 transition-transform" :class="{ 'rotate-180': selectorOpen }" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd"/></svg>
        </button>

        <!-- Dropdown panel -->
        <Transition
          enter-active-class="transition ease-out duration-100"
          enter-from-class="opacity-0 scale-95"
          enter-to-class="opacity-100 scale-100"
          leave-active-class="transition ease-in duration-75"
          leave-from-class="opacity-100 scale-100"
          leave-to-class="opacity-0 scale-95"
        >
          <div
            v-if="selectorOpen"
            class="absolute left-0 top-full z-40 mt-1.5 w-64 origin-top-left overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
          >
            <!-- Todos -->
            <button
              class="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-slate-50"
              @click="selectUser(ALL_OPTION)"
            >
              <div class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-100">
                <Users class="h-4 w-4 text-slate-400" />
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-[13px] font-semibold text-slate-700">Todos los usuarios</p>
                <p class="text-[11px] text-slate-400">{{ orgUsers.length }} miembro{{ orgUsers.length !== 1 ? 's' : '' }}</p>
              </div>
              <Check v-if="isAllSelected" class="h-4 w-4 flex-shrink-0 text-primary" />
            </button>

            <div class="my-0.5 border-t border-slate-100"></div>

            <!-- Yo mismo -->
            <button
              class="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-slate-50"
              @click="selectUser(null)"
            >
              <div
                class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                :style="{ background: userAvatarColor(auth.user?.name ?? '') }"
              >{{ userInitials(auth.user?.name ?? '') }}</div>
              <div class="min-w-0 flex-1">
                <p class="text-[13px] font-semibold text-slate-700 truncate">
                  {{ auth.user?.name }}
                  <span class="text-[11px] font-normal text-slate-400"> (Tú)</span>
                </p>
                <p class="truncate text-[11px] text-slate-400">{{ auth.user?.email }}</p>
              </div>
              <Check v-if="selectedUser === null" class="h-4 w-4 flex-shrink-0 text-primary" />
            </button>

            <!-- Otros usuarios -->
            <template v-for="u in otherUsers" :key="u.id">
              <button
                class="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-slate-50"
                @click="selectUser(u)"
              >
                <div
                  class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                  :style="{ background: userAvatarColor(u.name) }"
                >{{ userInitials(u.name) }}</div>
                <div class="min-w-0 flex-1">
                  <p class="text-[13px] font-semibold text-slate-700 truncate">{{ u.name }}</p>
                  <p class="truncate text-[11px] text-slate-400">{{ u.email }}</p>
                </div>
                <span class="text-[10px] font-semibold uppercase tracking-wide" :class="roleColor(u.role)">{{ roleLabel(u.role) }}</span>
                <Check v-if="selectedUser?.id === u.id" class="h-4 w-4 flex-shrink-0 text-primary" />
              </button>
            </template>
          </div>
        </Transition>
      </div>
    </div>

    <!-- Tab bar -->
    <div class="flex flex-shrink-0 border-b border-slate-200 bg-white px-4 sm:px-6">
      <button
        v-for="tab in TABS"
        :key="tab.id"
        class="relative mr-1 px-4 py-3.5 text-[13px] font-medium transition-colors cursor-pointer whitespace-nowrap"
        :class="activeTab === tab.id
          ? 'text-[#F69008]'
          : 'text-slate-500 hover:text-slate-800'"
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
        <span
          v-if="activeTab === tab.id"
          class="absolute bottom-0 left-0 right-0 h-[2px] rounded-t-full bg-[#F69008]"
        ></span>
      </button>
    </div>

    <!-- Cuerpo scrollable -->
    <div class="flex-1 overflow-y-auto bg-[#F1F5F9] p-4 sm:p-6">

      <!-- ══════════ TAB: Calendarios ══════════ -->
      <template v-if="activeTab === 'calendarios'">
        <div v-if="loadingCals" class="flex justify-center py-16"><Spinner :size="26" /></div>

        <!-- Estado vacío -->
        <div
          v-else-if="!calendars.length"
          class="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white py-20 text-center shadow-sm"
        >
          <div class="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 shadow-inner">
            <CalendarDays class="h-7 w-7 text-primary" />
          </div>
          <p class="text-[15px] font-semibold text-slate-700">Sin calendarios aún</p>
          <p class="mt-1.5 max-w-xs text-sm text-slate-400">
            Crea tu primer calendario para que tus clientes puedan reservar citas contigo
          </p>
          <button class="btn btn-primary mt-6" @click="router.push('/settings/calendars/new')">
            <Plus class="h-4 w-4" /> Crear mi primer calendario
          </button>
        </div>

        <!-- Tabla -->
        <div v-else class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-slate-100 bg-slate-50/80">
                <th class="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">Nombre</th>
                <th v-if="isAllSelected" class="hidden px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 sm:table-cell">Propietario</th>
                <th class="hidden px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 sm:table-cell">Duración</th>
                <th class="hidden px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 md:table-cell">Estado</th>
                <th class="hidden px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 lg:table-cell">Zona horaria</th>
                <th class="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr
                v-for="cal in calendars"
                :key="cal.id"
                class="group transition-colors hover:bg-slate-50/60"
              >
                <td class="px-5 py-3.5">
                  <div class="flex items-center gap-3">
                    <div
                      class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-white shadow-sm"
                      :style="`background: ${cal.color}`"
                    >
                      <CalendarDays class="h-4 w-4" />
                    </div>
                    <div class="min-w-0">
                      <p class="truncate font-semibold text-slate-800">{{ cal.name }}</p>
                      <p class="truncate font-mono text-[11px] text-slate-400">/book/{{ cal.slug }}</p>
                    </div>
                  </div>
                </td>
                <td v-if="isAllSelected" class="hidden px-4 py-3.5 sm:table-cell">
                  <div class="flex items-center gap-2">
                    <div
                      class="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                      :style="{ background: userAvatarColor(cal.owner_name) }"
                    >{{ userInitials(cal.owner_name) }}</div>
                    <span class="text-[13px] text-slate-600 truncate">{{ cal.owner_name }}</span>
                  </div>
                </td>
                <td class="hidden px-4 py-3.5 sm:table-cell">
                  <span class="flex items-center gap-1.5 text-slate-500">
                    <Clock class="h-3.5 w-3.5 text-slate-400" />{{ cal.duration_minutes }} min
                  </span>
                </td>
                <td class="hidden px-4 py-3.5 md:table-cell">
                  <span
                    class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                    :class="cal.booking_enabled
                      ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border border-slate-200 bg-slate-100 text-slate-500'"
                  >
                    <span class="h-1.5 w-1.5 rounded-full" :class="cal.booking_enabled ? 'bg-emerald-500' : 'bg-slate-300'"></span>
                    {{ cal.booking_enabled ? 'Activo' : 'Desactivado' }}
                  </span>
                </td>
                <td class="hidden px-4 py-3.5 lg:table-cell">
                  <span class="flex items-center gap-1 text-xs text-slate-400">
                    <Globe class="h-3.5 w-3.5" />{{ cal.timezone }}
                  </span>
                </td>
                <td class="px-4 py-3.5 text-right">
                  <div class="flex items-center justify-end gap-1.5">
                    <button
                      v-if="cal.booking_enabled"
                      class="btn btn-secondary btn-sm p-1.5"
                      title="Copiar link"
                      @click.stop="copyLink(cal.slug)"
                    >
                      <Check v-if="copied === cal.slug" class="h-3.5 w-3.5 text-emerald-500" />
                      <Copy v-else class="h-3.5 w-3.5" />
                    </button>
                    <a
                      v-if="cal.booking_enabled"
                      :href="bookingUrl(cal.slug)"
                      target="_blank"
                      class="btn btn-secondary btn-sm p-1.5"
                      title="Ver página de reserva"
                      @click.stop
                    >
                      <Eye class="h-3.5 w-3.5" />
                    </a>
                    <button
                      class="btn btn-danger btn-sm p-1.5"
                      :disabled="deleting === cal.id"
                      title="Eliminar"
                      @click.stop="deleteCalendar(cal)"
                    >
                      <Spinner v-if="deleting === cal.id" :size="13" />
                      <Trash2 v-else class="h-3.5 w-3.5" />
                    </button>
                    <button
                      class="btn btn-primary btn-sm"
                      @click.stop="router.push(`/settings/calendars/${cal.id}`)"
                    >
                      Editar →
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>

      <!-- ══════════ TAB: Disponibilidad ══════════ -->
      <template v-else-if="activeTab === 'disponibilidad'">
        <!-- Aviso cuando "Todos" está seleccionado -->
        <div
          v-if="isAllSelected"
          class="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white py-16 text-center shadow-sm"
        >
          <div class="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
            <Users class="h-6 w-6 text-slate-400" />
          </div>
          <p class="text-[15px] font-semibold text-slate-700">Selecciona un usuario</p>
          <p class="mt-1 max-w-xs text-sm text-slate-400">
            La disponibilidad se configura individualmente. Elige un usuario en el selector para editar su horario.
          </p>
        </div>

        <div v-else-if="loadingSettings" class="flex justify-center py-16"><Spinner :size="26" /></div>

        <div v-else class="space-y-4">

          <!-- ── Zona horaria ── -->
          <div class="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div class="flex items-center justify-between gap-2 px-6 py-4 border-b border-slate-100">
              <div class="flex items-center gap-2.5">
                <Globe class="h-4 w-4 text-primary flex-shrink-0" />
                <div>
                  <h4 class="text-[13px] font-semibold text-slate-700">Zona horaria</h4>
                  <p class="text-[11px] text-slate-400">Todas las citas se guardarán en esta zona</p>
                </div>
              </div>
              <button :disabled="savingTz" class="btn btn-primary btn-sm whitespace-nowrap flex-shrink-0" @click="saveTz">
                <Spinner v-if="savingTz" :size="13" light />
                <Check v-else class="h-3.5 w-3.5" />
                {{ savingTz ? 'Guardando…' : 'Guardar' }}
              </button>
            </div>
            <div class="px-6 py-4">
              <select
                v-model="selectedTimezone"
                class="w-full cursor-pointer rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none transition-colors"
              >
                <option v-for="t in TIMEZONES" :key="t.value" :value="t.value">{{ t.label }}</option>
              </select>
            </div>
          </div>

          <!-- ── Horario laboral ── -->
          <div class="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div class="flex items-center gap-2.5 border-b border-slate-100 px-6 py-4">
              <Clock class="h-4 w-4 text-primary flex-shrink-0" />
              <div>
                <h4 class="text-[13px] font-semibold text-slate-700">Horario laboral</h4>
                <p class="text-[11px] text-slate-400">Define los días y horas en que estás disponible</p>
              </div>
            </div>
            <div class="divide-y divide-slate-50">
              <div
                v-for="(wh, i) in workingHours"
                :key="i"
                class="flex flex-wrap items-center gap-3 px-6 py-3 transition-colors"
                :class="i % 2 === 1 ? 'bg-slate-50/60' : 'bg-white'"
              >
                <label class="flex w-28 cursor-pointer items-center gap-2.5">
                  <input type="checkbox" v-model="wh.enabled"
                    class="h-4 w-4 cursor-pointer accent-primary rounded" />
                  <span class="text-[13px] font-medium" :class="wh.enabled ? 'text-slate-700' : 'text-slate-400'">
                    {{ DAYS[i] }}
                  </span>
                </label>
                <div class="flex items-center gap-2" :class="!wh.enabled ? 'opacity-35 pointer-events-none' : ''">
                  <input
                    v-model="wh.start"
                    type="time"
                    class="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
                  />
                  <span class="text-xs text-slate-400 select-none">→</span>
                  <input
                    v-model="wh.end"
                    type="time"
                    class="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
                  />
                </div>
                <span v-if="!wh.enabled" class="text-[12px] text-slate-300 italic">No disponible</span>
              </div>
            </div>
            <div class="border-t border-slate-100 px-6 py-4">
              <button :disabled="savingWH" class="btn btn-primary" @click="saveWH">
                <Spinner v-if="savingWH" :size="14" light />
                <Check v-else class="h-4 w-4" />
                {{ savingWH ? 'Guardando…' : 'Guardar disponibilidad' }}
              </button>
            </div>
          </div>

          <!-- ── Fechas específicas ── -->
          <div class="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div class="flex items-center justify-between gap-2 border-b border-slate-100 px-6 py-4">
              <div class="flex items-center gap-2.5">
                <CalendarOff class="h-4 w-4 text-primary flex-shrink-0" />
                <div>
                  <h4 class="text-[13px] font-semibold text-slate-700">Fechas específicas</h4>
                  <p class="text-[11px] text-slate-400">Anula tu disponibilidad para días concretos</p>
                </div>
              </div>
              <button
                v-if="!showAddForm"
                class="btn btn-secondary btn-sm whitespace-nowrap flex-shrink-0"
                @click="showAddForm = true"
              >
                <Plus class="h-3.5 w-3.5" /> Añadir fecha
              </button>
            </div>

            <!-- Formulario inline -->
            <Transition name="slide-down">
              <div v-if="showAddForm" class="border-b border-slate-100 bg-slate-50/60 px-6 py-4">
                <div class="flex flex-wrap items-end gap-3">
                  <div class="flex flex-col gap-1.5">
                    <label class="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Fecha</label>
                    <input
                      v-model="newDate"
                      type="date"
                      class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
                    />
                  </div>
                  <div class="flex flex-col gap-1.5">
                    <label class="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Tipo</label>
                    <div class="flex rounded-lg border border-slate-200 bg-white overflow-hidden">
                      <button
                        class="px-3 py-2 text-[12px] font-medium transition-colors"
                        :class="newType === 'unavailable' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'"
                        @click="newType = 'unavailable'"
                      >No disponible</button>
                      <button
                        class="px-3 py-2 text-[12px] font-medium transition-colors border-l border-slate-200"
                        :class="newType === 'custom' ? 'bg-primary text-white' : 'text-slate-500 hover:bg-slate-50'"
                        @click="newType = 'custom'"
                      >Horario especial</button>
                    </div>
                  </div>
                  <template v-if="newType === 'custom'">
                    <div class="flex flex-col gap-1.5">
                      <label class="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Inicio</label>
                      <input v-model="newStart" type="time"
                        class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none" />
                    </div>
                    <div class="flex flex-col gap-1.5">
                      <label class="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Fin</label>
                      <input v-model="newEnd" type="time"
                        class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none" />
                    </div>
                  </template>
                  <div class="flex gap-2 pb-px">
                    <button class="btn btn-primary btn-sm" :disabled="!newDate" @click="addOverride">Añadir</button>
                    <button class="btn btn-secondary btn-sm" @click="showAddForm = false; newDate = ''">Cancelar</button>
                  </div>
                </div>
              </div>
            </Transition>

            <!-- Lista de overrides -->
            <div v-if="overrides.length" class="divide-y divide-slate-50">
              <div
                v-for="(ov, i) in overrides"
                :key="ov.override_date"
                class="flex items-center justify-between px-6 py-3 transition-colors hover:bg-slate-50/50"
              >
                <div class="flex items-center gap-3">
                  <div
                    class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-xs font-bold"
                    :class="ov.is_available
                      ? 'bg-primary/10 text-primary'
                      : 'bg-slate-100 text-slate-400'"
                  >
                    <CalendarOff v-if="!ov.is_available" class="h-3.5 w-3.5" />
                    <Clock v-else class="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <p class="text-[13px] font-medium text-slate-700">{{ fmtDate(ov.override_date) }}</p>
                    <p class="text-[11px] text-slate-400">
                      <span v-if="!ov.is_available">No disponible</span>
                      <span v-else>{{ ov.start_time }} – {{ ov.end_time }}</span>
                    </p>
                  </div>
                </div>
                <button
                  class="rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-400"
                  @click="removeOverride(i)"
                >
                  <X class="h-4 w-4" />
                </button>
              </div>
            </div>
            <div v-else-if="!showAddForm" class="px-6 py-8 text-center">
              <p class="text-sm text-slate-400">Sin excepciones definidas.</p>
              <p class="mt-0.5 text-xs text-slate-300">Añade fechas en las que tu disponibilidad cambia.</p>
            </div>

            <!-- Guardar overrides si hay cambios -->
            <div v-if="overrides.length" class="border-t border-slate-100 px-6 py-4">
              <button :disabled="savingWH" class="btn btn-primary btn-sm" @click="saveWH">
                <Spinner v-if="savingWH" :size="13" light />
                <Check v-else class="h-3.5 w-3.5" />
                {{ savingWH ? 'Guardando…' : 'Guardar fechas' }}
              </button>
            </div>
          </div>

        </div>
      </template>

    </div><!-- fin cuerpo -->

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

.slide-down-enter-active { transition: all 0.2s ease; }
.slide-down-leave-active { transition: all 0.15s ease; }
.slide-down-enter-from, .slide-down-leave-to { opacity: 0; transform: translateY(-6px); }
</style>
