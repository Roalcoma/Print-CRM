<script setup lang="ts">
import Spinner from './Spinner.vue';
withDefaults(defineProps<{ label?: string; skeleton?: boolean; rows?: number }>(), {
  skeleton: false,
  rows: 5,
});
</script>

<template>
  <!-- Skeleton shimmer: filas de contenido simuladas -->
  <div v-if="skeleton" class="space-y-3 p-5 animate-[fadeIn_0.3s_ease]">
    <div class="shimmer h-5 w-1/3 rounded-lg" />
    <div v-for="i in rows" :key="i" class="shimmer rounded-lg"
      :class="[
        'h-4',
        i % 3 === 0 ? 'w-3/4' : i % 3 === 1 ? 'w-full' : 'w-5/6'
      ]"
    />
  </div>

  <!-- Spinner centrado -->
  <div v-else class="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-slate-400">
    <Spinner :size="36" />
    <p class="text-sm font-medium tracking-wide">{{ label ?? 'Cargando…' }}</p>
  </div>
</template>
