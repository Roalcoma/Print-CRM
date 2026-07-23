<script setup lang="ts">
import { LayoutGrid, List } from 'lucide-vue-next';
defineProps<{ modelValue: 'board' | 'list' }>();
const emit = defineEmits<{ 'update:modelValue': ['board' | 'list'] }>();
const base = 'flex cursor-pointer items-center justify-center rounded p-1.5 transition-colors';
const active = 'bg-primary text-white shadow-sm';
const inactive = 'text-slate-400 hover:text-slate-700';
</script>

<template>
  <div class="flex items-center gap-0.5 rounded-md border border-slate-300 bg-white p-0.5 shadow-sm">
    <button :class="[base, modelValue === 'board' ? active : inactive]" title="Vista de tablero" @click="emit('update:modelValue', 'board')"><LayoutGrid class="h-4 w-4" /></button>
    <button :class="[base, modelValue === 'list' ? active : inactive]" title="Vista de lista" @click="emit('update:modelValue', 'list')"><List class="h-4 w-4" /></button>
  </div>
</template>
