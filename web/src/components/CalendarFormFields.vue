<script setup lang="ts">
import type { CalendarAvailability } from '../types';
import { TIMEZONES } from '../utils/timezones';

const DAYS   = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const COLORS = ['#F69008','#60D0FA','#10B981','#8B5CF6','#EF4444','#F59E0B','#3B82F6','#EC4899','#6366F1'];

interface FormData {
  name: string; color: string; slug: string; timezone: string;
  description: string; booking_enabled: boolean;
  duration_minutes: number; buffer_minutes: number;
  min_notice_hours: number; max_advance_days: number;
  custom_message: string; availability: CalendarAvailability[];
}

const props = defineProps<{ form: FormData; isNew?: boolean }>();
const emit  = defineEmits<{ autoSlug: [] }>();
</script>

<template>
  <div class="space-y-5">

    <!-- Nombre + Color -->
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div>
        <label class="cf-label">Nombre del calendario *</label>
        <input
          v-model="form.name"
          type="text"
          placeholder="Mi calendario"
          class="cf-input"
          @input="emit('autoSlug')"
        />
      </div>
      <div>
        <label class="cf-label">Color</label>
        <div class="flex flex-wrap gap-2 pt-1">
          <button
            v-for="c in COLORS" :key="c" type="button"
            class="h-7 w-7 cursor-pointer rounded-full border-2 transition-all hover:scale-110"
            :style="`background:${c}`"
            :class="form.color === c ? 'border-slate-700 scale-110 ring-2 ring-offset-1 ring-slate-300' : 'border-transparent'"
            @click="form.color = c"
          />
        </div>
      </div>
    </div>

    <!-- Slug + Timezone -->
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div>
        <label class="cf-label">Slug del link</label>
        <div class="flex overflow-hidden rounded-lg border border-slate-200 transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
          <span class="flex shrink-0 items-center border-r border-slate-200 bg-slate-100 px-3 text-[11px] text-slate-400">/book/</span>
          <input v-model="form.slug" type="text" placeholder="mi-calendario"
            class="flex-1 bg-white px-3 py-2 text-sm outline-none" />
        </div>
        <p class="mt-0.5 text-[11px] text-slate-400">Solo letras minúsculas, números y guiones</p>
      </div>
      <div>
        <label class="cf-label">Zona horaria</label>
        <select v-model="form.timezone" class="cf-input cursor-pointer">
          <option v-for="tz in TIMEZONES" :key="tz.value" :value="tz.value">{{ tz.label }}</option>
        </select>
      </div>
    </div>

    <!-- Descripción -->
    <div>
      <label class="cf-label">Descripción <span class="font-normal text-slate-400">(opcional)</span></label>
      <textarea v-model="form.description" rows="2" placeholder="¿De qué trata este calendario?"
        class="cf-input resize-none"
      />
    </div>

    <!-- Reserva en línea -->
    <div class="rounded-xl border border-slate-200 bg-white p-4">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm font-semibold text-slate-800">Reserva en línea</p>
          <p class="mt-0.5 text-xs text-slate-500">Permite que tus clientes agenden desde un link público</p>
        </div>
        <button
          type="button"
          class="relative h-6 w-11 cursor-pointer rounded-full transition-colors duration-200"
          :class="form.booking_enabled ? 'bg-primary' : 'bg-slate-300'"
          @click="form.booking_enabled = !form.booking_enabled"
        >
          <div class="absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200"
            :class="form.booking_enabled ? 'translate-x-5' : 'translate-x-1'"
          ></div>
        </button>
      </div>

      <Transition name="expand">
        <div v-if="form.booking_enabled" class="mt-4 space-y-4 border-t border-slate-100 pt-4">
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label class="cf-label-sm">Duración</label>
              <select v-model.number="form.duration_minutes" class="cf-input-sm cursor-pointer">
                <option :value="15">15 min</option>
                <option :value="30">30 min</option>
                <option :value="45">45 min</option>
                <option :value="60">1 hora</option>
                <option :value="90">1.5 h</option>
                <option :value="120">2 h</option>
              </select>
            </div>
            <div>
              <label class="cf-label-sm">Buffer</label>
              <select v-model.number="form.buffer_minutes" class="cf-input-sm cursor-pointer">
                <option :value="0">Sin buffer</option>
                <option :value="5">5 min</option>
                <option :value="10">10 min</option>
                <option :value="15">15 min</option>
                <option :value="30">30 min</option>
              </select>
            </div>
            <div>
              <label class="cf-label-sm">Aviso mínimo</label>
              <select v-model.number="form.min_notice_hours" class="cf-input-sm cursor-pointer">
                <option :value="0">Sin mínimo</option>
                <option :value="1">1 hora</option>
                <option :value="2">2 horas</option>
                <option :value="4">4 horas</option>
                <option :value="24">1 día</option>
                <option :value="48">2 días</option>
              </select>
            </div>
            <div>
              <label class="cf-label-sm">Ventana</label>
              <select v-model.number="form.max_advance_days" class="cf-input-sm cursor-pointer">
                <option :value="14">2 semanas</option>
                <option :value="30">1 mes</option>
                <option :value="60">2 meses</option>
                <option :value="90">3 meses</option>
              </select>
            </div>
          </div>
          <div>
            <label class="cf-label-sm">Mensaje para tus clientes</label>
            <textarea v-model="form.custom_message" rows="2"
              placeholder="Ej: Te espero puntual. Puedes entrar desde el link 5 min antes."
              class="cf-input resize-none text-sm"
            />
          </div>
        </div>
      </Transition>
    </div>

    <!-- Disponibilidad -->
    <div>
      <p class="cf-label mb-3">Horario de disponibilidad</p>
      <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div
          v-for="a in form.availability.slice().sort((x,y) => x.day_of_week - y.day_of_week)"
          :key="a.day_of_week"
          class="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2"
          :class="a.is_active ? 'border-slate-200' : 'opacity-60'"
        >
          <!-- Toggle día -->
          <button
            type="button"
            class="relative h-5 w-9 flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200"
            :class="a.is_active ? 'bg-primary' : 'bg-slate-200'"
            @click="a.is_active = !a.is_active"
          >
            <div class="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200"
              :class="a.is_active ? 'translate-x-4' : 'translate-x-0.5'"
            ></div>
          </button>
          <span class="w-7 text-sm font-semibold text-slate-700">{{ DAYS[a.day_of_week] }}</span>
          <template v-if="a.is_active">
            <input v-model="a.start_time" type="time"
              class="flex-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs focus:border-primary focus:outline-none" />
            <span class="text-xs text-slate-400">–</span>
            <input v-model="a.end_time" type="time"
              class="flex-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs focus:border-primary focus:outline-none" />
          </template>
          <span v-else class="text-xs text-slate-400">No disponible</span>
        </div>
      </div>
    </div>

  </div>
</template>

<style>
.cf-label    { display: block; font-size: 13px; font-weight: 500; color: #475569; margin-bottom: 5px; }
.cf-label-sm { display: block; font-size: 11px; font-weight: 500; color: #64748b; margin-bottom: 4px; }
.cf-input {
  width: 100%; border-radius: 8px; border: 1.5px solid #E2E8F0;
  padding: 8px 12px; font-size: 13px; color: #0F172A;
  background: #fff; outline: none; font-family: inherit;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.cf-input:focus { border-color: #F69008; box-shadow: 0 0 0 3px rgba(246,144,8,0.12); }
.cf-input::placeholder { color: #94A3B8; }
.cf-input-sm {
  width: 100%; border-radius: 6px; border: 1.5px solid #E2E8F0;
  padding: 6px 8px; font-size: 12px; color: #0F172A;
  background: #fff; outline: none; font-family: inherit;
  transition: border-color 0.15s;
}
.cf-input-sm:focus { border-color: #F69008; }
</style>
