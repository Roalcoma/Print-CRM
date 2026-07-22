<script setup lang="ts">
import Spinner from './Spinner.vue';
defineProps<{ label?: string }>();
</script>

<template>
  <div class="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-slate-400">
    <Spinner :size="32" />
    <p class="text-sm font-medium">{{ label ?? 'Cargando…' }}</p>
  </div>
</template>
