<script setup lang="ts">
import { ref, computed } from 'vue';
import { X, ChevronUp, ChevronDown, GripVertical } from 'lucide-vue-next';
import type { Opportunity } from '../types';
import { CARD_FIELD_META, type CardConfig } from '../cardConfig';
import OpportunityCard from './OpportunityCard.vue';

const props = defineProps<{ config: CardConfig; sample: Opportunity | null }>();
const emit = defineEmits<{ apply: [CardConfig]; close: [] }>();

type Row = { key: string; label: string; enabled: boolean };

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
  notes_count: 2, followers: [{ id: '1', name: 'Juan Díaz' }, { id: '2', name: 'Ana López' }],
  contact_first_name: 'María', contact_last_name: 'González', contact_email: 'maria@corp.com', contact_phone: '+58 412 5551234',
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
    <div class="absolute inset-0 bg-black/30 backdrop-blur-[2px]"></div>

    <div class="slideover-panel relative flex h-full w-[360px] flex-col bg-white shadow-2xl">
      <!-- Header -->
      <div class="flex items-center justify-between px-5 py-4">
        <div>
          <h2 class="text-[15px] font-semibold text-slate-900">Personalizar tarjeta</h2>
          <p class="mt-0.5 text-xs text-slate-400">Arrastra para reordenar los campos</p>
        </div>
        <button
          class="cursor-pointer rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          @click="emit('close')"
        >
          <X class="h-4.5 w-4.5" style="height:18px;width:18px" />
        </button>
      </div>

      <div class="flex-1 overflow-auto">
        <!-- Preview -->
        <div class="mx-5 mb-5 overflow-hidden rounded-xl border border-slate-200 bg-slate-50/60">
          <div class="border-b border-slate-200 px-3.5 py-2.5">
            <p class="text-[10px] font-bold uppercase tracking-widest text-slate-400">Vista previa</p>
          </div>
          <div class="p-3.5">
            <OpportunityCard :opp="previewOpp" :config="previewConfig" />
          </div>
        </div>

        <!-- Layout toggle -->
        <div class="px-5 pb-4">
          <p class="mb-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Diseño</p>
          <div class="flex rounded-xl bg-slate-100 p-1">
            <button
              class="flex-1 rounded-lg py-1.5 text-[13px] font-medium transition-all duration-150"
              :class="layout === 'default'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'"
              @click="layout = 'default'"
            >Normal</button>
            <button
              class="flex-1 rounded-lg py-1.5 text-[13px] font-medium transition-all duration-150"
              :class="layout === 'compact'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'"
              @click="layout = 'compact'"
            >Compacto</button>
          </div>
        </div>

        <!-- Divider -->
        <div class="mx-5 mb-3 h-px bg-slate-100"></div>

        <!-- Campos -->
        <div class="px-5 pb-4">
          <div class="mb-2.5 flex items-center justify-between">
            <p class="text-[10px] font-bold uppercase tracking-widest text-slate-400">Campos</p>
            <span class="text-[11px] font-semibold text-slate-400">
              <span class="text-[#F69008]">{{ enabledCount }}</span> / {{ rows.length }}
            </span>
          </div>

          <div class="space-y-0.5">
            <div
              v-for="(r, i) in rows"
              :key="r.key"
              class="group flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-slate-50"
            >
              <!-- Drag handle -->
              <GripVertical class="h-4 w-4 flex-shrink-0 cursor-grab text-slate-300 group-hover:text-slate-400" />

              <!-- Label -->
              <span
                class="flex-1 select-none text-[13px] transition-colors"
                :class="r.enabled ? 'font-medium text-slate-800' : 'text-slate-400'"
              >{{ r.label }}</span>

              <!-- Up / Down (aparece al hover) -->
              <div class="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  class="cursor-pointer rounded p-0.5 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700 disabled:opacity-20"
                  :disabled="i === 0"
                  @click="move(i, -1)"
                >
                  <ChevronUp class="h-3.5 w-3.5" />
                </button>
                <button
                  class="cursor-pointer rounded p-0.5 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700 disabled:opacity-20"
                  :disabled="i === rows.length - 1"
                  @click="move(i, 1)"
                >
                  <ChevronDown class="h-3.5 w-3.5" />
                </button>
              </div>

              <!-- Toggle switch -->
              <button
                class="flex h-5 w-9 flex-shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors duration-200 focus:outline-none"
                :class="r.enabled ? 'bg-[#F69008]' : 'bg-slate-300'"
                @click="r.enabled = !r.enabled"
                :aria-label="r.enabled ? 'Desactivar' : 'Activar'"
              >
                <span
                  class="h-4 w-4 rounded-full bg-white transition-transform duration-200"
                  :class="r.enabled ? 'translate-x-[16px]' : 'translate-x-0'"
                  style="box-shadow: 0 1px 3px rgba(0,0,0,0.20);"
                ></span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3.5">
        <button class="btn btn-ghost" @click="emit('close')">Cancelar</button>
        <button class="btn btn-primary" @click="emit('apply', previewConfig)">Aplicar</button>
      </div>
    </div>
  </div>
</template>
