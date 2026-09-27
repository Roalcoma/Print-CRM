<script setup lang="ts">
withDefaults(defineProps<{ size?: number; light?: boolean }>(), { size: 20, light: false });
</script>

<template>
  <!--
    Arco SVG: track de fondo (12% opacidad) + arco ~270° rotando.
    Circunferencia r=9 ≈ 56.5px → dasharray 43 14 ≈ 270°/90°
  -->
  <svg
    class="animate-spin"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    role="status"
    aria-label="Cargando"
    style="flex-shrink:0"
  >
    <!-- Track -->
    <circle
      cx="12" cy="12" r="9"
      stroke-width="2.5"
      :stroke="light ? 'rgba(255,255,255,0.25)' : '#F69008'"
      :stroke-opacity="light ? undefined : '0.15'"
      fill="none"
    />
    <!-- Arco principal (~270°) con cabeza redondeada -->
    <circle
      cx="12" cy="12" r="9"
      stroke-width="2.5"
      stroke-linecap="round"
      :stroke="light ? 'rgba(255,255,255,0.9)' : '#F69008'"
      stroke-dasharray="43 14"
      fill="none"
      transform="rotate(-90 12 12)"
    />
  </svg>
</template>
