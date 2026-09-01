<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { Plus, Pencil, Trash2, Link, Copy, Check, ChevronDown, ChevronUp, Eye, EyeOff } from 'lucide-vue-next';
import { api } from '../../api';
import type { Calendar, CalendarAvailability } from '../../types';
import Spinner from '../../components/Spinner.vue';

const calendars = ref<Calendar[]>([]);
const loading   = ref(true);
const saving    = ref(false);

const DAYS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const COLORS = ['#F69008','#60D0FA','#10B981','#8B5CF6','#EF4444','#F59E0B','#3B82F6','#EC4899','#6366F1'];

// ─── Modal de edición ─────────────────────────────────────────────────────────
const showModal   = ref(false);
const editingId   = ref<string | null>(null);
const copied      = ref(false);
const expandedId  = ref<string | null>(null);

const defaultAvailability = (): CalendarAvailability[] =>
  [1,2,3,4,5].map(d => ({ day_of_week: d, start_time: '09:00', end_time: '18:00', is_active: true }))
  .concat([0,6].map(d => ({ day_of_week: d, start_time: '09:00', end_time: '18:00', is_active: false })));

const form = ref({
  name:             '',
  color:            '#F69008',
  slug:             '',
  timezone:         'America/Caracas',
  description:      '',
  booking_enabled:  false,
  duration_minutes: 30,
  buffer_minutes:   0,
  min_notice_hours: 2,
  max_advance_days: 60,
  custom_message:   '',
  availability:     defaultAvailability(),
});

function openCreate() {
  editingId.value = null;
  form.value = {
    name: '', color: '#F69008', slug: '', timezone: 'America/Caracas',
    description: '', booking_enabled: false,
    duration_minutes: 30, buffer_minutes: 0, min_notice_hours: 2, max_advance_days: 60,
    custom_message: '', availability: defaultAvailability(),
  };
  showModal.value = true;
}

function openEdit(cal: Calendar) {
  editingId.value = cal.id;
  // Normalizar disponibilidad: asegurarse de tener los 7 días
  const avMap: Record<number, CalendarAvailability> = {};
  for (const a of cal.availability) avMap[a.day_of_week] = a;
  const availability: CalendarAvailability[] = [0,1,2,3,4,5,6].map(d =>
    avMap[d] ?? { day_of_week: d, start_time: '09:00', end_time: '18:00', is_active: false }
  );
  form.value = {
    name:             cal.name,
    color:            cal.color,
    slug:             cal.slug,
    timezone:         cal.timezone,
    description:      cal.description ?? '',
    booking_enabled:  cal.booking_enabled,
    duration_minutes: cal.duration_minutes,
    buffer_minutes:   cal.buffer_minutes,
    min_notice_hours: cal.min_notice_hours,
    max_advance_days: cal.max_advance_days,
    custom_message:   cal.custom_message ?? '',
    availability,
  };
  showModal.value = true;
}

function closeModal() { showModal.value = false; }

// Autogenerar slug desde nombre
function autoSlug() {
  if (editingId.value) return; // no reescribir al editar
  form.value.slug = form.value.name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 40);
}

async function save() {
  if (!form.value.name.trim()) return;
  saving.value = true;
  try {
    const payload = {
      ...form.value,
      description:    form.value.description.trim() || null,
      custom_message: form.value.custom_message.trim() || null,
      slug:           form.value.slug.trim() || undefined,
    };

    if (editingId.value) {
      await api.patch(`/calendars/${editingId.value}`, payload);
    } else {
      await api.post('/calendars', payload);
    }
    await load();
    closeModal();
  } catch (err: unknown) {
    const msg = (err as { message?: string })?.message ?? 'Error al guardar';
    alert(msg);
  } finally {
    saving.value = false;
  }
}

async function deleteCalendar(cal: Calendar) {
  if (!confirm(`¿Eliminar el calendario "${cal.name}"? Las citas existentes se conservan.`)) return;
  try {
    await api.del(`/calendars/${cal.id}`);
    await load();
  } catch (err: unknown) {
    alert((err as { message?: string })?.message ?? 'No se puede eliminar');
  }
}

// ─── Copiar link ──────────────────────────────────────────────────────────────
function bookingUrl(slug: string): string {
  return `${window.location.origin}/book/${slug}`;
}

