<script setup lang="ts">
import { computed } from 'vue';
import { Phone, Mail, StickyNote, PanelRightOpen, Tag } from 'lucide-vue-next';
import type { Opportunity } from '../types';
import type { CardConfig } from '../cardConfig';
import AppointmentBadge from './AppointmentBadge.vue';

const props = defineProps<{ opp: Opportunity; config: CardConfig }>();
const emit = defineEmits<{ action: [tab: 'detalles' | 'notas'] }>();

const money = (n: number) => n.toLocaleString('es-VE', { style: 'currency', currency: 'USD' });
const shortDate = (d: string) => new Date(d).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });

const statusBadge: Record<string, string> = { open: 'bg-blue-50 text-blue-600', won: 'bg-emerald-50 text-emerald-600', lost: 'bg-red-50 text-red-600' };
const statusLabel: Record<string, string> = { open: 'Abierta', won: 'Ganada', lost: 'Perdida' };

const showOwner = computed(() => props.config.fields.includes('owner'));
// Las etiquetas NO se dibujan en el cuerpo: van como ícono con tooltip en la fila de acciones.
const bodyFields = computed(() => props.config.fields.filter(k => k !== 'owner' && k !== 'tags'));
const showTags = computed(() => props.config.fields.includes('tags') && (props.opp.tags?.length ?? 0) > 0);
const labeled = computed(() => props.config.layout === 'default');

const ownerInitials = computed(() => {
  const n = props.opp.owner_name;
  return n ? n.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() : '';
});
const contactName = computed(() => [props.opp.contact_first_name, props.opp.contact_last_name].filter(Boolean).join(' '));
const nameInitials = (n: string) => n.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
</script>

<template>
  <div class="rounded-md border border-slate-200 bg-white p-3 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-[#F69008]/30 hover:shadow-elevated">
    <!-- Título + avatar del responsable (arriba a la derecha) -->
    <div class="flex items-start justify-between gap-2">
      <p class="text-sm font-semibold text-slate-900">{{ opp.title }}</p>
      <div
        v-if="showOwner && opp.owner_name"
        class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#F69008] to-[#D97706] text-[11px] font-semibold text-white shadow-sm ring-2 ring-white"
        :title="opp.owner_name"
      >{{ ownerInitials }}</div>
    </div>

    <div class="mt-2 space-y-1.5">
      <template v-for="key in bodyFields" :key="key">
        <span v-if="key === 'status'" class="inline-block rounded-sm px-1.5 py-0.5 text-[10px] font-semibold" :class="statusBadge[opp.status]">{{ statusLabel[opp.status] }}</span>

        <p v-else-if="key === 'value'" class="text-base font-bold text-emerald-600">{{ money(Number(opp.value)) }}</p>

        <p v-else-if="key === 'contact_name' && contactName" class="text-xs font-medium text-slate-700">{{ contactName }}</p>

        <p v-else-if="key === 'contact_email' && opp.contact_email" class="truncate text-xs text-slate-400">
          <span v-if="labeled" class="text-slate-400">Email:</span> {{ opp.contact_email }}
        </p>
        <p v-else-if="key === 'contact_phone' && opp.contact_phone" class="text-xs text-slate-400">
          <span v-if="labeled" class="text-slate-400">Tel:</span> {{ opp.contact_phone }}
        </p>
        <p v-else-if="key === 'business_name' && opp.business_name" class="text-xs text-slate-500">
          <span v-if="labeled" class="text-slate-400">Empresa:</span> {{ opp.business_name }}
        </p>
        <p v-else-if="key === 'source' && opp.source" class="text-xs text-slate-500">
          <span v-if="labeled" class="text-slate-400">Fuente:</span> {{ opp.source }}
        </p>
        <p v-else-if="key === 'created_at'" class="text-[11px] text-slate-400">
          <span v-if="labeled" class="text-slate-400">Creado:</span> {{ shortDate(opp.created_at) }}
        </p>

        <!-- Seguidores: avatares apilados -->
        <div v-else-if="key === 'followers' && opp.followers?.length" class="flex items-center">
          <span v-if="labeled" class="mr-2 text-xs text-slate-400">Seguidores:</span>
          <div class="flex items-center -space-x-1.5">
            <span v-for="f in opp.followers.slice(0, 4)" :key="f.id" class="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-[#F69008] to-[#D97706] text-[9px] font-semibold text-white ring-2 ring-white" :title="f.name">{{ nameInitials(f.name) }}</span>
            <span v-if="opp.followers.length > 4" class="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[9px] font-semibold text-slate-600 ring-2 ring-white">+{{ opp.followers.length - 4 }}</span>
          </div>
        </div>
      </template>
    </div>

    <!-- Badge de próxima cita -->
    <div class="mt-2">
      <AppointmentBadge :opportunity-id="opp.id" />
    </div>

    <!-- Fila de acciones rápidas (estilo GHL) -->
    <div class="mt-2.5 flex items-center gap-0.5 border-t border-slate-100 pt-2 text-slate-400">
      <a v-if="opp.contact_phone" :href="`tel:${opp.contact_phone}`" class="cursor-pointer rounded-md p-1.5 transition-colors hover:bg-slate-100 hover:text-primary" title="Llamar" @click.stop>
        <Phone class="h-4 w-4" />
      </a>
      <a v-if="opp.contact_email" :href="`mailto:${opp.contact_email}`" class="cursor-pointer rounded-md p-1.5 transition-colors hover:bg-slate-100 hover:text-primary" title="Enviar email" @click.stop>
        <Mail class="h-4 w-4" />
      </a>
      <!-- Etiquetas: ícono + tooltip flotante al pasar el mouse -->
      <div v-if="showTags" class="group/tags relative">
        <button class="relative cursor-pointer rounded-md p-1.5 transition-colors hover:bg-slate-100 hover:text-primary" title="Etiquetas" @click.stop="emit('action', 'detalles')">
          <Tag class="h-4 w-4" />
          <span class="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#F69008] px-1 text-[9px] font-bold text-white ring-2 ring-white">{{ opp.tags.length }}</span>
        </button>
        <div class="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 hidden -translate-x-1/2 group-hover/tags:block">
          <div class="flex max-w-[220px] flex-wrap justify-center gap-1 rounded-md border border-slate-200 bg-white p-2 shadow-dropdown">
            <span v-for="t in opp.tags" :key="t" class="whitespace-nowrap rounded-sm bg-[#F69008]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#D97706]">{{ t }}</span>
          </div>
          <div class="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1 rotate-45 border-b border-r border-slate-200 bg-white"></div>
        </div>
      </div>

      <button class="relative cursor-pointer rounded-md p-1.5 transition-colors hover:bg-slate-100 hover:text-primary" title="Notas" @click.stop="emit('action', 'notas')">
        <StickyNote class="h-4 w-4" />
        <span v-if="opp.notes_count > 0" class="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-white ring-2 ring-white">{{ opp.notes_count }}</span>
      </button>
      <button class="ml-auto cursor-pointer rounded-md p-1.5 transition-colors hover:bg-slate-100 hover:text-primary" title="Ver detalles" @click.stop="emit('action', 'detalles')">
        <PanelRightOpen class="h-4 w-4" />
      </button>
    </div>
  </div>
</template>
