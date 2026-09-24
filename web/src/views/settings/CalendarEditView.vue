<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { CalendarDays, Copy, Check, Eye, Save, Trash2, Upload, X, Video, Phone, Link, MapPin, ChevronDown, Search, Users, Star } from 'lucide-vue-next';
import { api } from '../../api';
import { useDialog } from '../../composables/useDialog';
import type { Calendar, CalendarAvailability, CalendarMember } from '../../types';
import Spinner from '../../components/Spinner.vue';
import { TIMEZONES } from '../../utils/timezones';

const { alert } = useDialog();
const route  = useRoute();
const router = useRouter();

const isNew = computed(() => route.params.id === 'new');
const id    = computed(() => route.params.id as string);

interface FormData {
  name: string; color: string; slug: string; timezone: string;
  description: string; booking_enabled: boolean;
  duration_minutes: number; buffer_minutes: number;
  min_notice_hours: number; max_advance_days: number;
  custom_message: string; logo_url: string; location: string;
  location_type: 'custom' | 'google_meet' | 'zoom' | 'phone';
  availability: CalendarAvailability[];
  member_ids: string[];
  primary_user_id: string;
}

const LOCATION_TYPES = [
  { value: 'google_meet' as const, label: 'Google Meet', icon: Video },
  { value: 'zoom'        as const, label: 'Zoom',        icon: Video },
  { value: 'phone'       as const, label: 'Teléfono',    icon: Phone },
  { value: 'custom'      as const, label: 'Personalizado', icon: Link },
];

const DAYS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const COLORS = ['#F69008','#60D0FA','#10B981','#8B5CF6','#EF4444','#F59E0B','#3B82F6','#EC4899','#6366F1'];

const DURATIONS = [
  { value: 15,  label: '15 min' },
  { value: 30,  label: '30 min' },
  { value: 45,  label: '45 min' },
  { value: 60,  label: '1 hora' },
  { value: 90,  label: '1.5 horas' },
  { value: 120, label: '2 horas' },
];
const BUFFERS = [
  { value: 0,  label: 'Sin buffer' },
  { value: 5,  label: '5 min' },
  { value: 10, label: '10 min' },
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
];
const NOTICE_HOURS = [
  { value: 0,  label: 'Sin anticipación',       sameDay: true  },
  { value: 1,  label: '1 hora antes',           sameDay: true  },
  { value: 2,  label: '2 horas antes',          sameDay: true  },
  { value: 4,  label: '4 horas antes',          sameDay: true  },
  { value: 8,  label: '8 horas antes',          sameDay: true  },
  { value: 12, label: '12 horas antes',         sameDay: true  },
  { value: 24, label: '1 día de anticipación',  sameDay: false },
  { value: 48, label: '2 días de anticipación', sameDay: false },
  { value: 72, label: '3 días de anticipación', sameDay: false },
];
const ADVANCE_DAYS = [
  { value: 14, label: '2 semanas' },
  { value: 30, label: '1 mes' },
  { value: 60, label: '2 meses' },
  { value: 90, label: '3 meses' },
];

function defaultAvailability(): CalendarAvailability[] {
  return [
    ...[1,2,3,4,5].map(d => ({ day_of_week: d, start_time: '09:00', end_time: '18:00', is_active: true })),
    ...[0,6].map(d =>       ({ day_of_week: d, start_time: '09:00', end_time: '18:00', is_active: false })),
  ];
}

function emptyForm(): FormData {
  return {
    name: '', color: '#F69008', slug: '', timezone: 'America/Caracas',
    description: '', booking_enabled: false,
    duration_minutes: 30, buffer_minutes: 0, min_notice_hours: 2, max_advance_days: 60,
    custom_message: '', logo_url: '', location: '', location_type: 'custom',
    availability: defaultAvailability(),
    member_ids: [], primary_user_id: '',
  };
}

function trimTime(t: string) { return t.length > 5 ? t.slice(0, 5) : t; }

function fromCal(cal: Calendar): FormData {
  const avMap: Record<number, CalendarAvailability> = {};
  for (const a of (cal.availability ?? [])) avMap[a.day_of_week] = a;
  const members = cal.members ?? [];
  const primary = members.find(m => m.is_primary);
  return {
    name: cal.name, color: cal.color, slug: cal.slug, timezone: cal.timezone,
    description: cal.description ?? '', booking_enabled: cal.booking_enabled,
    duration_minutes: cal.duration_minutes, buffer_minutes: cal.buffer_minutes,
    min_notice_hours: cal.min_notice_hours, max_advance_days: cal.max_advance_days,
    custom_message: cal.custom_message ?? '', logo_url: cal.logo_url ?? '',
    location: (cal as any).location ?? '', location_type: (cal as any).location_type ?? 'custom',
    availability: [0,1,2,3,4,5,6].map(d => {
      const a = avMap[d];
      return a
        ? { ...a, start_time: trimTime(a.start_time), end_time: trimTime(a.end_time) }
        : { day_of_week: d, start_time: '09:00', end_time: '18:00', is_active: false };
    }),
    member_ids:      members.map(m => m.user_id),
    primary_user_id: primary?.user_id ?? cal.user_id,
  };
}

const loading         = ref(true);
const loadError       = ref('');
const saving          = ref(false);
const saved           = ref(false);
const copied          = ref(false);
const googleConnected = ref(false);
const form            = ref<FormData>(emptyForm());
const original        = ref<string>('');
const isDirty         = computed(() => JSON.stringify(form.value) !== original.value);

