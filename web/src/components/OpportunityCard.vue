<script setup lang="ts">
import { computed } from 'vue';
import type { Opportunity } from '../types';
import type { CardConfig } from '../cardConfig';

const props = defineProps<{ opp: Opportunity; config: CardConfig }>();

const money = (n: number) => n.toLocaleString('es-VE', { style: 'currency', currency: 'USD' });
const shortDate = (d: string) => new Date(d).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });

const statusBadge: Record<string, string> = { open: 'bg-blue-50 text-blue-600', won: 'bg-emerald-50 text-emerald-600', lost: 'bg-red-50 text-red-600' };
const statusLabel: Record<string, string> = { open: 'Abierta', won: 'Ganada', lost: 'Perdida' };

const showOwner = computed(() => props.config.fields.includes('owner'));
const bodyFields = computed(() => props.config.fields.filter(k => k !== 'owner'));
const labeled = computed(() => props.config.layout === 'default');

const ownerInitials = computed(() => {
  const n = props.opp.owner_name;
  if (!n) return '';
  return n.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
});
const contactName = computed(() => [props.opp.contact_first_name, props.opp.contact_last_name].filter(Boolean).join(' '));
</script>

<template>
  <div class="rounded-md border border-slate-200 bg-white p-3 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-elevated">
    <!-- Título + avatar del responsable (arriba a la derecha, estilo GHL) -->
    <div class="flex items-start justify-between gap-2">
      <p class="text-sm font-semibold text-slate-900">{{ opp.title }}</p>
      <div
        v-if="showOwner && opp.owner_name"
        class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-[11px] font-semibold text-white shadow-sm ring-2 ring-white"
        :title="opp.owner_name"
      >{{ ownerInitials }}</div>
    </div>

    <div class="mt-2 space-y-1.5">
      <template v-for="key in bodyFields" :key="key">
        <!-- Estado -->
        <span v-if="key === 'status'" class="inline-block rounded-sm px-1.5 py-0.5 text-[10px] font-semibold" :class="statusBadge[opp.status]">{{ statusLabel[opp.status] }}</span>

        <!-- Valor -->
        <p v-else-if="key === 'value'" class="text-base font-bold text-emerald-600">{{ money(Number(opp.value)) }}</p>

        <!-- Etiquetas -->
        <div v-else-if="key === 'tags' && opp.tags?.length" class="flex flex-wrap gap-1">
          <span v-for="t in opp.tags" :key="t" class="rounded-sm bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600">{{ t }}</span>
        </div>

        <!-- Contacto -->
        <p v-else-if="key === 'contact_name' && contactName" class="text-xs font-medium text-slate-700">{{ contactName }}</p>

        <!-- Campos secundarios (con etiqueta en modo Normal) -->
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
      </template>
    </div>
  </div>
</template>
