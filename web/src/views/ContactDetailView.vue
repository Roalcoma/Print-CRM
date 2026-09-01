<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  ArrowLeft, Mail, Phone, Edit2, Check, X, CalendarDays, MapPin,
  Building2, Briefcase, Globe, Linkedin, Twitter, Instagram,
  Tag, StickyNote, Cake, Trash2, ExternalLink, ChevronRight, ChevronDown,
} from 'lucide-vue-next';
import { api } from '../api';
import type { Contact, Appointment } from '../types';
import LoadingState from '../components/LoadingState.vue';
import ActivityFeed from '../components/ActivityFeed.vue';
import AppointmentModal from '../components/AppointmentModal.vue';
import Spinner from '../components/Spinner.vue';
import Dropdown from '../components/Dropdown.vue';

const route  = useRoute();
const router = useRouter();

// ── state ─────────────────────────────────────────────────────────────────────
const loading = ref(true);
const error   = ref('');
const activeTab = ref<'summary' | 'opps' | 'appointments' | 'tasks' | 'timeline'>('summary');

const contact      = ref<Contact | null>(null);
const opps         = ref<any[]>([]);
const tasks        = ref<any[]>([]);
const appointments = ref<Appointment[]>([]);

const showNewAppointment  = ref(false);
const editingAppointment  = ref<Appointment | undefined>(undefined);

// Edit slide-over
const showEdit   = ref(false);
const saving     = ref(false);
const tagDraft   = ref('');
const tagInputEl = ref<HTMLInputElement | null>(null);

const emptyForm = (c?: Contact | null) => ({
  first_name:      c?.first_name      ?? '',
  last_name:       c?.last_name       ?? '',
  email:           c?.email           ?? '',
  phone:           c?.phone           ?? '',
  email_secondary: c?.email_secondary ?? '',
  phone_secondary: c?.phone_secondary ?? '',
  company:         c?.company         ?? '',
  position:        c?.position        ?? '',
  address:         c?.address         ?? '',
  city:            c?.city            ?? '',
  country:         c?.country         ?? '',
  birthday:        c?.birthday        ?? '',
  linkedin:        c?.linkedin        ?? '',
  twitter:         c?.twitter         ?? '',
  instagram:       c?.instagram       ?? '',
  website:         c?.website         ?? '',
  source:          c?.source          ?? '',
  status:          c?.status          ?? ('active' as Contact['status']),
  tags:            [...(c?.tags ?? [])],
  notes:           c?.notes           ?? '',
});
const form = ref(emptyForm());

function addTag(raw: string) {
  const tag = raw.trim().replace(/,+$/, '');
  if (tag && !form.value.tags.includes(tag)) form.value.tags.push(tag);
  tagDraft.value = '';
}
function onTagKey(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagDraft.value); }
  else if (e.key === 'Backspace' && !tagDraft.value) form.value.tags.pop();
}
function removeFormTag(t: string) { form.value.tags = form.value.tags.filter(x => x !== t); }

// ── helpers ───────────────────────────────────────────────────────────────────
function initials(c: Contact) {
  return [c.first_name, c.last_name].filter(Boolean).map(w => w![0]).slice(0, 2).join('').toUpperCase() || '?';
}

function fullName(c: Contact) {
  return [c.first_name, c.last_name].filter(Boolean).join(' ');
}

const avatarPalette = [
  '#F69008','#3B82F6','#8B5CF6','#10B981',
  '#EF4444','#06B6D4','#F59E0B','#6366F1',
];

function avatarBg(c: Contact) {
  if (c.avatar_color) return c.avatar_color;
  const n = c.id.charCodeAt(0) + c.id.charCodeAt(c.id.length - 1);
  return avatarPalette[n % avatarPalette.length];
}

