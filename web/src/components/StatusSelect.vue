<script setup lang="ts">
import { computed } from 'vue';
import { ChevronDown, Check } from 'lucide-vue-next';
import { TASK_STATUSES } from '../taskStatus';
import type { TaskStatus } from '../types';
import Dropdown from './Dropdown.vue';

// Select de estado estilizado (dropdown propio con puntos de color).
// `block` = variante de campo de formulario (ancho completo); si no, píldora compacta.
const props = withDefaults(defineProps<{ modelValue: TaskStatus; block?: boolean; align?: 'left' | 'right' }>(), {
  block: false, align: 'right',
});
const emit = defineEmits<{ 'update:modelValue': [TaskStatus] }>();
const current = computed(() => TASK_STATUSES.find(s => s.key === props.modelValue) ?? TASK_STATUSES[0]);
</script>

<template>
  <Dropdown :align="align" width="184px" :trigger-class="block ? 'block w-full' : 'inline-flex'">
    <template #trigger="{ open }">
      <button v-if="!block" type="button" class="flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold shadow-sm transition-all hover:brightness-95" :class="[current.badge, open && 'ring-2 ring-primary/30']">
        <span class="h-2 w-2 rounded-full" :style="{ backgroundColor: current.color }"></span>
        {{ current.label }}
        <ChevronDown class="h-3 w-3 opacity-60 transition-transform" :class="open && 'rotate-180'" />
      </button>
      <button v-else type="button" class="flex w-full cursor-pointer items-center justify-between rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm transition-all" :class="open && 'border-primary ring-2 ring-primary/20'">
        <span class="flex items-center gap-2 font-medium text-slate-700">
          <span class="h-2.5 w-2.5 rounded-full" :style="{ backgroundColor: current.color }"></span>
          {{ current.label }}
        </span>
        <ChevronDown class="h-4 w-4 text-slate-400 transition-transform" :class="open && 'rotate-180'" />
      </button>
    </template>
    <button
      v-for="s in TASK_STATUSES"
      :key="s.key"
      type="button"
      class="flex w-full cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-slate-100"
      @click="emit('update:modelValue', s.key)"
    >
      <span class="flex items-center gap-2">
        <span class="h-2.5 w-2.5 rounded-full" :style="{ backgroundColor: s.color }"></span>
        <span class="text-slate-700">{{ s.label }}</span>
      </span>
      <Check v-if="s.key === modelValue" class="h-4 w-4 text-primary" />
    </button>
  </Dropdown>
</template>