async function copyLink(slug: string) {
  await navigator.clipboard.writeText(bookingUrl(slug));
  copied.value = true;
  setTimeout(() => { copied.value = false; }, 2000);
}

// ─── Carga ────────────────────────────────────────────────────────────────────
async function load() {
  loading.value = true;
  try { calendars.value = await api.get<Calendar[]>('/calendars/mine'); }
  finally { loading.value = false; }
}

onMounted(load);
</script>

<template>
  <div class="space-y-6">

    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-lg font-semibold text-slate-900">Mis calendarios</h2>
        <p class="text-sm text-slate-500 mt-0.5">Gestiona tus calendarios y configura la reserva en línea.</p>
      </div>
      <button
        class="flex items-center gap-2 rounded-xl bg-[#F69008] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#D97706] transition-colors cursor-pointer"
        @click="openCreate"
      >
        <Plus class="h-4 w-4" /> Nuevo calendario
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex justify-center py-12">
      <Spinner :size="28" />
    </div>

    <!-- Lista de calendarios -->
    <div v-else class="space-y-3">
      <div
        v-for="cal in calendars"
        :key="cal.id"
        class="rounded-xl border border-slate-200 bg-white overflow-hidden"
      >
        <!-- Fila principal -->
        <div class="flex items-center gap-4 px-5 py-4">
          <!-- Color dot -->
          <div class="h-3 w-3 rounded-full shrink-0" :style="`background:${cal.color}`"></div>

          <!-- Info -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-semibold text-slate-900">{{ cal.name }}</span>
              <span class="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500 font-mono">/book/{{ cal.slug }}</span>
              <span
                class="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                :class="cal.booking_enabled
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-slate-100 text-slate-500'"
              >
                {{ cal.booking_enabled ? 'Reservas activas' : 'Reservas desactivadas' }}
              </span>
            </div>
            <p class="text-xs text-slate-400 mt-0.5">{{ cal.duration_minutes }} min · {{ cal.timezone }}</p>
          </div>

          <!-- Acciones -->
          <div class="flex items-center gap-1 shrink-0">
            <!-- Copiar link (solo si booking activo) -->
            <button
              v-if="cal.booking_enabled"
              class="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
              :title="bookingUrl(cal.slug)"
              @click="copyLink(cal.slug)"
            >
              <Check v-if="copied" class="h-3.5 w-3.5 text-emerald-500" />
              <Copy v-else class="h-3.5 w-3.5" />
              {{ copied ? 'Copiado' : 'Copiar link' }}
            </button>

            <a
              v-if="cal.booking_enabled"
              :href="bookingUrl(cal.slug)"
              target="_blank"
              class="rounded-lg border border-slate-200 p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-700 transition-colors cursor-pointer"
              title="Ver página de reserva"
            >
              <Eye class="h-4 w-4" />
            </a>

            <button
              class="rounded-lg border border-slate-200 p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-700 transition-colors cursor-pointer"
              @click="openEdit(cal)"
            >
              <Pencil class="h-4 w-4" />
            </button>

            <button
              class="rounded-lg border border-slate-200 p-1.5 text-slate-400 hover:bg-slate-50 hover:text-red-500 transition-colors cursor-pointer"
              @click="deleteCalendar(cal)"
            >
              <Trash2 class="h-4 w-4" />
            </button>

            <button
              class="rounded-lg border border-slate-200 p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-700 transition-colors cursor-pointer"
              @click="expandedId = expandedId === cal.id ? null : cal.id"
            >
              <ChevronUp v-if="expandedId === cal.id" class="h-4 w-4" />
              <ChevronDown v-else class="h-4 w-4" />
            </button>
          </div>
        </div>

        <!-- Detalle expandido: disponibilidad -->
        <div v-if="expandedId === cal.id" class="border-t border-slate-100 px-5 py-4 bg-slate-50">
          <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Disponibilidad</p>
          <div class="flex flex-wrap gap-2">
            <div
              v-for="a in cal.availability.slice().sort((x,y) => x.day_of_week - y.day_of_week)"
              :key="a.day_of_week"
              class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs"
              :class="a.is_active ? 'bg-white border border-slate-200 text-slate-700' : 'bg-slate-100 text-slate-400 line-through'"
            >
              <span class="font-semibold">{{ DAYS[a.day_of_week] }}</span>
              <span v-if="a.is_active">{{ a.start_time.slice(0,5) }} – {{ a.end_time.slice(0,5) }}</span>
            </div>
          </div>
          <div v-if="cal.booking_enabled" class="mt-3 flex items-center gap-2">
            <Link class="h-3.5 w-3.5 text-slate-400" />
            <a :href="bookingUrl(cal.slug)" target="_blank"
              class="text-xs text-[#F69008] hover:underline font-medium truncate max-w-xs">
              {{ bookingUrl(cal.slug) }}
            </a>
          </div>
        </div>
      </div>

      <div v-if="!loading && calendars.length === 0" class="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-400">
        No tienes calendarios. Crea uno para empezar.
      </div>
    </div>

    <!-- ── Modal de edición ──────────────────────────────────────────────────── -->
    <Teleport to="body">
    <Transition name="modal">
      <div v-if="showModal"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        @click.self="closeModal"
      >
        <div class="modal-panel flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">

          <!-- Header modal -->
          <div class="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <h3 class="text-base font-semibold text-slate-900">
              {{ editingId ? 'Editar calendario' : 'Nuevo calendario' }}
            </h3>
            <button class="rounded-lg p-1 text-slate-400 hover:bg-slate-100 cursor-pointer" @click="closeModal">✕</button>
          </div>

          <!-- Body modal -->
          <div class="flex-1 overflow-auto px-6 py-5 space-y-5">

            <!-- Nombre + Color -->
            <div class="flex gap-3 items-end">
              <div class="flex-1">
                <label class="block text-sm font-medium text-slate-700 mb-1">Nombre *</label>
                <input v-model="form.name" type="text" placeholder="Mi calendario"
                  class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#F69008] focus:ring-2 focus:ring-[#F69008]/20 focus:outline-none"
                  @input="autoSlug"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">Color</label>
                <div class="flex gap-1 flex-wrap max-w-[140px]">
                  <button
                    v-for="c in COLORS" :key="c"
                    type="button"
                    class="h-6 w-6 rounded-full border-2 cursor-pointer transition-transform hover:scale-110"
                    :style="`background:${c}`"
                    :class="form.color === c ? 'border-slate-800 scale-110' : 'border-transparent'"
                    @click="form.color = c"
                  />
                </div>
              </div>
            </div>

            <!-- Slug -->
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">Slug del link</label>
              <div class="flex rounded-lg border border-slate-300 overflow-hidden focus-within:border-[#F69008] focus-within:ring-2 focus-within:ring-[#F69008]/20">
                <span class="flex items-center bg-slate-50 px-3 text-xs text-slate-400 border-r border-slate-300 shrink-0">/book/</span>
                <input v-model="form.slug" type="text" placeholder="mi-calendario"
                  class="flex-1 px-3 py-2 text-sm focus:outline-none bg-white" />
              </div>
              <p class="mt-1 text-xs text-slate-400">Solo letras minúsculas, números y guiones.</p>
            </div>

            <!-- Descripción -->
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">Descripción</label>
              <textarea v-model="form.description" rows="2" placeholder="¿De qué trata este calendario?"
                class="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#F69008] focus:ring-2 focus:ring-[#F69008]/20 focus:outline-none"
              />
            </div>

            <!-- Configuración de reserva -->
            <div class="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm font-semibold text-slate-800">Reserva en línea</p>
                  <p class="text-xs text-slate-500 mt-0.5">Permite que tus clientes agenden desde un link público.</p>
                </div>
                <div
                  class="relative h-6 w-11 rounded-full cursor-pointer transition-colors duration-200"
                  :class="form.booking_enabled ? 'bg-[#F69008]' : 'bg-slate-300'"
                  @click="form.booking_enabled = !form.booking_enabled"
                >
                  <div class="absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200"
                    :class="form.booking_enabled ? 'translate-x-5' : 'translate-x-1'"
                  ></div>
                </div>
              </div>

              <template v-if="form.booking_enabled">
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block text-xs font-medium text-slate-600 mb-1">Duración (min)</label>
                    <select v-model.number="form.duration_minutes"
                      class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#F69008] focus:outline-none">
                      <option :value="15">15 min</option>
                      <option :value="30">30 min</option>
                      <option :value="45">45 min</option>
                      <option :value="60">1 hora</option>
                      <option :value="90">1.5 horas</option>
                      <option :value="120">2 horas</option>
                    </select>
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-slate-600 mb-1">Buffer entre citas (min)</label>
                    <select v-model.number="form.buffer_minutes"
                      class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#F69008] focus:outline-none">
                      <option :value="0">Sin buffer</option>
                      <option :value="5">5 min</option>
                      <option :value="10">10 min</option>
                      <option :value="15">15 min</option>
                      <option :value="30">30 min</option>
                    </select>
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-slate-600 mb-1">Aviso mínimo (horas)</label>
                    <select v-model.number="form.min_notice_hours"
                      class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#F69008] focus:outline-none">
                      <option :value="0">Sin mínimo</option>
                      <option :value="1">1 hora</option>
                      <option :value="2">2 horas</option>
                      <option :value="4">4 horas</option>
                      <option :value="24">24 horas</option>
                      <option :value="48">48 horas</option>
                    </select>
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-slate-600 mb-1">Citas con hasta (días)</label>
                    <select v-model.number="form.max_advance_days"
                      class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#F69008] focus:outline-none">
                      <option :value="14">2 semanas</option>
                      <option :value="30">1 mes</option>
                      <option :value="60">2 meses</option>
                      <option :value="90">3 meses</option>
                    </select>
                  </div>
                </div>

                <!-- Mensaje personalizado -->
                <div>
                  <label class="block text-xs font-medium text-slate-600 mb-1">Mensaje para tus clientes</label>
                  <textarea v-model="form.custom_message" rows="2"
                    placeholder="Ej: Te espero puntual. Puedes entrar desde el link 5 minutos antes."
                    class="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#F69008] focus:ring-2 focus:ring-[#F69008]/20 focus:outline-none"
                  />
                </div>
              </template>
            </div>

            <!-- Disponibilidad -->
            <div>
              <p class="text-sm font-semibold text-slate-800 mb-3">Horario de disponibilidad</p>
              <div class="space-y-2">
                <div v-for="a in form.availability.slice().sort((x,y) => x.day_of_week - y.day_of_week)"
                  :key="a.day_of_week"
                  class="flex items-center gap-3"
                >
                  <!-- Toggle día -->
                  <div
                    class="relative h-5 w-9 rounded-full cursor-pointer transition-colors duration-200 shrink-0"
                    :class="a.is_active ? 'bg-[#F69008]' : 'bg-slate-200'"
                    @click="a.is_active = !a.is_active"
                  >
                    <div class="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200"
                      :class="a.is_active ? 'translate-x-4' : 'translate-x-0.5'"
                    ></div>
                  </div>

                  <span class="w-8 text-sm font-medium text-slate-700">{{ DAYS[a.day_of_week] }}</span>

                  <template v-if="a.is_active">
                    <input v-model="a.start_time" type="time"
                      class="rounded-lg border border-slate-300 px-2 py-1 text-sm focus:border-[#F69008] focus:outline-none" />
                    <span class="text-slate-400 text-sm">–</span>
                    <input v-model="a.end_time" type="time"
                      class="rounded-lg border border-slate-300 px-2 py-1 text-sm focus:border-[#F69008] focus:outline-none" />
                  </template>
                  <span v-else class="text-sm text-slate-400">No disponible</span>
                </div>
              </div>
            </div>

          </div>

          <!-- Footer modal -->
          <div class="flex items-center justify-end gap-2 border-t border-slate-200 px-6 py-4">
            <button
              class="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
              @click="closeModal"
            >
              Cancelar
            </button>
            <button
              :disabled="saving || !form.name.trim()"
              class="flex items-center gap-2 rounded-xl bg-[#F69008] px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#D97706] transition-colors cursor-pointer disabled:opacity-60"
              @click="save"
            >
              <Spinner v-if="saving" :size="14" light />
              {{ saving ? 'Guardando…' : (editingId ? 'Guardar cambios' : 'Crear calendario') }}
            </button>
          </div>

        </div>
      </div>
    </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.modal-enter-active, .modal-leave-active { transition: opacity 0.2s ease; }
.modal-enter-active .modal-panel, .modal-leave-active .modal-panel { transition: transform 0.2s ease, opacity 0.2s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-from .modal-panel, .modal-leave-to .modal-panel { transform: translateY(-12px); opacity: 0; }
</style>