function money(n: number | string | null) {
  return Number(n).toLocaleString('es-VE', { style: 'currency', currency: 'USD' });
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtBirthday(iso: string | null) {
  if (!iso) return '—';
  // birthday is DATE so just parse the date part
  const [y, m, d] = iso.split('T')[0].split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-VE', { day: 'numeric', month: 'long' });
}

function fmtApptDate(iso: string) {
  return new Date(iso).toLocaleString('es-VE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });
}

function externalHref(val: string | null, prefix = '') {
  if (!val) return '';
  if (val.startsWith('http')) return val;
  return prefix + val;
}

// ── load ──────────────────────────────────────────────────────────────────────
onMounted(async () => {
  try {
    const id = route.params.id as string;
    const detail = await api.get<Contact & { opportunities: any[]; tasks: any[]; appointments: Appointment[] }>(`/contacts/${id}`);
    contact.value      = detail;
    opps.value         = (detail as any).opportunities ?? [];
    tasks.value        = (detail as any).tasks         ?? [];
    appointments.value = (detail as any).appointments  ?? [];
    form.value = emptyForm(contact.value);
  } catch (e: any) {
    error.value = e.message ?? 'Error al cargar el contacto';
  } finally {
    loading.value = false;
  }
});

// ── edit ──────────────────────────────────────────────────────────────────────
function openEdit() {
  form.value = emptyForm(contact.value);
  showEdit.value = true;
}

async function saveEdit() {
  if (!contact.value) return;
  if (tagDraft.value.trim()) addTag(tagDraft.value);
  saving.value = true;
  try {
    const updated = await api.put<Contact>(`/contacts/${contact.value.id}`, {
      ...form.value,
      birthday:        form.value.birthday        || null,
      email:           form.value.email           || null,
      email_secondary: form.value.email_secondary || null,
      source:          form.value.source          || null,
    });
    contact.value = updated;
    tagDraft.value = '';
    showEdit.value = false;
  } finally {
    saving.value = false;
  }
}

async function deleteContact() {
  if (!contact.value) return;
  if (!confirm(`¿Eliminar a ${fullName(contact.value)}?`)) return;
  await api.del(`/contacts/${contact.value.id}`);
  router.push('/contacts');
}

// ── appointments ──────────────────────────────────────────────────────────────
async function reloadAppointments() {
  if (!contact.value) return;
  appointments.value = await api.get<Appointment[]>(`/contacts/${contact.value.id}/appointments`);
}

function openNewAppt() {
  editingAppointment.value = undefined;
  showNewAppointment.value = true;
}

function openEditAppt(a: Appointment) {
  editingAppointment.value = a;
  showNewAppointment.value = true;
}

// ── badge maps ────────────────────────────────────────────────────────────────
const oppStatusClass:  Record<string, string> = { open: 'bg-emerald-100 text-emerald-700', won: 'bg-sky-100 text-sky-700', lost: 'bg-slate-100 text-slate-500' };
const oppStatusLabel:  Record<string, string> = { open: 'Abierta', won: 'Ganada', lost: 'Perdida' };

const taskPriorityClass: Record<string, string> = { high: 'bg-red-100 text-red-700', medium: 'bg-amber-100 text-amber-700', low: 'bg-slate-100 text-slate-500' };
const taskPriorityLabel: Record<string, string> = { high: 'Alta', medium: 'Media', low: 'Baja' };

const taskStatusClass: Record<string, string> = { pending: 'bg-slate-100 text-slate-600', in_progress: 'bg-amber-100 text-amber-700', done: 'bg-emerald-100 text-emerald-700' };
const taskStatusLabel: Record<string, string> = { pending: 'Pendiente', in_progress: 'En progreso', done: 'Hecho' };

const apptStatusClass: Record<string, string> = { scheduled: 'bg-[#F69008]/15 text-[#9a5a00]', completed: 'bg-emerald-100 text-emerald-700', cancelled: 'bg-slate-100 text-slate-400', no_show: 'bg-slate-100 text-slate-400' };
const apptStatusLabel: Record<string, string> = { scheduled: 'Programada', completed: 'Completada', cancelled: 'Cancelada', no_show: 'No asistió' };

const statusBadge: Record<string, string> = { active: 'bg-emerald-100 text-emerald-700', inactive: 'bg-slate-100 text-slate-500', blocked: 'bg-red-100 text-red-600' };
const statusLabel: Record<string, string> = { active: 'Activo', inactive: 'Inactivo', blocked: 'Bloqueado' };

const sourceLabel: Record<string, string> = { website: 'Web', referral: 'Referido', cold: 'En frío', social: 'Redes', event: 'Evento', other: 'Otro' };
const sourceOptions = ['website','referral','cold','social','event','other'];

const tabs = [
  { key: 'summary',      label: 'Resumen' },
  { key: 'opps',         label: 'Oportunidades' },
  { key: 'appointments', label: 'Citas' },
  { key: 'tasks',        label: 'Tareas' },
  { key: 'timeline',     label: 'Actividad' },
] as const;
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden">

    <!-- Top bar -->
    <div class="flex items-center gap-3 border-b border-slate-200 bg-white px-6 py-3">
      <button
        class="flex cursor-pointer items-center gap-1.5 text-sm text-slate-500 hover:text-primary transition-colors"
        @click="router.push('/contacts')"
      >
        <ArrowLeft class="h-4 w-4" /> Contactos
      </button>
    </div>

    <LoadingState v-if="loading" label="Cargando contacto…" class="mt-12" />

    <div v-else-if="error" class="mx-auto mt-16 flex max-w-sm flex-col items-center gap-4 text-slate-500">
      <p class="text-sm">{{ error }}</p>
      <button class="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white cursor-pointer" @click="router.back()">Volver</button>
    </div>

    <!-- Main layout -->
    <div v-else-if="contact" class="flex flex-1 overflow-hidden">

      <!-- ── Left sidebar ──────────────────────────────────────────────────── -->
      <aside class="hidden w-72 flex-shrink-0 overflow-y-auto border-r border-slate-200 bg-white lg:flex lg:flex-col">

        <!-- Avatar header -->
        <div class="flex flex-col items-center gap-3 border-b border-slate-100 px-6 py-6">
          <div
            class="flex h-20 w-20 items-center justify-center rounded-full text-2xl font-bold text-white shadow-lg"
            :style="{ backgroundColor: avatarBg(contact) }"
          >{{ initials(contact) }}</div>
          <div class="text-center">
            <h1 class="text-lg font-bold text-slate-900">{{ fullName(contact) }}</h1>
            <p v-if="contact.position || contact.company" class="mt-0.5 text-sm text-slate-500">
              <span v-if="contact.position">{{ contact.position }}</span>
              <span v-if="contact.position && contact.company"> · </span>
              <span v-if="contact.company" class="font-medium text-slate-700">{{ contact.company }}</span>
            </p>
          </div>

          <!-- Status + source badges -->
          <div class="flex flex-wrap justify-center gap-1.5">
            <span class="rounded-full px-2.5 py-0.5 text-xs font-medium" :class="statusBadge[contact.status]">
              {{ statusLabel[contact.status] }}
            </span>
            <span v-if="contact.source" class="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-600">
              {{ sourceLabel[contact.source] ?? contact.source }}
            </span>
          </div>

          <!-- Action buttons -->
          <div class="flex w-full gap-2">
            <a
              v-if="contact.phone"
              :href="`tel:${contact.phone}`"
              class="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-1.5 text-xs font-medium text-slate-600 hover:border-primary hover:text-primary transition-colors"
            >
              <Phone class="h-3.5 w-3.5" /> Llamar
            </a>
            <a
              v-if="contact.email"
              :href="`mailto:${contact.email}`"
              class="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-1.5 text-xs font-medium text-slate-600 hover:border-primary hover:text-primary transition-colors"
            >
              <Mail class="h-3.5 w-3.5" /> Email
            </a>
            <button
              class="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-primary py-1.5 text-xs font-semibold text-white hover:bg-primary-dark transition-colors"
              @click="openEdit"
            >
              <Edit2 class="h-3.5 w-3.5" /> Editar
            </button>
          </div>
        </div>

        <!-- Info list -->
        <div class="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          <!-- Contact info -->
          <section class="space-y-2.5">
            <h3 class="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Contacto</h3>

            <div v-if="contact.email" class="flex items-start gap-2.5">
              <Mail class="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
              <div class="min-w-0">
                <p class="text-[10px] text-slate-400">Email</p>
                <a :href="`mailto:${contact.email}`" class="block truncate text-xs font-medium text-primary hover:underline">{{ contact.email }}</a>
              </div>
            </div>

            <div v-if="contact.email_secondary" class="flex items-start gap-2.5">
              <Mail class="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-300" />
              <div class="min-w-0">
                <p class="text-[10px] text-slate-400">Email secundario</p>
                <a :href="`mailto:${contact.email_secondary}`" class="block truncate text-xs text-primary hover:underline">{{ contact.email_secondary }}</a>
              </div>
            </div>

            <div v-if="contact.phone" class="flex items-start gap-2.5">
              <Phone class="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
              <div>
                <p class="text-[10px] text-slate-400">Teléfono</p>
                <a :href="`tel:${contact.phone}`" class="text-xs font-medium text-primary hover:underline">{{ contact.phone }}</a>
              </div>
            </div>

            <div v-if="contact.phone_secondary" class="flex items-start gap-2.5">
              <Phone class="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-300" />
              <div>
                <p class="text-[10px] text-slate-400">Teléfono secundario</p>
                <a :href="`tel:${contact.phone_secondary}`" class="text-xs text-primary hover:underline">{{ contact.phone_secondary }}</a>
              </div>
            </div>

            <div v-if="contact.city || contact.country" class="flex items-start gap-2.5">
              <MapPin class="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
              <div>
                <p class="text-[10px] text-slate-400">Ubicación</p>
                <p class="text-xs text-slate-700">{{ [contact.city, contact.country].filter(Boolean).join(', ') }}</p>
              </div>
            </div>

            <div v-if="contact.birthday" class="flex items-start gap-2.5">
              <Cake class="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
              <div>
                <p class="text-[10px] text-slate-400">Cumpleaños</p>
                <p class="text-xs text-slate-700">{{ fmtBirthday(contact.birthday) }}</p>
              </div>
            </div>
          </section>

          <!-- Company -->
          <section v-if="contact.company || contact.position" class="space-y-2.5">
            <h3 class="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Empresa</h3>
            <div v-if="contact.company" class="flex items-start gap-2.5">
              <Building2 class="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
              <div>
                <p class="text-[10px] text-slate-400">Empresa</p>
                <p class="text-xs font-medium text-slate-800">{{ contact.company }}</p>
              </div>
            </div>
            <div v-if="contact.position" class="flex items-start gap-2.5">
              <Briefcase class="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
              <div>
                <p class="text-[10px] text-slate-400">Cargo</p>
                <p class="text-xs text-slate-700">{{ contact.position }}</p>
              </div>
            </div>
          </section>

          <!-- Social -->
          <section v-if="contact.linkedin || contact.twitter || contact.instagram || contact.website" class="space-y-2">
            <h3 class="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Redes sociales</h3>
            <a v-if="contact.linkedin" :href="externalHref(contact.linkedin, 'https://')" target="_blank" rel="noopener" class="flex items-center gap-2 text-xs text-[#0077B5] hover:underline">
              <Linkedin class="h-4 w-4 flex-shrink-0" /> <span class="truncate">{{ contact.linkedin }}</span>
              <ExternalLink class="h-3 w-3 flex-shrink-0 opacity-60" />
            </a>
            <a v-if="contact.twitter" :href="externalHref(contact.twitter, 'https://twitter.com/')" target="_blank" rel="noopener" class="flex items-center gap-2 text-xs text-[#1DA1F2] hover:underline">
              <Twitter class="h-4 w-4 flex-shrink-0" /> <span class="truncate">{{ contact.twitter }}</span>
              <ExternalLink class="h-3 w-3 flex-shrink-0 opacity-60" />
            </a>
            <a v-if="contact.instagram" :href="externalHref(contact.instagram, 'https://instagram.com/')" target="_blank" rel="noopener" class="flex items-center gap-2 text-xs text-[#E1306C] hover:underline">
              <Instagram class="h-4 w-4 flex-shrink-0" /> <span class="truncate">{{ contact.instagram }}</span>
              <ExternalLink class="h-3 w-3 flex-shrink-0 opacity-60" />
            </a>
            <a v-if="contact.website" :href="externalHref(contact.website, 'https://')" target="_blank" rel="noopener" class="flex items-center gap-2 text-xs text-slate-600 hover:underline">
              <Globe class="h-4 w-4 flex-shrink-0 text-slate-400" /> <span class="truncate">{{ contact.website }}</span>
              <ExternalLink class="h-3 w-3 flex-shrink-0 opacity-60" />
            </a>
          </section>

          <!-- Tags -->
          <section v-if="contact.tags?.length">
            <h3 class="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Etiquetas</h3>
            <div class="flex flex-wrap gap-1.5">
              <span
                v-for="t in contact.tags"
                :key="t"
                class="rounded-full bg-[#F69008]/10 px-2 py-0.5 text-xs font-medium text-[#D97706]"
              >{{ t }}</span>
            </div>
          </section>

          <!-- Delete button -->
          <div class="pt-2">
            <button
              class="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-red-100 py-2 text-xs text-red-500 transition-colors hover:bg-red-50"
              @click="deleteContact"
            >
              <Trash2 class="h-3.5 w-3.5" /> Eliminar contacto
            </button>
          </div>
        </div>
      </aside>

      <!-- ── Main panel ────────────────────────────────────────────────────── -->
      <div class="flex flex-1 flex-col overflow-hidden">

        <!-- Mobile header (shown on mobile where sidebar is hidden) -->
        <div class="flex items-center gap-4 border-b border-slate-200 bg-white px-6 py-4 lg:hidden">
          <div
            class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full text-lg font-bold text-white"
            :style="{ backgroundColor: avatarBg(contact) }"
          >{{ initials(contact) }}</div>
          <div class="min-w-0 flex-1">
            <h1 class="truncate text-base font-bold text-slate-900">{{ fullName(contact) }}</h1>
            <p v-if="contact.company" class="truncate text-sm text-slate-500">{{ contact.company }}</p>
          </div>
          <button class="cursor-pointer rounded-lg border border-slate-200 p-2 text-slate-500 hover:border-primary hover:text-primary" @click="openEdit">
            <Edit2 class="h-4 w-4" />
          </button>
        </div>

        <!-- Tabs -->
        <div class="border-b border-slate-200 bg-white px-6">
          <nav class="flex gap-1">
            <button
              v-for="tab in tabs"
              :key="tab.key"
              class="cursor-pointer border-b-2 px-4 py-3 text-sm font-medium transition-colors"
              :class="activeTab === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-slate-500 hover:text-slate-700'"
              @click="activeTab = tab.key"
            >{{ tab.label }}</button>
          </nav>
        </div>

        <!-- Tab content -->
        <div class="flex-1 overflow-y-auto p-6">

          <!-- RESUMEN -->
          <div v-if="activeTab === 'summary'" class="space-y-4 max-w-2xl">
            <!-- Notes -->
            <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div class="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <StickyNote class="h-4 w-4 text-slate-400" /> Notas
              </div>
              <p v-if="contact.notes" class="whitespace-pre-wrap text-sm text-slate-700">{{ contact.notes }}</p>
              <p v-else class="text-sm italic text-slate-400">Sin notas. Edita el contacto para añadir observaciones.</p>
            </div>

            <!-- Quick stats -->
            <div class="grid grid-cols-3 gap-3">
              <div class="rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm">
                <p class="text-2xl font-bold text-slate-900">{{ opps.length }}</p>
                <p class="text-xs text-slate-500">Oportunidades</p>
              </div>
              <div class="rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm">
                <p class="text-2xl font-bold text-slate-900">{{ appointments.length }}</p>
                <p class="text-xs text-slate-500">Citas</p>
              </div>
              <div class="rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm">
                <p class="text-2xl font-bold text-slate-900">{{ tasks.filter(t => t.status !== 'done').length }}</p>
                <p class="text-xs text-slate-500">Tareas pendientes</p>
              </div>
            </div>
          </div>

          <!-- OPORTUNIDADES -->
          <div v-else-if="activeTab === 'opps'">
            <div v-if="opps.length === 0" class="rounded-xl border border-dashed border-slate-200 py-14 text-center text-sm text-slate-400">
              No hay oportunidades asociadas a este contacto.
            </div>
            <div v-else class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <table class="w-full text-sm">
                <thead class="border-b border-slate-200 bg-slate-50 text-left">
                  <tr>
                    <th class="px-4 py-3 text-xs font-semibold text-slate-500">Título</th>
                    <th class="px-4 py-3 text-xs font-semibold text-slate-500">Etapa</th>
                    <th class="px-4 py-3 text-xs font-semibold text-slate-500">Valor</th>
                    <th class="px-4 py-3 text-xs font-semibold text-slate-500">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="o in opps" :key="o.id" class="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors cursor-pointer" @click="router.push(`/opportunities`)">
                    <td class="px-4 py-3 font-medium text-slate-900">{{ o.title }}</td>
                    <td class="px-4 py-3 text-slate-600">{{ o.stage_name }}</td>
                    <td class="px-4 py-3 text-slate-700">{{ money(o.value) }}</td>
                    <td class="px-4 py-3">
                      <span class="rounded-full px-2.5 py-0.5 text-xs font-medium" :class="oppStatusClass[o.status] ?? 'bg-slate-100 text-slate-500'">
                        {{ oppStatusLabel[o.status] ?? o.status }}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- CITAS -->
          <div v-else-if="activeTab === 'appointments'">
            <div class="mb-4 flex justify-end">
              <button
                class="flex cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-dark transition-colors"
                @click="openNewAppt"
              >
                <CalendarDays class="h-4 w-4" /> + Nueva cita
              </button>
            </div>

            <div v-if="appointments.length === 0" class="rounded-xl border border-dashed border-slate-200 py-14 text-center text-sm text-slate-400">
              No hay citas asociadas a este contacto.
            </div>
            <ul v-else class="flex flex-col gap-2">
              <li
                v-for="a in appointments"
                :key="a.id"
                class="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition-colors hover:border-primary/30 hover:bg-slate-50"
                @click="openEditAppt(a)"
              >
                <div class="flex min-w-0 items-center gap-3">
                  <CalendarDays class="h-5 w-5 flex-shrink-0 text-primary" />
                  <div class="min-w-0">
                    <p class="truncate text-sm font-medium text-slate-900" :class="a.status === 'cancelled' || a.status === 'no_show' ? 'line-through text-slate-400' : ''">{{ a.title }}</p>
                    <p class="mt-0.5 text-xs text-slate-400">{{ fmtApptDate(a.start_at) }}</p>
                    <p v-if="a.location" class="mt-0.5 flex items-center gap-1 text-xs text-slate-400"><MapPin class="h-3 w-3" />{{ a.location }}</p>
                  </div>
                </div>
                <span class="flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium" :class="apptStatusClass[a.status]">{{ apptStatusLabel[a.status] }}</span>
              </li>
            </ul>
          </div>

          <!-- TAREAS -->
          <div v-else-if="activeTab === 'tasks'">
            <div v-if="tasks.length === 0" class="rounded-xl border border-dashed border-slate-200 py-14 text-center text-sm text-slate-400">
              No hay tareas ligadas a este contacto.
            </div>
            <ul v-else class="flex flex-col gap-2">
              <li
                v-for="t in tasks"
                :key="t.id"
                class="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
              >
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium text-slate-900">{{ t.title }}</p>
                  <p v-if="t.opportunity_title" class="mt-0.5 truncate text-xs text-slate-400">{{ t.opportunity_title }}</p>
                </div>
                <div class="flex flex-shrink-0 items-center gap-2">
                  <span class="rounded-full px-2.5 py-0.5 text-xs font-medium" :class="taskPriorityClass[t.priority] ?? 'bg-slate-100 text-slate-500'">{{ taskPriorityLabel[t.priority] ?? t.priority }}</span>
                  <span class="rounded-full px-2.5 py-0.5 text-xs font-medium" :class="taskStatusClass[t.status] ?? 'bg-slate-100 text-slate-500'">{{ taskStatusLabel[t.status] ?? t.status }}</span>
                  <span class="whitespace-nowrap text-xs text-slate-400">{{ fmtDate(t.due_at) }}</span>
                </div>
              </li>
            </ul>
          </div>

          <!-- TIMELINE -->
          <div v-else-if="activeTab === 'timeline'">
            <ActivityFeed :entity-type="'contact'" :entity-id="contact.id" />
          </div>

        </div>
      </div>
    </div>

    <!-- ── Edit slide-over ───────────────────────────────────────────────────── -->
    <Transition name="overlay">
      <div v-if="showEdit" class="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" @click="showEdit = false" />
    </Transition>

    <Transition name="slideover">
      <aside v-if="showEdit" class="fixed right-0 top-0 z-50 flex h-full w-full max-w-lg flex-col bg-white shadow-2xl">
        <div class="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 class="text-base font-semibold text-slate-900">Editar contacto</h2>
          <button class="cursor-pointer rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" @click="showEdit = false">
            <X class="h-5 w-5" />
          </button>
        </div>

        <form class="flex-1 overflow-y-auto px-6 py-5 space-y-6" @submit.prevent="saveEdit">

          <!-- Personal -->
          <section>
            <h3 class="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Información personal</h3>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="mb-1 block text-xs text-slate-500">Nombre *</label>
                <input v-model="form.first_name" required class="input" placeholder="Juan" />
              </div>
              <div>
                <label class="mb-1 block text-xs text-slate-500">Apellido</label>
                <input v-model="form.last_name" class="input" placeholder="Pérez" />
              </div>
              <div>
                <label class="mb-1 block text-xs text-slate-500">Fecha de nacimiento</label>
                <input v-model="form.birthday" type="date" class="input" />
              </div>
              <div>
                <label class="mb-1 block text-xs text-slate-500">Estado</label>
                <Dropdown width="100%">
                  <template #trigger="{ open }">
                    <button type="button" class="input flex items-center justify-between text-slate-700 cursor-pointer">
                      {{ { active:'Activo', inactive:'Inactivo', blocked:'Bloqueado' }[form.status] }}
                      <ChevronDown class="h-3.5 w-3.5 text-slate-400 transition-transform" :class="open ? 'rotate-180' : ''" />
                    </button>
                  </template>
                  <div class="py-0.5">
                    <button v-for="opt in [{ v:'active', l:'Activo' }, { v:'inactive', l:'Inactivo' }, { v:'blocked', l:'Bloqueado' }]"
                      type="button" :key="opt.v"
                      class="flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-slate-50"
                      :class="form.status === opt.v ? 'text-primary font-medium' : 'text-slate-700'"
                      @click="form.status = opt.v as Contact['status']"
                    >{{ opt.l }}</button>
                  </div>
                </Dropdown>
              </div>
            </div>
          </section>

          <!-- Contact -->
          <section>
            <h3 class="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Contacto</h3>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="mb-1 block text-xs text-slate-500">Email principal</label>
                <input v-model="form.email" type="email" class="input" placeholder="juan@ejemplo.com" />
              </div>
              <div>
                <label class="mb-1 block text-xs text-slate-500">Email secundario</label>
                <input v-model="form.email_secondary" type="email" class="input" placeholder="otro@email.com" />
              </div>
              <div>
                <label class="mb-1 block text-xs text-slate-500">Teléfono principal</label>
                <input v-model="form.phone" class="input" placeholder="+58 412 000 0000" />
              </div>
              <div>
                <label class="mb-1 block text-xs text-slate-500">Teléfono secundario</label>
                <input v-model="form.phone_secondary" class="input" placeholder="+58 412 111 1111" />
              </div>
              <div class="col-span-2">
                <label class="mb-1 block text-xs text-slate-500">Dirección</label>
                <input v-model="form.address" class="input" placeholder="Av. Principal, Edificio Torre" />
              </div>
              <div>
                <label class="mb-1 block text-xs text-slate-500">Ciudad</label>
                <input v-model="form.city" class="input" placeholder="Caracas" />
              </div>
              <div>
                <label class="mb-1 block text-xs text-slate-500">País</label>
                <input v-model="form.country" class="input" placeholder="Venezuela" />
              </div>
            </div>
          </section>

          <!-- Company -->
          <section>
            <h3 class="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Empresa</h3>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="mb-1 block text-xs text-slate-500">Empresa</label>
                <input v-model="form.company" class="input" placeholder="Empresa S.A." />
              </div>
              <div>
                <label class="mb-1 block text-xs text-slate-500">Cargo</label>
                <input v-model="form.position" class="input" placeholder="Gerente de Ventas" />
              </div>
              <div>
                <label class="mb-1 block text-xs text-slate-500">Origen</label>
                <Dropdown width="100%">
                  <template #trigger="{ open }">
                    <button type="button" class="input flex items-center justify-between text-slate-700 cursor-pointer">
                      {{ form.source ? (sourceLabel[form.source] ?? form.source) : 'Sin especificar' }}
                      <ChevronDown class="h-3.5 w-3.5 text-slate-400 transition-transform" :class="open ? 'rotate-180' : ''" />
                    </button>
                  </template>
                  <div class="py-0.5">
                    <button type="button" class="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-500 hover:bg-slate-50 transition-colors" @click="form.source = ''">Sin especificar</button>
                    <button v-for="s in sourceOptions" type="button" :key="s"
                      class="flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-slate-50"
                      :class="form.source === s ? 'text-primary font-medium' : 'text-slate-700'"
                      @click="form.source = s"
                    >{{ sourceLabel[s] }}</button>
                  </div>
                </Dropdown>
              </div>
              <div>
                <label class="mb-1 block text-xs text-slate-500">Etiquetas</label>
                <div
                  class="input flex min-h-[2.25rem] flex-wrap items-center gap-1 cursor-text"
                  @click="tagInputEl?.focus()"
                >
                  <span
                    v-for="t in form.tags" :key="t"
                    class="flex items-center gap-1 rounded bg-[#F69008]/10 px-1.5 py-0.5 text-xs font-medium text-[#D97706]"
                  >
                    {{ t }}
                    <button type="button" @click.stop="removeFormTag(t)" class="leading-none hover:text-[#92400e]"><X class="h-3 w-3" /></button>
                  </span>
                  <input
                    ref="tagInputEl"
                    v-model="tagDraft"
                    @keydown="onTagKey"
                    @blur="() => { if(tagDraft.trim()) addTag(tagDraft); }"
                    placeholder="Añadir…"
                    class="min-w-[80px] flex-1 border-none bg-transparent text-sm outline-none placeholder:text-slate-400"
                  />
                </div>
              </div>
            </div>
          </section>

          <!-- Social -->
          <section>
            <h3 class="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Redes sociales</h3>
            <div class="grid grid-cols-2 gap-3">
              <div class="flex items-center gap-2">
                <Linkedin class="h-4 w-4 flex-shrink-0 text-[#0077B5]" />
                <input v-model="form.linkedin" class="input flex-1" placeholder="linkedin.com/in/…" />
              </div>
              <div class="flex items-center gap-2">
                <Twitter class="h-4 w-4 flex-shrink-0 text-[#1DA1F2]" />
                <input v-model="form.twitter" class="input flex-1" placeholder="@usuario" />
              </div>
              <div class="flex items-center gap-2">
                <Instagram class="h-4 w-4 flex-shrink-0 text-[#E1306C]" />
                <input v-model="form.instagram" class="input flex-1" placeholder="@usuario" />
              </div>
              <div class="flex items-center gap-2">
                <Globe class="h-4 w-4 flex-shrink-0 text-slate-400" />
                <input v-model="form.website" class="input flex-1" placeholder="https://empresa.com" />
              </div>
            </div>
          </section>

          <!-- Notes -->
          <section>
            <h3 class="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Notas</h3>
            <textarea v-model="form.notes" rows="4" class="input resize-none" placeholder="Observaciones…" />
          </section>

          <div class="flex items-center gap-3 pb-2">
            <button
              type="submit"
              :disabled="saving"
              class="flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-dark disabled:opacity-60 transition-colors"
            >
              <Spinner v-if="saving" :size="14" light />
              {{ saving ? 'Guardando…' : 'Guardar cambios' }}
            </button>
            <button type="button" class="cursor-pointer rounded-lg px-4 py-2.5 text-sm text-slate-500 hover:bg-slate-100" @click="showEdit = false">Cancelar</button>
          </div>
        </form>
      </aside>
    </Transition>

    <!-- Appointment modal -->
    <AppointmentModal
      v-if="contact"
      v-model="showNewAppointment"
      :appointment="editingAppointment"
      :initial-contact-id="contact.id"
      :initial-contact-name="fullName(contact)"
      @saved="reloadAppointments"
      @deleted="reloadAppointments"
    />

  </div>
</template>

<style scoped>
.slideover-enter-active,
.slideover-leave-active {
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.slideover-enter-from,
.slideover-leave-to {
  transform: translateX(100%);
}

.overlay-enter-active,
.overlay-leave-active {
  transition: opacity 0.2s ease;
}
.overlay-enter-from,
.overlay-leave-to {
  opacity: 0;
}
</style>
