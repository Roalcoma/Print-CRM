<script setup lang="ts">
// Spinner de anillo (CSS puro, sin dependencias). Hereda color con text-*.
withDefaults(defineProps<{ size?: number; light?: boolean }>(), { size: 20, light: false });
</script>

<template>
  <span
    class="inline-block animate-spin rounded-full border-2 border-current border-t-transparent"
    :class="light ? 'text-white/70' : 'text-primary'"
    :style="{ width: size + 'px', height: size + 'px' }"
    role="status"
    aria-label="Cargando"
  ></span>
</template>
