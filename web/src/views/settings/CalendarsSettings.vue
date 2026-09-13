<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Plus, Trash2, Copy, Check, Eye, CalendarDays, Clock, Globe, Link2 } from 'lucide-vue-next';
import { useRouter } from 'vue-router';
import { api } from '../../api';
import type { Calendar } from '../../types';
import Spinner from '../../components/Spinner.vue';

const router   = useRouter();
const calendars = ref<Calendar[]>([]);
const loading   = ref(true);
const copied    = ref<string | null>(null);
const deleting  = ref<string | null>(null);

async function load() {
  loading.value = true;
  try { calendars.value = await api.get<Calendar[]>('/calendars/mine'); }
  finally { loading.value = false; }
}
onMounted(load);

function bookingUrl(slug: string) { return `${window.location.origin}/book/${slug}`; }

async function copyLink(slug: string) {
  await navigator.clipboard.writeText(bookingUrl(slug));
  copied.value = slug;
  setTimeout(() => { copied.value = null; }, 2000);
}

async function deleteCalendar(cal: Calendar) {
  if (!confirm(`¿Eliminar "${cal.name}"? Las citas existentes se conservan.`)) return;
  deleting.value = cal.id;
  try {
    await api.del(`/calendars/${cal.id}`);
    await load();
  } catch (err: unknown) {
    alert((err as { message?: string })?.message ?? 'No se puede eliminar');
  } finally { deleting.value = null; }
}
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden">

    <!-- Header -->
    <div class="page-toolbar justify-between">
      <div class="flex items-center gap-2 sm:gap-3">
        <button class="btn btn-secondary btn-sm" @click="router.back()">← <span class="hidden sm:inline">Regresar</span></button>
        <div class="h-5 w-px bg-slate-200"></div>
        <div>
          <h3 class="text-[15px] font-semibold text-slate-900">Mis calendarios</h3>
          <p class="hidden text-[12px] text-slate-400 sm:block">Gestiona tus calendarios y configura la reserva en línea</p>
        </div>
      </div>
      <button class="btn btn-primary btn-sm" @click="router.push('/settings/calendars/new')">
        <Plus class="h-4 w-4" /> <span class="hidden sm:inline">Nuevo calendario</span>
      </button>
    </div>

    <!-- Body -->
    <div class="flex-1 overflow-y-auto bg-slate-50 p-6">
      <div v-if="loading" class="flex justify-center py-20"><Spinner :size="28" /></div>

      <!-- Empty -->
      <div v-else-if="!calendars.length"
        class="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white py-24 text-center">
        <div class="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <CalendarDays class="h-7 w-7 text-primary" />
        </div>
        <p class="text-base font-semibold text-slate-700">Sin calendarios aún</p>
        <p class="mt-1 text-sm text-slate-400">Crea tu primer calendario para empezar a recibir reservas</p>
        <button class="btn btn-primary mt-5" @click="router.push('/settings/calendars/new')">
          <Plus class="h-4 w-4" /> Crear calendario
        </button>
      </div>

      <!-- Lista -->
      <div v-else class="space-y-3">
        <div
          v-for="cal in calendars" :key="cal.id"
          class="group flex items-center gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-card transition-all hover:border-slate-300 hover:shadow-elevated"
        >
          <!-- Logo / avatar -->
          <div class="relative flex-shrink-0">
            <div v-if="cal.logo_url"
              class="h-12 w-12 overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
              <img :src="cal.logo_url" alt="" class="h-full w-full object-cover" />
            </div>
            <div v-else
              class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl text-white shadow-sm"
              :style="`background: ${cal.color}`">
              <CalendarDays class="h-5 w-5" />
            </div>
            <!-- dot de color si hay logo -->
            <span v-if="cal.logo_url"
              class="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-2 border-white"
              :style="`background: ${cal.color}`"
            ></span>
          </div>

          <!-- Info -->
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-semibold text-slate-900">{{ cal.name }}</span>
              <span class="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-500">/book/{{ cal.slug }}</span>
              <span
                class="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                :class="cal.booking_enabled
                  ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border border-slate-200 bg-slate-100 text-slate-500'"
              >
                <span class="h-1.5 w-1.5 rounded-full"
                  :class="cal.booking_enabled ? 'bg-emerald-500' : 'bg-slate-300'"></span>
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

          <!-- Acciones -->
          <div class="flex flex-shrink-0 flex-wrap items-center gap-1.5 mt-2 sm:mt-0">
            <button v-if="cal.booking_enabled" class="btn btn-secondary btn-sm" @click.stop="copyLink(cal.slug)">
              <Check v-if="copied === cal.slug" class="h-3.5 w-3.5 text-emerald-500" />
              <Copy v-else class="h-3.5 w-3.5" />
              <span class="hidden sm:inline">{{ copied === cal.slug ? 'Copiado' : 'Copiar link' }}</span>
            </button>
            <a v-if="cal.booking_enabled" :href="bookingUrl(cal.slug)" target="_blank"
              class="btn btn-secondary btn-sm p-1.5" @click.stop>
              <Eye class="h-4 w-4" />
            </a>
            <button class="btn btn-danger btn-sm p-1.5" :disabled="deleting === cal.id" @click.stop="deleteCalendar(cal)">
              <Spinner v-if="deleting === cal.id" :size="14" />
              <Trash2 v-else class="h-4 w-4" />
            </button>
            <button class="btn btn-primary btn-sm" @click.stop="router.push(`/settings/calendars/${cal.id}`)">
              Editar →
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
