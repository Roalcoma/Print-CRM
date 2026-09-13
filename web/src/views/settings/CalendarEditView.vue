<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { CalendarDays, Copy, Check, Eye, Save, Trash2, Upload, X } from 'lucide-vue-next';
import { api } from '../../api';
import type { Calendar, CalendarAvailability } from '../../types';
import Spinner from '../../components/Spinner.vue';

const route  = useRoute();
const router = useRouter();

const isNew = computed(() => route.params.id === 'new');
const id    = computed(() => route.params.id as string);

interface FormData {
  name: string; color: string; slug: string; timezone: string;
  description: string; booking_enabled: boolean;
  duration_minutes: number; buffer_minutes: number;
  min_notice_hours: number; max_advance_days: number;
  custom_message: string; logo_url: string;
  availability: CalendarAvailability[];
}

const DAYS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const COLORS = ['#F69008','#60D0FA','#10B981','#8B5CF6','#EF4444','#F59E0B','#3B82F6','#EC4899','#6366F1'];
const TIMEZONES = [
  { value: 'America/Caracas',     label: 'Venezuela (UTC-4)' },
  { value: 'America/Bogota',      label: 'Colombia (UTC-5)' },
  { value: 'America/Lima',        label: 'Perú (UTC-5)' },
  { value: 'America/Santiago',    label: 'Chile (UTC-3/4)' },
  { value: 'America/Mexico_City', label: 'México (UTC-6)' },
  { value: 'America/New_York',    label: 'EE.UU. Este (UTC-5)' },
  { value: 'America/Los_Angeles', label: 'EE.UU. Pacífico (UTC-8)' },
  { value: 'Europe/Madrid',       label: 'España (UTC+1)' },
  { value: 'UTC',                 label: 'UTC' },
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
    custom_message: '', logo_url: '',
    availability: defaultAvailability(),
  };
}

function trimTime(t: string) { return t.length > 5 ? t.slice(0, 5) : t; }

function fromCal(cal: Calendar): FormData {
  const avMap: Record<number, CalendarAvailability> = {};
  for (const a of (cal.availability ?? [])) avMap[a.day_of_week] = a;
  return {
    name: cal.name, color: cal.color, slug: cal.slug, timezone: cal.timezone,
    description: cal.description ?? '', booking_enabled: cal.booking_enabled,
    duration_minutes: cal.duration_minutes, buffer_minutes: cal.buffer_minutes,
    min_notice_hours: cal.min_notice_hours, max_advance_days: cal.max_advance_days,
    custom_message: cal.custom_message ?? '', logo_url: cal.logo_url ?? '',
    availability: [0,1,2,3,4,5,6].map(d => {
      const a = avMap[d];
      return a
        ? { ...a, start_time: trimTime(a.start_time), end_time: trimTime(a.end_time) }
        : { day_of_week: d, start_time: '09:00', end_time: '18:00', is_active: false };
    }),
  };
}

const loading   = ref(true);
const loadError = ref('');
const saving    = ref(false);
const saved     = ref(false);
const copied    = ref(false);
const form      = ref<FormData>(emptyForm());
const original  = ref<string>('');
const isDirty   = computed(() => JSON.stringify(form.value) !== original.value);

// ── Carga inicial ─────────────────────────────────────────────────────────────
async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    if (isNew.value) {
      form.value = emptyForm();
    } else {
      const cal = await api.get<Calendar>(`/calendars/${id.value}`);
      form.value = fromCal(cal);
    }
    original.value = JSON.stringify(form.value);
  } catch (e: unknown) {
    loadError.value = (e as { message?: string })?.message ?? 'No se pudo cargar el calendario';
  } finally {
    loading.value = false;
  }
}
onMounted(load);

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
      slug:           form.value.slug.trim()            || undefined,
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
    alert(msg);
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
    router.push('/settings/calendars');
  } catch (e: unknown) {
    alert((e as { message?: string })?.message ?? 'No se puede eliminar');
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
        <button class="btn btn-secondary btn-sm flex-shrink-0" @click="router.push('/settings/calendars')">
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
                <select v-model="form.timezone" class="ce-input cursor-pointer">
                  <option v-for="tz in TIMEZONES" :key="tz.value" :value="tz.value">{{ tz.label }}</option>
                </select>
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
                <div>
                  <label class="ce-label-sm">Duración</label>
                  <select v-model.number="form.duration_minutes" class="ce-input-sm cursor-pointer">
                    <option :value="15">15 min</option>
                    <option :value="30">30 min</option>
                    <option :value="45">45 min</option>
                    <option :value="60">1 hora</option>
                    <option :value="90">1.5 h</option>
                    <option :value="120">2 h</option>
                  </select>
                </div>
                <div>
                  <label class="ce-label-sm">Buffer</label>
                  <select v-model.number="form.buffer_minutes" class="ce-input-sm cursor-pointer">
                    <option :value="0">Sin buffer</option>
                    <option :value="5">5 min</option>
                    <option :value="10">10 min</option>
                    <option :value="15">15 min</option>
                    <option :value="30">30 min</option>
                  </select>
                </div>
                <div>
                  <label class="ce-label-sm">Aviso mínimo</label>
                  <select v-model.number="form.min_notice_hours" class="ce-input-sm cursor-pointer">
                    <option :value="0">Sin mínimo</option>
                    <option :value="1">1 hora</option>
                    <option :value="2">2 horas</option>
                    <option :value="4">4 horas</option>
                    <option :value="24">1 día</option>
                    <option :value="48">2 días</option>
                  </select>
                </div>
                <div>
                  <label class="ce-label-sm">Ventana</label>
                  <select v-model.number="form.max_advance_days" class="ce-input-sm cursor-pointer">
                    <option :value="14">2 semanas</option>
                    <option :value="30">1 mes</option>
                    <option :value="60">2 meses</option>
                    <option :value="90">3 meses</option>
                  </select>
                </div>
              </div>
              <div>
                <label class="ce-label-sm">Mensaje para tus clientes</label>
                <textarea v-model="form.custom_message" rows="2"
                  placeholder="Ej: Te espero puntual. Puedes entrar desde el link 5 min antes."
                  class="ce-input resize-none text-sm" />
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
}
.ce-input:focus { border-color: #F69008; box-shadow: 0 0 0 3px rgba(246,144,8,0.12); }
.ce-input::placeholder { color: #94A3B8; }
.ce-input-sm {
  width: 100%; border-radius: 6px; border: 1.5px solid #E2E8F0;
  padding: 6px 8px; font-size: 12px; color: #0F172A;
  background: #fff; outline: none; font-family: inherit;
  transition: border-color 0.15s;
}
.ce-input-sm:focus { border-color: #F69008; }
</style>