// ── Equipo (miembros del calendario) ─────────────────────────────────────────
const teamMembers     = ref<CalendarMember[]>([]);
const memberQuery     = ref('');
const memberResults   = ref<{ id: string; name: string; email: string }[]>([]);
const showMemberDrop  = ref(false);

let _memberTimer: ReturnType<typeof setTimeout>;
watch(memberQuery, (val) => {
  clearTimeout(_memberTimer);
  if (!val.trim()) { memberResults.value = []; showMemberDrop.value = false; return; }
  _memberTimer = setTimeout(async () => {
    try {
      const users = await api.get<{ id: string; name: string; email: string }[]>(
        `/users?q=${encodeURIComponent(val)}&limit=6`,
      );
      // Excluir los que ya son miembros
      memberResults.value = users.filter(u => !teamMembers.value.some(m => m.user_id === u.id));
      showMemberDrop.value = memberResults.value.length > 0;
    } catch { /* ignore */ }
  }, 250);
});

function addMemberFromResult(u: { id: string; name: string; email: string }) {
  if (teamMembers.value.some(m => m.user_id === u.id)) return;
  const isFirst = teamMembers.value.length === 0;
  teamMembers.value.push({ user_id: u.id, name: u.name, email: u.email, is_primary: isFirst });
  form.value.member_ids = teamMembers.value.map(m => m.user_id);
  if (isFirst) form.value.primary_user_id = u.id;
  memberQuery.value = '';
  memberResults.value = [];
  showMemberDrop.value = false;
}

function removeMember(userId: string) {
  const wasPrimary = form.value.primary_user_id === userId;
  teamMembers.value = teamMembers.value.filter(m => m.user_id !== userId);
  form.value.member_ids = teamMembers.value.map(m => m.user_id);
  if (wasPrimary && teamMembers.value.length > 0) {
    setPrimary(teamMembers.value[0].user_id);
  }
}

function setPrimary(userId: string) {
  teamMembers.value = teamMembers.value.map(m => ({ ...m, is_primary: m.user_id === userId }));
  form.value.primary_user_id = userId;
}

function onMemberBlur() { setTimeout(() => { showMemberDrop.value = false; }, 200); }

function avatarColor(name: string): string {
  const colors = ['#F69008','#10B981','#8B5CF6','#3B82F6','#EC4899','#EF4444','#F59E0B'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

// Sincronizar teamMembers cuando se carga el calendario
watch(() => form.value.member_ids, () => { /* handled in load */ }, { deep: true });

// ── Custom dropdowns ──────────────────────────────────────────────────────────
type DropState = { open: boolean; search: string; el: HTMLElement | null };

function makeDrop(): DropState { return { open: false, search: '', el: null }; }

const tzDrop  = ref<DropState>(makeDrop());
const durDrop = ref<DropState>(makeDrop());
const bufDrop = ref<DropState>(makeDrop());
const notDrop = ref<DropState>(makeDrop());
const winDrop = ref<DropState>(makeDrop());

function filterOpts<T extends { label: string; value: unknown }>(list: T[], q: string): T[] {
  const lq = q.trim().toLowerCase();
  return lq ? list.filter(o => o.label.toLowerCase().includes(lq)) : list;
}

const tzLabel  = computed(() => TIMEZONES.find(o => o.value === form.value.timezone)?.label ?? '');
const durLabel = computed(() => DURATIONS.find(o => o.value === form.value.duration_minutes)?.label ?? '');
const bufLabel = computed(() => BUFFERS.find(o => o.value === form.value.buffer_minutes)?.label ?? '');
const notLabel   = computed(() => NOTICE_HOURS.find(o => o.value === form.value.min_notice_hours)?.label ?? '');
const notSameDay = computed(() => NOTICE_HOURS.find(o => o.value === form.value.min_notice_hours)?.sameDay ?? true);
const winLabel = computed(() => ADVANCE_DAYS.find(o => o.value === form.value.max_advance_days)?.label ?? '');

const tzFiltered  = computed(() => filterOpts(TIMEZONES, tzDrop.value.search));
const durFiltered = computed(() => filterOpts(DURATIONS, durDrop.value.search));
const bufFiltered = computed(() => filterOpts(BUFFERS, bufDrop.value.search));
const notFiltered = computed(() => filterOpts(NOTICE_HOURS, notDrop.value.search));
const winFiltered = computed(() => filterOpts(ADVANCE_DAYS, winDrop.value.search));

// En el template los refs se auto-unwrappean, así que el argumento es DropState
function toggleDrop(drop: DropState) {
  const wasOpen = drop.open;
  for (const d of [tzDrop, durDrop, bufDrop, notDrop, winDrop]) {
    d.value.open = false; d.value.search = '';
  }
  drop.open = !wasOpen;
}
function closeDrop(drop: DropState) { drop.open = false; drop.search = ''; }

function pickTz(v: string)  { form.value.timezone = v;          closeDrop(tzDrop.value); }
function pickDur(v: number) { form.value.duration_minutes = v;  closeDrop(durDrop.value); }
function pickBuf(v: number) { form.value.buffer_minutes = v;    closeDrop(bufDrop.value); }
function pickNot(v: number) { form.value.min_notice_hours = v;  closeDrop(notDrop.value); }
function pickWin(v: number) { form.value.max_advance_days = v;  closeDrop(winDrop.value); }

function onOutside(e: MouseEvent) {
  for (const d of [tzDrop, durDrop, bufDrop, notDrop, winDrop]) {
    if (d.value.open && d.value.el && !d.value.el.contains(e.target as Node)) {
      d.value.open = false; d.value.search = '';
    }
  }
}

// ── Carga inicial ─────────────────────────────────────────────────────────────
async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    let calOwnerId: string | null = null;
    if (isNew.value) {
      form.value = emptyForm();
      teamMembers.value = [];
    } else {
      const cal = await api.get<Calendar>(`/calendars/${id.value}`);
      calOwnerId = cal.user_id;
      form.value = fromCal(cal);
      teamMembers.value = cal.members ?? [];
    }
    original.value = JSON.stringify(form.value);
    // Verificar si Google Calendar está conectado (usando el dueño del calendario)
    try {
      const ownerParam = calOwnerId ? `?forUserId=${calOwnerId}` : '';
      const settings = await api.get<{ google_connected: boolean }>(`/calendar/settings${ownerParam}`);
      googleConnected.value = settings.google_connected;
    } catch {}
  } catch (e: unknown) {
    loadError.value = (e as { message?: string })?.message ?? 'No se pudo cargar el calendario';
  } finally {
    loading.value = false;
  }
}
onMounted(() => { load(); document.addEventListener('click', onOutside, true); });
onUnmounted(() => { document.removeEventListener('click', onOutside, true); });

