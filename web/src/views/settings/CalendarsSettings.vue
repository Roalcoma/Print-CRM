<script setup lang="ts">
import { ref, onMounted } from 'vue';
import {
  Plus, Trash2, Copy, Check, Eye, ArrowLeft,
  Clock, Globe, Link2, CalendarDays, Save, X,
  ChevronDown, ChevronUp, Pencil,
} from 'lucide-vue-next';
import { useRouter } from 'vue-router';
import { api } from '../../api';
import type { Calendar, CalendarAvailability } from '../../types';
import Spinner from '../../components/Spinner.vue';

const router = useRouter();

const calendars  = ref<Calendar[]>([]);
const loading    = ref(true);
const saving     = ref<string | null>(null);
const copied     = ref<string | null>(null);
const expandedId = ref<string | null>(null);

const DAYS   = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
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

interface FormData {
  name: string; color: string; slug: string; timezone: string;
  description: string; booking_enabled: boolean;
  duration_minutes: number; buffer_minutes: number;
  min_notice_hours: number; max_advance_days: number;
  custom_message: string; availability: CalendarAvailability[];
}

const form = ref<FormData>(emptyForm());

function emptyForm(): FormData {
  return {
    name: '', color: '#F69008', slug: '', timezone: 'America/Caracas',
    description: '', booking_enabled: false,
    duration_minutes: 30, buffer_minutes: 0, min_notice_hours: 2, max_advance_days: 60,
    custom_message: '',
    availability: [
      ...[1,2,3,4,5].map(d => ({ day_of_week: d, start_time: '09:00', end_time: '18:00', is_active: true  })),
      ...[0,6].map(d =>       ({ day_of_week: d, start_time: '09:00', end_time: '18:00', is_active: false })),
    ],
  };
}

function formFromCal(cal: Calendar): FormData {
  const avMap: Record<number, CalendarAvailability> = {};
  for (const a of (cal.availability ?? [])) avMap[a.day_of_week] = a;
  return {
    name: cal.name, color: cal.color, slug: cal.slug, timezone: cal.timezone,
    description: cal.description ?? '', booking_enabled: cal.booking_enabled,
    duration_minutes: cal.duration_minutes, buffer_minutes: cal.buffer_minutes,
    min_notice_hours: cal.min_notice_hours, max_advance_days: cal.max_advance_days,
    custom_message: cal.custom_message ?? '',
    availability: [0,1,2,3,4,5,6].map(d =>
      avMap[d] ?? { day_of_week: d, start_time: '09:00', end_time: '18:00', is_active: false }
    ),
  };
}

function toggle(id: string, cal?: Calendar) {
  if (expandedId.value === id) { expandedId.value = null; return; }
  form.value = cal ? formFromCal(cal) : emptyForm();
  expandedId.value = id;
}

function autoSlug() {
  if (expandedId.value !== 'new') return;
  form.value.slug = form.value.name
    .toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '-').slice(0, 40);
}

async function save(id: string) {
  if (!form.value.name.trim()) return;
  saving.value = id;
  try {
    const payload = {
      ...form.value,
      description:    form.value.description.trim()    || null,
      custom_message: form.value.custom_message.trim() || null,
      slug:           form.value.slug.trim()            || undefined,
    };
    if (id === 'new') await api.post('/calendars', payload);
    else              await api.patch(`/calendars/${id}`, payload);
    await load();
    expandedId.value = null;
  } catch (err: unknown) {
    alert((err as { message?: string })?.message ?? 'Error al guardar');
  } finally { saving.value = null; }
}

async function deleteCalendar(cal: Calendar) {
  if (!confirm(`¿Eliminar "${cal.name}"? Las citas existentes se conservan.`)) return;
  try {
    await api.del(`/calendars/${cal.id}`);
    if (expandedId.value === cal.id) expandedId.value = null;
    await load();
  } catch (err: unknown) {
    alert((err as { message?: string })?.message ?? 'No se puede eliminar');
  }
}

function bookingUrl(slug: string) { return `${window.location.origin}/book/${slug}`; }

async function copyLink(slug: string) {
  await navigator.clipboard.writeText(bookingUrl(slug));
  copied.value = slug;
  setTimeout(() => { copied.value = null; }, 2000);
}

async function load() {
  loading.value = true;
  try { calendars.value = await api.get<Calendar[]>('/calendars/mine'); }
  finally { loading.value = false; }
}

