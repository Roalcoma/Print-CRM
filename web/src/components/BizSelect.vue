<script setup lang="ts">
import { computed } from 'vue';
import { ChevronDown, Check } from 'lucide-vue-next';
import Dropdown from './Dropdown.vue';

interface Option { value: string; label: string; }

const props = defineProps<{
  modelValue: string;
  options: Option[] | string[];
  placeholder?: string;
}>();
const emit = defineEmits<{ 'update:modelValue': [v: string] }>();

const normalized = computed<Option[]>(() =>
  props.options.map(o => typeof o === 'string' ? { value: o, label: o } : o)
);

const selected = computed(() =>
  normalized.value.find(o => o.value === props.modelValue)
);

function pick(val: string) {
  emit('update:modelValue', val);
}
</script>

<template>
  <Dropdown width="100%" triggerClass="block w-full">
    <template #trigger="{ open }">
      <button
        type="button"
        class="biz-input flex w-full items-center justify-between gap-2 text-left"
        :class="open ? 'border-[#F69008] bg-white shadow-[0_0_0_3px_rgba(246,144,8,0.12)]' : ''"
      >
        <span :class="selected ? 'text-slate-900' : 'text-slate-400'">
          {{ selected?.label ?? placeholder ?? 'Seleccionar…' }}
        </span>
        <ChevronDown
          class="h-4 w-4 flex-shrink-0 text-slate-400 transition-transform duration-150"
          :class="open ? 'rotate-180 text-[#F69008]' : ''"
        />
      </button>
    </template>

    <!-- Lista de opciones -->
    <div class="max-h-56 overflow-y-auto py-1">
      <button
        v-if="placeholder"
        type="button"
        class="flex w-full items-center px-3 py-2 text-[13px] text-slate-400 hover:bg-slate-50"
        @click="pick('')"
      >
        {{ placeholder }}
      </button>
      <button
        v-for="opt in normalized"
        :key="opt.value"
        type="button"
        class="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-[13px] transition-colors"
        :class="modelValue === opt.value
          ? 'bg-primary/8 font-semibold text-primary'
          : 'text-slate-700 hover:bg-slate-50'"
        @click="pick(opt.value)"
      >
        <span>{{ opt.label }}</span>
        <Check v-if="modelValue === opt.value" class="h-3.5 w-3.5 flex-shrink-0" />
      </button>
    </div>
  </Dropdown>
</template>
