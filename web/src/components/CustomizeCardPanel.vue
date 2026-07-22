<script setup lang="ts">
import { ref, computed } from 'vue';
import { X, ChevronUp, ChevronDown, GripVertical } from 'lucide-vue-next';
import type { Opportunity } from '../types';
import { CARD_FIELD_META, type CardConfig } from '../cardConfig';
import OpportunityCard from './OpportunityCard.vue';

const props = defineProps<{ config: CardConfig; sample: Opportunity | null }>();
const emit = defineEmits<{ apply: [CardConfig]; close: [] }>();

type Row = { key: string; label: string; enabled: boolean };

// Lista ordenada de TODOS los campos: primero los habilitados (en su orden), luego el resto.
const label = (k: string) => CARD_FIELD_META.find(m => m.key === k)?.label ?? k;
const rows = ref<Row[]>([
  ...props.config.fields.map(k => ({ key: k, label: label(k), enabled: true })),
  ...CARD_FIELD_META.filter(m => !props.config.fields.includes(m.key)).map(m => ({ ...m, enabled: false })),
]);
const layout = ref<CardConfig['layout']>(props.config.layout);

const previewConfig = computed<CardConfig>(() => ({
  fields: rows.value.filter(r => r.enabled).map(r => r.key),
  layout: layout.value,
}));

const mockOpp = {
  id: '', pipeline_id: '', stage_id: '', contact_id: null, title: 'Oportunidad de ejemplo',
  value: '50000', status: 'open', position: 0, created_at: new Date().toISOString(),
  source: 'Referido', business_name: 'Tech Innovators Inc.', tags: ['vip', 'caliente'], owner_id: null, owner_name: 'Juan Díaz',
  notes_count: 2, contact_first_name: 'María', contact_last_name: 'González', contact_email: 'maria@corp.com', contact_phone: '+58 412 5551234',
} as unknown as Opportunity;
const previewOpp = computed(() => props.sample ?? mockOpp);

function move(i: number, dir: -1 | 1) {
  const j = i + dir;
  if (j < 0 || j >= rows.value.length) return;
  [rows.value[i], rows.value[j]] = [rows.value[j], rows.value[i]];
}
const enabledCount = computed(() => rows.value.filter(r => r.enabled).length);
</script>

<template>
  <div class="fixed inset-0 z-50 flex justify-end" @click.self="emit('close')">
    <div class="absolute inset-0 bg-black/40"></div>
    <div class="slideover-panel relative flex h-full w-96 flex-col bg-white shadow-modal">
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <h2 class="text-base font-semibold text-slate-900">Personalizar tarjeta</h2>
        <button class="cursor-pointer rounded-md p-1 text-slate-400 hover:bg-slate-100" @click="emit('close')"><X class="h-5 w-5" /></button>
      </div>

      <div class="flex-1 space-y-5 overflow-auto px-5 py-5">
        <!-- Preview -->
        <div>
          <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Vista previa</p>
          <div class="rounded-lg bg-slate-100/70 p-4">
            <OpportunityCard :opp="previewOpp" :config="previewConfig" />
          </div>
        </div>

        <!-- Layout -->
        <div>
          <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Diseño</p>
          <div class="grid grid-cols-2 gap-2">
            <button
              class="cursor-pointer rounded-md border px-3 py-2 text-sm font-medium transition-all"
              :class="layout === 'default' ? 'border-primary bg-primary/5 text-primary shadow-sm' : 'border-slate-300 text-slate-600 hover:border-slate-400'"
              @click="layout = 'default'"
            >Normal</button>
            <button
              class="cursor-pointer rounded-md border px-3 py-2 text-sm font-medium transition-all"
              :class="layout === 'compact' ? 'border-primary bg-primary/5 text-primary shadow-sm' : 'border-slate-300 text-slate-600 hover:border-slate-400'"
              @click="layout = 'compact'"
            >Compacto</button>
          </div>
        </div>

        <!-- Campos -->
        <div>
          <div class="mb-2 flex items-center justify-between">
            <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Campos</p>
            <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">{{ enabledCount }} de {{ rows.length }}</span>
          </div>
          <div class="space-y-1">
            <div v-for="(r, i) in rows" :key="r.key" class="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5 shadow-sm transition-colors hover:border-slate-300">
              <GripVertical class="h-4 w-4 flex-shrink-0 text-slate-300" />
              <label class="flex flex-1 cursor-pointer items-center gap-2.5">
                <input type="checkbox" v-model="r.enabled" class="h-4 w-4 cursor-pointer rounded border-slate-300 text-primary focus:ring-primary/30" />
                <span class="text-sm" :class="r.enabled ? 'font-medium text-slate-800' : 'text-slate-400'">{{ r.label }}</span>
              </label>
              <button class="cursor-pointer rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30" :disabled="i === 0" @click="move(i, -1)"><ChevronUp class="h-4 w-4" /></button>
              <button class="cursor-pointer rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30" :disabled="i === rows.length - 1" @click="move(i, 1)"><ChevronDown class="h-4 w-4" /></button>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
        <button class="cursor-pointer rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100" @click="emit('close')">Cancelar</button>
        <button class="cursor-pointer rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-primary/30 transition-all hover:bg-primary-dark hover:shadow-md" @click="emit('apply', previewConfig)">Aplicar</button>
      </div>
    </div>
  </div>
</template>