onMounted(load);
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden">

    <!-- Header -->
    <div class="flex flex-shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 py-3.5">
      <div class="flex items-center gap-3">
        <button
          class="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
          @click="router.back()"
        >
          <ArrowLeft class="h-4 w-4" /> Regresar
        </button>
        <div class="h-5 w-px bg-slate-200"></div>
        <div>
          <h3 class="text-[15px] font-semibold text-slate-900">Mis calendarios</h3>
          <p class="text-[12px] text-slate-400">Gestiona tus calendarios y configura la reserva en línea</p>
        </div>
      </div>
      <button
        class="flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-primary/30 transition-all hover:bg-primary-dark"
        @click="toggle('new')"
      >
        <Plus class="h-4 w-4" /> Nuevo calendario
      </button>
    </div>

    <!-- Cuerpo -->
    <div class="flex-1 overflow-y-auto bg-slate-50 p-6">
      <div v-if="loading" class="flex justify-center py-16"><Spinner :size="28" /></div>

      <div v-else class="space-y-3">

        <!-- Formulario: Nuevo calendario -->
        <div v-if="expandedId === 'new'" class="rounded-xl border-2 border-primary/30 bg-white shadow-card">
          <div class="h-1 w-full rounded-t-xl bg-gradient-to-r from-[#F69008] to-[#FBBF24]"></div>
          <div class="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
            <div class="flex items-center gap-2.5">
              <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <CalendarDays class="h-4 w-4 text-primary" />
              </div>
              <span class="text-sm font-semibold text-slate-800">Nuevo calendario</span>
            </div>
            <button class="cursor-pointer rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100" @click="expandedId = null">
              <X class="h-4 w-4" />
            </button>
          </div>
          <div class="px-5 py-5">
            <!-- form fields -->
            <div class="space-y-5">
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label class="cf-label">Nombre *</label>
                  <input v-model="form.name" type="text" placeholder="Mi calendario" class="cf-input" @input="autoSlug" />
                </div>
                <div>
                  <label class="cf-label">Color</label>
                  <div class="flex flex-wrap gap-2 pt-1">
                    <button v-for="c in COLORS" :key="c" type="button"
                      class="h-7 w-7 cursor-pointer rounded-full border-2 transition-all hover:scale-110"
                      :style="`background:${c}`"
                      :class="form.color === c ? 'border-slate-700 scale-110' : 'border-transparent'"
                      @click="form.color = c" />
                  </div>
                </div>
              </div>
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label class="cf-label">Slug del link</label>
                  <div class="flex overflow-hidden rounded-lg border border-slate-200 transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
                    <span class="flex shrink-0 items-center border-r border-slate-200 bg-slate-100 px-3 text-[11px] text-slate-400">/book/</span>
                    <input v-model="form.slug" type="text" placeholder="mi-calendario" class="flex-1 bg-white px-3 py-2 text-sm outline-none" />
                  </div>
                </div>
                <div>
                  <label class="cf-label">Zona horaria</label>
                  <select v-model="form.timezone" class="cf-input cursor-pointer">
                    <option v-for="tz in TIMEZONES" :key="tz.value" :value="tz.value">{{ tz.label }}</option>
                  </select>
                </div>
              </div>
              <div>
                <label class="cf-label">Descripción <span class="font-normal text-slate-400">(opcional)</span></label>
                <textarea v-model="form.description" rows="2" placeholder="¿De qué trata este calendario?" class="cf-input resize-none" />
              </div>
              <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div class="flex items-center justify-between">
                  <div>
                    <p class="text-sm font-semibold text-slate-800">Reserva en línea</p>
                    <p class="mt-0.5 text-xs text-slate-500">Permite que tus clientes agenden desde un link público</p>
                  </div>
                  <button type="button" class="relative h-6 w-11 cursor-pointer rounded-full transition-colors duration-200"
                    :class="form.booking_enabled ? 'bg-primary' : 'bg-slate-300'"
                    @click="form.booking_enabled = !form.booking_enabled">
                    <div class="absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200"
                      :class="form.booking_enabled ? 'translate-x-5' : 'translate-x-1'"></div>
                  </button>
                </div>
                <div v-if="form.booking_enabled" class="mt-4 space-y-3 border-t border-slate-200 pt-4">
                  <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div><label class="cf-label-sm">Duración</label>
                      <select v-model.number="form.duration_minutes" class="cf-input-sm">
                        <option :value="15">15 min</option><option :value="30">30 min</option>
                        <option :value="45">45 min</option><option :value="60">1 hora</option>
                        <option :value="90">1.5 h</option><option :value="120">2 h</option>
                      </select>
                    </div>
                    <div><label class="cf-label-sm">Buffer</label>
                      <select v-model.number="form.buffer_minutes" class="cf-input-sm">
                        <option :value="0">Sin buffer</option><option :value="5">5 min</option>
                        <option :value="10">10 min</option><option :value="15">15 min</option>
                        <option :value="30">30 min</option>
                      </select>
                    </div>
                    <div><label class="cf-label-sm">Aviso mínimo</label>
                      <select v-model.number="form.min_notice_hours" class="cf-input-sm">
                        <option :value="0">Sin mínimo</option><option :value="1">1 hora</option>
                        <option :value="2">2 horas</option><option :value="4">4 horas</option>
                        <option :value="24">1 día</option><option :value="48">2 días</option>
                      </select>
                    </div>
                    <div><label class="cf-label-sm">Ventana</label>
                      <select v-model.number="form.max_advance_days" class="cf-input-sm">
                        <option :value="14">2 semanas</option><option :value="30">1 mes</option>
                        <option :value="60">2 meses</option><option :value="90">3 meses</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label class="cf-label-sm">Mensaje para el cliente</label>
                    <textarea v-model="form.custom_message" rows="2" placeholder="Ej: Te espero puntual." class="cf-input resize-none text-sm" />
                  </div>
                </div>
              </div>
              <div>
                <label class="cf-label mb-3 block">Horario de disponibilidad</label>
                <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div v-for="a in form.availability.slice().sort((x,y) => x.day_of_week - y.day_of_week)" :key="a.day_of_week"
                    class="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <button type="button" class="relative h-5 w-9 flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200"
                      :class="a.is_active ? 'bg-primary' : 'bg-slate-200'"
                      @click="a.is_active = !a.is_active">
                      <div class="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200"
                        :class="a.is_active ? 'translate-x-4' : 'translate-x-0.5'"></div>
                    </button>
                    <span class="w-7 text-sm font-semibold text-slate-700">{{ DAYS[a.day_of_week] }}</span>
                    <template v-if="a.is_active">
                      <input v-model="a.start_time" type="time" class="flex-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs focus:border-primary focus:outline-none" />
                      <span class="text-xs text-slate-400">–</span>
                      <input v-model="a.end_time" type="time" class="flex-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs focus:border-primary focus:outline-none" />
                    </template>
                    <span v-else class="text-xs text-slate-400">No disponible</span>
                  </div>
                </div>
              </div>
            </div>
            <div class="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button class="cursor-pointer rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50" @click="expandedId = null">Cancelar</button>
              <button :disabled="saving === 'new' || !form.name.trim()"
                class="flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-primary-dark disabled:opacity-60"
                @click="save('new')">
                <Spinner v-if="saving === 'new'" :size="14" light /><Save v-else class="h-4 w-4" /> Crear calendario
              </button>
            </div>
          </div>
        </div>

        <!-- Empty state -->
        <div v-if="!calendars.length && expandedId !== 'new'"
          class="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white py-20 text-center">
          <div class="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <CalendarDays class="h-7 w-7 text-primary" />
          </div>
          <p class="text-base font-semibold text-slate-700">Sin calendarios aún</p>
          <p class="mt-1 text-sm text-slate-400">Crea tu primer calendario para empezar a recibir reservas</p>
          <button class="mt-5 flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark transition-colors" @click="toggle('new')">
            <Plus class="h-4 w-4" /> Crear calendario
          </button>
        </div>

        <!-- Tarjetas existentes -->
        <div v-for="cal in calendars" :key="cal.id"
          class="rounded-xl border border-slate-200 bg-white shadow-card transition-shadow"
          :class="expandedId === cal.id ? 'border-primary/40 shadow-elevated' : 'hover:shadow-elevated'">

          <div class="h-1 w-full rounded-t-xl" :style="`background: ${cal.color}`"></div>

          <!-- Fila resumen -->
          <div class="flex items-start gap-4 px-5 py-4">
            <div class="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-white shadow-sm" :style="`background: ${cal.color}`">
              <CalendarDays class="h-5 w-5" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-semibold text-slate-900">{{ cal.name }}</span>
                <span class="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-500">/book/{{ cal.slug }}</span>
                <span class="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                  :class="cal.booking_enabled ? 'border border-emerald-200 bg-emerald-50 text-emerald-700' : 'border border-slate-200 bg-slate-100 text-slate-500'">
                  <span class="h-1.5 w-1.5 rounded-full" :class="cal.booking_enabled ? 'bg-emerald-500' : 'bg-slate-300'"></span>
                  {{ cal.booking_enabled ? 'Reservas activas' : 'Desactivado' }}
                </span>
              </div>
              <div class="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                <span class="flex items-center gap-1"><Clock class="h-3.5 w-3.5" />{{ cal.duration_minutes }} min</span>
                <span class="flex items-center gap-1"><Globe class="h-3.5 w-3.5" />{{ cal.timezone }}</span>
                <a v-if="cal.booking_enabled" :href="bookingUrl(cal.slug)" target="_blank"
                  class="flex items-center gap-1 text-primary hover:underline" @click.stop>
                  <Link2 class="h-3.5 w-3.5" />{{ bookingUrl(cal.slug) }}
                </a>
              </div>
            </div>
            <div class="flex flex-shrink-0 items-center gap-1.5">
              <button v-if="cal.booking_enabled"
                class="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
                @click.stop="copyLink(cal.slug)">
                <Check v-if="copied === cal.slug" class="h-3.5 w-3.5 text-emerald-500" /><Copy v-else class="h-3.5 w-3.5" />
                {{ copied === cal.slug ? 'Copiado' : 'Copiar link' }}
              </button>
              <a v-if="cal.booking_enabled" :href="bookingUrl(cal.slug)" target="_blank"
                class="cursor-pointer rounded-lg border border-slate-200 p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700" @click.stop>
                <Eye class="h-4 w-4" />
              </a>
              <button class="cursor-pointer rounded-lg border border-slate-200 p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
                @click.stop="deleteCalendar(cal)">
                <Trash2 class="h-4 w-4" />
              </button>
              <button
                class="flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all"
                :class="expandedId === cal.id ? 'border-primary/30 bg-primary/5 text-primary' : 'border-slate-200 text-slate-600 hover:bg-slate-50'"
                @click="toggle(cal.id, cal)">
                <Pencil class="h-3.5 w-3.5" />
                Editar
                <ChevronUp v-if="expandedId === cal.id" class="h-3.5 w-3.5" />
                <ChevronDown v-else class="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <!-- Panel edición inline (sin Transition para evitar bugs de max-height) -->
          <div v-if="expandedId === cal.id" class="border-t border-slate-100 bg-slate-50 px-5 py-5">
            <div class="space-y-5">
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label class="cf-label">Nombre *</label>
                  <input v-model="form.name" type="text" placeholder="Mi calendario" class="cf-input" />
                </div>
                <div>
                  <label class="cf-label">Color</label>
                  <div class="flex flex-wrap gap-2 pt-1">
                    <button v-for="c in COLORS" :key="c" type="button"
                      class="h-7 w-7 cursor-pointer rounded-full border-2 transition-all hover:scale-110"
                      :style="`background:${c}`"
                      :class="form.color === c ? 'border-slate-700 scale-110' : 'border-transparent'"
                      @click="form.color = c" />
                  </div>
                </div>
              </div>
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label class="cf-label">Slug del link</label>
                  <div class="flex overflow-hidden rounded-lg border border-slate-200 transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
                    <span class="flex shrink-0 items-center border-r border-slate-200 bg-slate-100 px-3 text-[11px] text-slate-400">/book/</span>
                    <input v-model="form.slug" type="text" placeholder="mi-calendario" class="flex-1 bg-white px-3 py-2 text-sm outline-none" />
                  </div>
                </div>
                <div>
                  <label class="cf-label">Zona horaria</label>
                  <select v-model="form.timezone" class="cf-input cursor-pointer">
                    <option v-for="tz in TIMEZONES" :key="tz.value" :value="tz.value">{{ tz.label }}</option>
                  </select>
                </div>
              </div>
              <div>
                <label class="cf-label">Descripción <span class="font-normal text-slate-400">(opcional)</span></label>
                <textarea v-model="form.description" rows="2" placeholder="¿De qué trata este calendario?" class="cf-input resize-none" />
              </div>
              <div class="rounded-xl border border-slate-200 bg-white p-4">
                <div class="flex items-center justify-between">
                  <div>
                    <p class="text-sm font-semibold text-slate-800">Reserva en línea</p>
                    <p class="mt-0.5 text-xs text-slate-500">Permite que tus clientes agenden desde un link público</p>
                  </div>
                  <button type="button" class="relative h-6 w-11 cursor-pointer rounded-full transition-colors duration-200"
                    :class="form.booking_enabled ? 'bg-primary' : 'bg-slate-300'"
                    @click="form.booking_enabled = !form.booking_enabled">
                    <div class="absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200"
                      :class="form.booking_enabled ? 'translate-x-5' : 'translate-x-1'"></div>
                  </button>
                </div>
                <div v-if="form.booking_enabled" class="mt-4 space-y-3 border-t border-slate-200 pt-4">
                  <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div><label class="cf-label-sm">Duración</label>
                      <select v-model.number="form.duration_minutes" class="cf-input-sm">
                        <option :value="15">15 min</option><option :value="30">30 min</option>
                        <option :value="45">45 min</option><option :value="60">1 hora</option>
                        <option :value="90">1.5 h</option><option :value="120">2 h</option>
                      </select>
                    </div>
                    <div><label class="cf-label-sm">Buffer</label>
                      <select v-model.number="form.buffer_minutes" class="cf-input-sm">
                        <option :value="0">Sin buffer</option><option :value="5">5 min</option>
                        <option :value="10">10 min</option><option :value="15">15 min</option><option :value="30">30 min</option>
                      </select>
                    </div>
                    <div><label class="cf-label-sm">Aviso mínimo</label>
                      <select v-model.number="form.min_notice_hours" class="cf-input-sm">
                        <option :value="0">Sin mínimo</option><option :value="1">1 hora</option>
                        <option :value="2">2 horas</option><option :value="4">4 horas</option>
                        <option :value="24">1 día</option><option :value="48">2 días</option>
                      </select>
                    </div>
                    <div><label class="cf-label-sm">Ventana</label>
                      <select v-model.number="form.max_advance_days" class="cf-input-sm">
                        <option :value="14">2 semanas</option><option :value="30">1 mes</option>
                        <option :value="60">2 meses</option><option :value="90">3 meses</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label class="cf-label-sm">Mensaje para el cliente</label>
                    <textarea v-model="form.custom_message" rows="2" placeholder="Ej: Te espero puntual." class="cf-input resize-none text-sm" />
                  </div>
                </div>
              </div>
              <div>
                <label class="cf-label mb-3 block">Horario de disponibilidad</label>
                <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div v-for="a in form.availability.slice().sort((x,y) => x.day_of_week - y.day_of_week)" :key="a.day_of_week"
                    class="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <button type="button" class="relative h-5 w-9 flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200"
                      :class="a.is_active ? 'bg-primary' : 'bg-slate-200'"
                      @click="a.is_active = !a.is_active">
                      <div class="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200"
                        :class="a.is_active ? 'translate-x-4' : 'translate-x-0.5'"></div>
                    </button>
                    <span class="w-7 text-sm font-semibold text-slate-700">{{ DAYS[a.day_of_week] }}</span>
                    <template v-if="a.is_active">
                      <input v-model="a.start_time" type="time" class="flex-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs focus:border-primary focus:outline-none" />
                      <span class="text-xs text-slate-400">–</span>
                      <input v-model="a.end_time" type="time" class="flex-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs focus:border-primary focus:outline-none" />
                    </template>
                    <span v-else class="text-xs text-slate-400">No disponible</span>
                  </div>
                </div>
              </div>
            </div>
            <div class="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button class="cursor-pointer rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-white" @click="expandedId = null">Cancelar</button>
              <button :disabled="saving === cal.id || !form.name.trim()"
                class="flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-primary-dark disabled:opacity-60"
                @click="save(cal.id)">
                <Spinner v-if="saving === cal.id" :size="14" light /><Save v-else class="h-4 w-4" /> Guardar cambios
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<style>
.cf-label    { display:block; font-size:13px; font-weight:500; color:#475569; margin-bottom:5px; }
.cf-label-sm { display:block; font-size:11px; font-weight:500; color:#64748b; margin-bottom:4px; }
.cf-input {
  width:100%; border-radius:8px; border:1.5px solid #E2E8F0;
  padding:8px 12px; font-size:13px; color:#0F172A; background:#fff;
  outline:none; font-family:inherit;
  transition: border-color .15s, box-shadow .15s;
}
.cf-input:focus { border-color:#F69008; box-shadow:0 0 0 3px rgba(246,144,8,.12); }
.cf-input::placeholder { color:#94A3B8; }
.cf-input-sm {
  width:100%; border-radius:6px; border:1.5px solid #E2E8F0;
  padding:6px 8px; font-size:12px; color:#0F172A; background:#fff;
  outline:none; font-family:inherit;
  transition: border-color .15s;
}
.cf-input-sm:focus { border-color:#F69008; }
</style>