// ── Slug auto-gen (solo al crear) ─────────────────────────────────────────────
function autoSlug() {
  if (!isNew.value) return;
  form.value.slug = form.value.name
    .toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '-').slice(0, 40);
}

// ── Guardar ───────────────────────────────────────────────────────────────────
async function save() {
  if (!form.value.name.trim()) return;
  saving.value = true;
  try {
    const payload = {
      ...form.value,
      description:    form.value.description.trim()    || null,
      custom_message: form.value.custom_message.trim() || null,
      logo_url:       form.value.logo_url               || null,
      location:       form.value.location_type === 'custom' || form.value.location_type === 'phone'
                        ? (form.value.location.trim() || null)
                        : null,
      location_type:  form.value.location_type,
      slug:           form.value.slug.trim()            || undefined,
      member_ids:     form.value.member_ids.length > 0 ? form.value.member_ids : undefined,
      primary_user_id: form.value.primary_user_id || undefined,
    };
    if (isNew.value) {
      const created = await api.post<Calendar>('/calendars', payload);
      router.replace(`/settings/calendars/${created.id}`);
    } else {
      await api.patch(`/calendars/${id.value}`, payload);
      original.value = JSON.stringify(form.value);
      saved.value = true;
      setTimeout(() => { saved.value = false; }, 2500);
    }
  } catch (err: unknown) {
    const e = err as { message?: string; error?: unknown };
    const msg = typeof e.error === 'string'
      ? e.error
      : e.message && !e.message.includes('[object')
        ? e.message
        : 'Error al guardar los cambios. Verifica los datos e intenta de nuevo.';
    await alert(msg);
  } finally {
    saving.value = false;
  }
}

// ── Copiar link ───────────────────────────────────────────────────────────────
function bookingUrl() { return `${window.location.origin}/book/${form.value.slug}`; }
async function copyLink() {
  if (!form.value.slug) return;
  await navigator.clipboard.writeText(bookingUrl());
  copied.value = true;
  setTimeout(() => { copied.value = false; }, 2000);
}

// ── Logo upload ───────────────────────────────────────────────────────────────
const logoInput = ref<HTMLInputElement | null>(null);
function pickLogo() { logoInput.value?.click(); }
function removeLogo() { form.value.logo_url = ''; }

async function onLogoFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  form.value.logo_url = await resizeImage(file, 256);
  (e.target as HTMLInputElement).value = '';
}

function resizeImage(file: File, maxPx: number): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(maxPx / img.width, maxPx / img.height, 1);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = ev.target!.result as string;
    };
    reader.readAsDataURL(file);
  });
}

// ── Modal de eliminación con confirmación "ELIMINAR" ──────────────────────────
const showDeleteModal  = ref(false);
const deleteConfirmTxt = ref('');
const deleting         = ref(false);

function openDeleteModal() {
  deleteConfirmTxt.value = '';
  showDeleteModal.value = true;
}

async function confirmDelete() {
  if (deleteConfirmTxt.value !== 'ELIMINAR') return;
  deleting.value = true;
  try {
    await api.del(`/calendars/${id.value}`);
    router.replace('/settings/calendars');
  } catch (e: unknown) {
    await alert((e as { message?: string })?.message ?? 'No se puede eliminar');
  } finally {
    deleting.value = false;
    showDeleteModal.value = false;
  }
}
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden">

    <!-- ── Header ──────────────────────────────────────────────────────────── -->
    <div class="page-toolbar justify-between">
      <div class="flex items-center gap-2 min-w-0 sm:gap-3">
        <button class="btn btn-secondary btn-sm flex-shrink-0" @click="router.back()">
          ← <span class="hidden sm:inline">Mis calendarios</span>
        </button>
        <div class="h-5 w-px flex-shrink-0 bg-slate-200"></div>
        <div class="min-w-0">
          <p class="truncate text-[15px] font-semibold text-slate-900">
            {{ isNew ? 'Nuevo calendario' : (form.name || 'Editar calendario') }}
          </p>
          <p class="hidden text-[12px] text-slate-400 sm:block">{{ isNew ? 'Completa los datos para crear tu calendario' : 'Configuración del calendario' }}</p>
        </div>
      </div>

      <div class="flex flex-shrink-0 items-center gap-2 ml-2 sm:ml-4">
        <!-- Copiar link (solo si hay slug y no es nuevo) -->
        <button v-if="!isNew && form.slug && form.booking_enabled"
          class="btn btn-secondary btn-sm hidden sm:flex"
          @click="copyLink">
          <Check v-if="copied" class="h-3.5 w-3.5 text-emerald-500" />
          <Copy v-else class="h-3.5 w-3.5" />
          {{ copied ? 'Copiado' : 'Copiar link' }}
        </button>
        <!-- Ver página pública -->
        <a v-if="!isNew && form.slug && form.booking_enabled"
          :href="bookingUrl()" target="_blank"
          class="btn btn-secondary btn-sm p-1.5 hidden sm:flex">
          <Eye class="h-4 w-4" />
        </a>
        <!-- Guardar -->
        <button
          :disabled="saving || (!isDirty && !isNew) || !form.name.trim()"
          class="flex cursor-pointer items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition-all disabled:opacity-50"
          :class="saved ? 'bg-emerald-500 shadow-emerald-200' : 'bg-primary shadow-primary/30 hover:bg-primary-dark'"
          @click="save">
          <Spinner v-if="saving" :size="14" light />
          <Check v-else-if="saved" class="h-4 w-4" />
          <Save v-else class="h-4 w-4" />
          {{ isNew ? 'Crear calendario' : (saved ? 'Guardado' : 'Guardar cambios') }}
        </button>
      </div>
    </div>

    <!-- ── Body ────────────────────────────────────────────────────────────── -->
    <div class="flex-1 overflow-y-auto bg-slate-50">
      <div v-if="loading" class="flex justify-center py-24"><Spinner :size="28" /></div>

      <div v-else-if="loadError" class="flex flex-col items-center justify-center py-24 text-center">
        <p class="font-semibold text-slate-700">No se pudo cargar el calendario</p>
        <p class="mt-1 text-sm text-slate-400">{{ loadError }}</p>
        <button class="btn btn-primary mt-4" @click="load">Reintentar</button>
      </div>

      <div v-else class="space-y-5 px-6 py-6">

        <!-- ── Identidad ──────────────────────────────────────────────────── -->
        <section class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
          <div class="border-b border-slate-100 px-6 py-4">
            <p class="text-[13px] font-semibold uppercase tracking-wider text-slate-400">Identidad</p>
          </div>
          <div class="px-6 py-5 space-y-5">

            <!-- Logo + nombre + color en una fila -->
            <div class="flex items-start gap-5">
              <!-- Logo upload -->
              <div class="flex flex-col items-center gap-2 flex-shrink-0">
                <div
                  class="relative h-20 w-20 cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 transition-all hover:border-primary/50 group"
                  :style="form.logo_url ? '' : `background: ${form.color}15; border-color: ${form.color}40`"
                  @click="pickLogo"
                >
                  <img v-if="form.logo_url" :src="form.logo_url" alt="Logo" class="h-full w-full object-cover" />
                  <div v-else class="flex h-full w-full flex-col items-center justify-center gap-1"
                    :style="`color: ${form.color}`">
                    <CalendarDays class="h-7 w-7" />
                  </div>
                  <!-- Overlay al hover -->
                  <div class="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/40 opacity-0 transition-opacity group-hover:opacity-100 rounded-2xl">
                    <Upload class="h-5 w-5 text-white" />
                    <span class="text-[10px] font-semibold text-white">Logo</span>
                  </div>
                </div>
                <button v-if="form.logo_url"
                  class="flex cursor-pointer items-center gap-1 text-[11px] text-slate-400 hover:text-red-500 transition-colors"
                  @click.stop="removeLogo">
                  <X class="h-3 w-3" /> Quitar
                </button>
                <button v-else
                  class="text-[11px] text-primary hover:underline cursor-pointer"
                  @click="pickLogo">
                  Subir logo
                </button>
                <input ref="logoInput" type="file" accept="image/*" class="hidden" @change="onLogoFile" />
              </div>

              <!-- Nombre + color -->
              <div class="flex-1 space-y-4">
                <div>
                  <label class="ce-label">Nombre *</label>
                  <input v-model="form.name" type="text" placeholder="Mi calendario"
                    class="ce-input" @input="autoSlug" />
                </div>
                <div>
                  <label class="ce-label">Color</label>
                  <div class="flex flex-wrap gap-2 pt-0.5">
                    <button v-for="c in COLORS" :key="c" type="button"
                      class="h-7 w-7 cursor-pointer rounded-full border-2 transition-all hover:scale-110"
                      :style="`background:${c}`"
                      :class="form.color === c ? 'border-slate-700 scale-110 ring-2 ring-offset-1 ring-slate-300' : 'border-transparent'"
                      @click="form.color = c" />
                  </div>
                </div>
              </div>
            </div>

            <!-- Slug + Timezone -->
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label class="ce-label">Slug del link</label>
                <div class="flex overflow-hidden rounded-lg border border-slate-200 transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
                  <span class="flex shrink-0 items-center border-r border-slate-200 bg-slate-100 px-3 text-[11px] text-slate-400">/book/</span>
                  <input v-model="form.slug" type="text" placeholder="mi-calendario"
                    class="flex-1 bg-white px-3 py-2 text-sm outline-none" />
                </div>
                <p class="mt-1 text-[11px] text-slate-400">Solo letras, números y guiones</p>
              </div>
              <div>
                <label class="ce-label">Zona horaria</label>
                <div :ref="el => tzDrop.el = el as HTMLElement" class="relative">
                  <button type="button"
                    class="ce-input flex items-center justify-between cursor-pointer"
                    :class="tzDrop.open ? 'border-primary ring-2 ring-primary/15' : ''"
                    @click="toggleDrop(tzDrop)"
                  >
                    <span class="truncate text-slate-900">{{ tzLabel }}</span>
                    <ChevronDown class="h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ml-2" :class="tzDrop.open ? 'rotate-180' : ''" />
                  </button>
                  <Transition name="ce-drop">
                    <div v-if="tzDrop.open" class="absolute z-30 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
                      <div class="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
                        <Search class="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <input v-model="tzDrop.search" type="text" placeholder="Buscar zona horaria…" autocomplete="off"
                          class="flex-1 bg-transparent text-sm text-slate-700 placeholder-slate-400 outline-none" />
                      </div>
                      <div class="max-h-52 overflow-y-auto">
                        <button v-for="o in tzFiltered" :key="o.value" type="button"
                          class="flex w-full items-center gap-2 px-3 py-2.5 text-sm transition-colors cursor-pointer"
                          :class="form.timezone === o.value ? 'bg-primary/8 font-semibold text-primary' : 'text-slate-700 hover:bg-slate-50'"
                          @click="pickTz(o.value)"
                        >
                          <Check v-if="form.timezone === o.value" class="h-3.5 w-3.5 shrink-0 text-primary" />
                          <span v-else class="inline-block h-3.5 w-3.5 shrink-0" />
                          {{ o.label }}
                        </button>
                        <p v-if="tzFiltered.length === 0" class="px-3 py-3 text-center text-xs text-slate-400">Sin resultados</p>
                      </div>
                    </div>
                  </Transition>
                </div>
              </div>
            </div>

            <!-- Descripción -->
            <div>
              <label class="ce-label">Descripción <span class="font-normal text-slate-400">(opcional)</span></label>
              <textarea v-model="form.description" rows="2"
                placeholder="¿De qué trata este calendario?"
                class="ce-input resize-none" />
            </div>
          </div>
        </section>

        <!-- ── Equipo ─────────────────────────────────────────────────────── -->
        <section class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
          <div class="border-b border-slate-100 px-6 py-4">
            <div class="flex items-center gap-2">
              <Users class="h-4 w-4 text-slate-400" />
              <p class="text-[13px] font-semibold uppercase tracking-wider text-slate-400">Equipo</p>
            </div>
            <p class="mt-0.5 text-xs text-slate-400">Co-propietarios del calendario. El Principal usa su Google Calendar para crear reuniones Meet.</p>
          </div>
          <div class="px-6 py-5 space-y-4">

            <!-- Lista de miembros actuales -->
            <div v-if="teamMembers.length > 0" class="space-y-2">
              <div
                v-for="m in teamMembers"
                :key="m.user_id"
                class="flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors"
                :class="m.is_primary ? 'border-primary/30 bg-primary/4' : 'border-slate-200 bg-white'"
              >
                <!-- Avatar -->
                <div
                  class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                  :style="`background: ${avatarColor(m.name)}`"
                >
                  {{ m.name.charAt(0).toUpperCase() }}
                </div>

                <!-- Info -->
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <span class="truncate text-sm font-medium text-slate-800">{{ m.name }}</span>
                    <span v-if="m.is_primary"
                      class="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                      <Star class="h-2.5 w-2.5" /> Principal
                    </span>
                  </div>
                  <p class="truncate text-[11px] text-slate-400">{{ m.email }}</p>
                </div>

                <!-- Acciones -->
                <div class="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    v-if="!m.is_primary"
                    type="button"
                    class="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-500 hover:border-primary hover:text-primary transition-colors cursor-pointer"
                    @click="setPrimary(m.user_id)"
                    title="Marcar como principal"
                  >
                    Principal
                  </button>
                  <button
                    type="button"
                    :disabled="teamMembers.length <= 1"
                    class="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                    @click="removeMember(m.user_id)"
                    title="Quitar del calendario"
                  >
                    <X class="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>

            <div v-else class="rounded-lg border border-dashed border-slate-200 py-6 text-center">
              <Users class="mx-auto mb-2 h-6 w-6 text-slate-300" />
              <p class="text-sm text-slate-400">Sin miembros adicionales</p>
              <p class="mt-0.5 text-xs text-slate-300">El propietario del calendario ya tiene acceso</p>
            </div>

            <!-- Buscador de usuarios -->
            <div class="relative">
              <div class="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
                <Search class="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <input
                  v-model="memberQuery"
                  type="text"
                  placeholder="Buscar usuario para añadir…"
                  autocomplete="off"
                  class="flex-1 bg-transparent text-sm text-slate-700 placeholder-slate-400 outline-none"
                  @blur="onMemberBlur"
                />
              </div>
              <div
                v-if="showMemberDrop && memberResults.length > 0"
                class="absolute z-20 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden"
              >
                <button
                  v-for="u in memberResults"
                  :key="u.id"
                  type="button"
                  class="flex w-full items-center gap-3 px-3 py-2.5 text-sm transition-colors cursor-pointer hover:bg-slate-50"
                  @click="addMemberFromResult(u)"
                >
                  <div
                    class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                    :style="`background: ${avatarColor(u.name)}`"
                  >
                    {{ u.name.charAt(0).toUpperCase() }}
                  </div>
                  <div class="min-w-0 flex-1 text-left">
                    <p class="font-medium text-slate-800">{{ u.name }}</p>
                    <p class="text-xs text-slate-400 truncate">{{ u.email }}</p>
                  </div>
                </button>
              </div>
            </div>

          </div>
        </section>

        <!-- ── Reserva en línea ───────────────────────────────────────────── -->
        <section class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
          <div class="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <div>
              <p class="text-[13px] font-semibold uppercase tracking-wider text-slate-400">Reserva en línea</p>
              <p class="mt-0.5 text-xs text-slate-400">Permite que tus clientes agenden desde un link público</p>
            </div>
            <button type="button"
              class="relative h-6 w-11 flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200"
              :class="form.booking_enabled ? 'bg-primary' : 'bg-slate-300'"
              @click="form.booking_enabled = !form.booking_enabled">
              <div class="absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200"
                :class="form.booking_enabled ? 'translate-x-5' : 'translate-x-1'"></div>
            </button>
          </div>

          <Transition name="expand">
            <div v-if="form.booking_enabled" class="px-6 py-5 space-y-4">
              <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <!-- Duración -->
                <div>
                  <label class="ce-label-sm">Duración</label>
                  <div :ref="el => durDrop.el = el as HTMLElement" class="relative">
                    <button type="button"
                      class="ce-drop-sm"
                      :class="durDrop.open ? 'border-primary ring-2 ring-primary/15' : ''"
                      @click="toggleDrop(durDrop)"
                    >
                      <span class="truncate">{{ durLabel }}</span>
                      <ChevronDown class="h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform duration-200" :class="durDrop.open ? 'rotate-180' : ''" />
                    </button>
                    <Transition name="ce-drop">
                      <div v-if="durDrop.open" class="absolute z-30 mt-1 w-40 rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
                        <div class="flex items-center gap-1.5 border-b border-slate-100 px-2 py-1.5">
                          <Search class="h-3 w-3 shrink-0 text-slate-400" />
                          <input v-model="durDrop.search" type="text" placeholder="Buscar…" autocomplete="off"
                            class="flex-1 bg-transparent text-xs text-slate-700 placeholder-slate-400 outline-none" />
                        </div>
                        <div class="max-h-48 overflow-y-auto">
                          <button v-for="o in durFiltered" :key="o.value" type="button"
                            class="flex w-full items-center gap-1.5 px-2.5 py-2 text-xs transition-colors cursor-pointer"
                            :class="form.duration_minutes === o.value ? 'bg-primary/8 font-semibold text-primary' : 'text-slate-700 hover:bg-slate-50'"
                            @click="pickDur(o.value)"
                          >
                            <Check v-if="form.duration_minutes === o.value" class="h-3 w-3 shrink-0 text-primary" />
                            <span v-else class="inline-block h-3 w-3 shrink-0" />
                            {{ o.label }}
                          </button>
                          <p v-if="durFiltered.length === 0" class="px-2.5 py-2 text-center text-xs text-slate-400">Sin resultados</p>
                        </div>
                      </div>
                    </Transition>
                  </div>
                </div>

                <!-- Buffer -->
                <div>
                  <label class="ce-label-sm">Buffer</label>
                  <div :ref="el => bufDrop.el = el as HTMLElement" class="relative">
                    <button type="button"
                      class="ce-drop-sm"
                      :class="bufDrop.open ? 'border-primary ring-2 ring-primary/15' : ''"
                      @click="toggleDrop(bufDrop)"
                    >
                      <span class="truncate">{{ bufLabel }}</span>
                      <ChevronDown class="h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform duration-200" :class="bufDrop.open ? 'rotate-180' : ''" />
                    </button>
                    <Transition name="ce-drop">
                      <div v-if="bufDrop.open" class="absolute z-30 mt-1 w-40 rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
                        <div class="flex items-center gap-1.5 border-b border-slate-100 px-2 py-1.5">
                          <Search class="h-3 w-3 shrink-0 text-slate-400" />
                          <input v-model="bufDrop.search" type="text" placeholder="Buscar…" autocomplete="off"
                            class="flex-1 bg-transparent text-xs text-slate-700 placeholder-slate-400 outline-none" />
                        </div>
                        <div class="max-h-48 overflow-y-auto">
                          <button v-for="o in bufFiltered" :key="o.value" type="button"
                            class="flex w-full items-center gap-1.5 px-2.5 py-2 text-xs transition-colors cursor-pointer"
                            :class="form.buffer_minutes === o.value ? 'bg-primary/8 font-semibold text-primary' : 'text-slate-700 hover:bg-slate-50'"
                            @click="pickBuf(o.value)"
                          >
                            <Check v-if="form.buffer_minutes === o.value" class="h-3 w-3 shrink-0 text-primary" />
                            <span v-else class="inline-block h-3 w-3 shrink-0" />
                            {{ o.label }}
                          </button>
                          <p v-if="bufFiltered.length === 0" class="px-2.5 py-2 text-center text-xs text-slate-400">Sin resultados</p>
                        </div>
                      </div>
                    </Transition>
                  </div>
                </div>

                <!-- Anticipación mínima -->
                <div class="col-span-2 sm:col-span-2">
                  <label class="ce-label-sm">Anticipación mínima</label>
                  <div class="flex items-center gap-2">
                    <div :ref="el => notDrop.el = el as HTMLElement" class="relative flex-1">
                      <button type="button"
                        class="ce-drop-sm"
                        :class="notDrop.open ? 'border-primary ring-2 ring-primary/15' : ''"
                        @click="toggleDrop(notDrop)"
                      >
                        <span class="truncate">{{ notLabel }}</span>
                        <ChevronDown class="h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform duration-200" :class="notDrop.open ? 'rotate-180' : ''" />
                      </button>
                      <Transition name="ce-drop">
                        <div v-if="notDrop.open" class="absolute z-30 mt-1 w-52 rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
                          <div class="max-h-56 overflow-y-auto divide-y divide-slate-50">
                            <!-- Grupo: Mismo día -->
                            <div class="px-2.5 pt-2 pb-1">
                              <p class="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Permite mismo día</p>
                              <template v-for="o in NOTICE_HOURS.filter(x => x.sameDay)" :key="o.value">
                                <button type="button"
                                  class="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs transition-colors cursor-pointer"
                                  :class="form.min_notice_hours === o.value ? 'bg-primary/8 font-semibold text-primary' : 'text-slate-700 hover:bg-slate-50'"
                                  @click="pickNot(o.value)"
                                >
                                  <Check v-if="form.min_notice_hours === o.value" class="h-3 w-3 shrink-0 text-primary" />
                                  <span v-else class="inline-block h-3 w-3 shrink-0" />
                                  {{ o.label }}
                                </button>
                              </template>
                            </div>
                            <!-- Grupo: No mismo día -->
                            <div class="px-2.5 pt-2 pb-1">
                              <p class="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">No permite mismo día</p>
                              <template v-for="o in NOTICE_HOURS.filter(x => !x.sameDay)" :key="o.value">
                                <button type="button"
                                  class="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs transition-colors cursor-pointer"
                                  :class="form.min_notice_hours === o.value ? 'bg-primary/8 font-semibold text-primary' : 'text-slate-700 hover:bg-slate-50'"
                                  @click="pickNot(o.value)"
                                >
                                  <Check v-if="form.min_notice_hours === o.value" class="h-3 w-3 shrink-0 text-primary" />
                                  <span v-else class="inline-block h-3 w-3 shrink-0" />
                                  {{ o.label }}
                                </button>
                              </template>
                            </div>
                          </div>
                        </div>
                      </Transition>
                    </div>
                    <!-- Indicador visual -->
                    <span
                      class="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                      :class="notSameDay
                        ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border border-amber-200 bg-amber-50 text-amber-700'"
                    >
                      <span class="h-1.5 w-1.5 rounded-full" :class="notSameDay ? 'bg-emerald-500' : 'bg-amber-400'"></span>
                      {{ notSameDay ? 'Mismo día ✓' : 'No mismo día' }}
                    </span>
                  </div>
                </div>

                <!-- Ventana de reserva -->
                <div>
                  <label class="ce-label-sm">Ventana</label>
                  <div :ref="el => winDrop.el = el as HTMLElement" class="relative">
                    <button type="button"
                      class="ce-drop-sm"
                      :class="winDrop.open ? 'border-primary ring-2 ring-primary/15' : ''"
                      @click="toggleDrop(winDrop)"
                    >
                      <span class="truncate">{{ winLabel }}</span>
                      <ChevronDown class="h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform duration-200" :class="winDrop.open ? 'rotate-180' : ''" />
                    </button>
                    <Transition name="ce-drop">
                      <div v-if="winDrop.open" class="absolute z-30 mt-1 w-44 rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
                        <div class="flex items-center gap-1.5 border-b border-slate-100 px-2 py-1.5">
                          <Search class="h-3 w-3 shrink-0 text-slate-400" />
                          <input v-model="winDrop.search" type="text" placeholder="Buscar…" autocomplete="off"
                            class="flex-1 bg-transparent text-xs text-slate-700 placeholder-slate-400 outline-none" />
                        </div>
                        <div class="max-h-48 overflow-y-auto">
                          <button v-for="o in winFiltered" :key="o.value" type="button"
                            class="flex w-full items-center gap-1.5 px-2.5 py-2 text-xs transition-colors cursor-pointer"
                            :class="form.max_advance_days === o.value ? 'bg-primary/8 font-semibold text-primary' : 'text-slate-700 hover:bg-slate-50'"
                            @click="pickWin(o.value)"
                          >
                            <Check v-if="form.max_advance_days === o.value" class="h-3 w-3 shrink-0 text-primary" />
                            <span v-else class="inline-block h-3 w-3 shrink-0" />
                            {{ o.label }}
                          </button>
                          <p v-if="winFiltered.length === 0" class="px-2.5 py-2 text-center text-xs text-slate-400">Sin resultados</p>
                        </div>
                      </div>
                    </Transition>
                  </div>
                </div>
              </div>
              <div>
                <label class="ce-label-sm">Mensaje para tus clientes</label>
                <textarea v-model="form.custom_message" rows="2"
                  placeholder="Ej: Te espero puntual. Puedes entrar desde el link 5 min antes."
                  class="ce-input resize-none text-sm" />
              </div>
              <div>
                <label class="ce-label-sm">Tipo de reunión <span class="font-normal text-slate-400">(opcional)</span></label>
                <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <button v-for="lt in LOCATION_TYPES" :key="lt.value" type="button"
                    class="flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center transition-all cursor-pointer"
                    :class="form.location_type === lt.value
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-slate-200 text-slate-500 hover:border-slate-300'"
                    @click="form.location_type = lt.value">
                    <component :is="lt.icon" class="h-4 w-4" />
                    <span class="text-xs font-medium">{{ lt.label }}</span>
                  </button>
                </div>
                <!-- Campo de URL/texto solo si es custom -->
                <div v-if="form.location_type === 'custom'" class="mt-2">
                  <input v-model="form.location" type="text"
                    placeholder="https://meet.google.com/... o dirección física"
                    class="ce-input text-sm" />
                </div>
                <!-- Mensaje informativo para google_meet -->
                <div v-else-if="form.location_type === 'google_meet'" class="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                  <p class="text-xs text-emerald-700">
                    <span v-if="googleConnected">✓ Google Calendar conectado — se creará un enlace de Meet automáticamente al agendar.</span>
                    <span v-else>⚠ Necesitas conectar Google Calendar en <a href="/settings/calendar" class="underline">Configuración → Calendario</a> para usar Google Meet.</span>
                  </p>
                </div>
                <div v-else-if="form.location_type === 'phone'" class="mt-2">
                  <input v-model="form.location" type="text"
                    placeholder="+58 412 555 0000"
                    class="ce-input text-sm" />
                </div>
              </div>
            </div>
          </Transition>

          <!-- Estado desactivado -->
          <div v-if="!form.booking_enabled" class="px-6 py-4">
            <p class="text-sm text-slate-400">La reserva en línea está desactivada. Actívala para recibir citas por link público.</p>
          </div>
        </section>

        <!-- ── Horario de disponibilidad ──────────────────────────────────── -->
        <section class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
          <div class="border-b border-slate-100 px-6 py-4">
            <p class="text-[13px] font-semibold uppercase tracking-wider text-slate-400">Horario de disponibilidad</p>
            <p class="mt-0.5 text-xs text-slate-400">Configura en qué días y horarios estás disponible</p>
          </div>
          <div class="px-6 py-5">
            <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div
                v-for="a in form.availability.slice().sort((x,y) => x.day_of_week - y.day_of_week)"
                :key="a.day_of_week"
                class="flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors"
                :class="a.is_active ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50 opacity-60'"
              >
                <button type="button"
                  class="relative h-5 w-9 flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200"
                  :class="a.is_active ? 'bg-primary' : 'bg-slate-200'"
                  @click="a.is_active = !a.is_active">
                  <div class="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200"
                    :class="a.is_active ? 'translate-x-4' : 'translate-x-0.5'"></div>
                </button>
                <span class="w-7 text-sm font-semibold text-slate-700">{{ DAYS[a.day_of_week] }}</span>
                <template v-if="a.is_active">
                  <input v-model="a.start_time" type="time"
                    class="flex-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs focus:border-primary focus:outline-none" />
                  <span class="text-xs text-slate-300">–</span>
                  <input v-model="a.end_time" type="time"
                    class="flex-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs focus:border-primary focus:outline-none" />
                </template>
                <span v-else class="text-xs text-slate-400">No disponible</span>
              </div>
            </div>
          </div>
        </section>

        <!-- ── Zona de peligro (solo al editar) ──────────────────────────── -->
        <section v-if="!isNew" class="overflow-hidden rounded-xl border border-red-100 bg-white shadow-card">
          <div class="border-b border-red-100 px-6 py-4">
            <p class="text-[13px] font-semibold uppercase tracking-wider text-red-400">Zona de peligro</p>
          </div>
          <div class="flex items-center justify-between px-6 py-5">
            <div>
              <p class="text-sm font-semibold text-slate-800">Eliminar este calendario</p>
              <p class="mt-0.5 text-xs text-slate-400">Esta acción es permanente. Las citas existentes se conservan.</p>
            </div>
            <button
              class="flex cursor-pointer items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 transition-all hover:bg-red-50 hover:border-red-300"
              @click="openDeleteModal"
            >
              <Trash2 class="h-4 w-4" /> Eliminar calendario
            </button>
          </div>
        </section>

      </div>
    </div>

    <!-- ── Modal de confirmación de eliminación ───────────────────────────── -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showDeleteModal"
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          @click.self="showDeleteModal = false">
          <div class="modal-panel w-full max-w-sm rounded-2xl bg-white p-6 shadow-modal">
            <div class="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-red-50">
              <Trash2 class="h-5 w-5 text-red-500" />
            </div>
            <h3 class="text-base font-semibold text-slate-900">¿Eliminar "{{ form.name }}"?</h3>
            <p class="mt-2 text-sm text-slate-500">
              Esta acción es permanente y no se puede deshacer. Escribe
              <strong class="font-semibold text-slate-800">ELIMINAR</strong> para confirmar.
            </p>
            <input
              v-model="deleteConfirmTxt"
              type="text"
              placeholder="ELIMINAR"
              class="mt-4 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-red-400 focus:ring-2 focus:ring-red-400/20"
              @keyup.enter="confirmDelete"
            />
            <div class="mt-4 flex gap-2">
              <button class="btn btn-ghost flex-1 justify-center" @click="showDeleteModal = false">Cancelar</button>
              <button
                :disabled="deleteConfirmTxt !== 'ELIMINAR' || deleting"
                class="btn btn-danger flex-1 justify-center bg-red-500 text-white hover:bg-red-600 disabled:opacity-40"
                @click="confirmDelete"
              >
                <Spinner v-if="deleting" :size="14" light />
                <Trash2 v-else class="h-4 w-4" />
                Eliminar
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style>
.ce-label    { display: block; font-size: 13px; font-weight: 500; color: #475569; margin-bottom: 5px; }
.ce-label-sm { display: block; font-size: 11px; font-weight: 500; color: #64748b; margin-bottom: 4px; }
.ce-input {
  width: 100%; border-radius: 8px; border: 1.5px solid #E2E8F0;
  padding: 8px 12px; font-size: 13px; color: #0F172A;
  background: #fff; outline: none; font-family: inherit;
  transition: border-color 0.15s, box-shadow 0.15s;
  display: flex; align-items: center; text-align: left; cursor: pointer;
}
.ce-input:focus { border-color: #F69008; box-shadow: 0 0 0 3px rgba(246,144,8,0.12); }
.ce-input::placeholder { color: #94A3B8; }

/* Botón-trigger para los dropdowns pequeños */
.ce-drop-sm {
  width: 100%; border-radius: 6px; border: 1.5px solid #E2E8F0;
  padding: 6px 8px; font-size: 12px; color: #0F172A;
  background: #fff; outline: none; font-family: inherit;
  transition: border-color 0.15s, box-shadow 0.15s;
  display: flex; align-items: center; justify-content: space-between; cursor: pointer;
}
.ce-drop-sm:hover { border-color: #CBD5E1; }

/* Animación del dropdown */
.ce-drop-enter-active, .ce-drop-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.ce-drop-enter-from, .ce-drop-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
