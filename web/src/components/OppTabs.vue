<script setup lang="ts">
import { RouterLink } from 'vue-router';
// Sub-navegación estilo GHL entre el tablero y la gestión de pipelines.
const base = 'border-b-2 border-transparent px-4 py-3 text-sm font-medium text-slate-500 transition-colors hover:text-slate-800';
const active = '!border-primary !text-primary';
</script>

<template>
  <nav class="flex gap-1 border-b border-slate-200 bg-white px-6">
    <RouterLink to="/opportunities" :class="base" :active-class="active">Oportunidades</RouterLink>
    <RouterLink to="/pipelines" :class="base" :active-class="active">Pipelines</RouterLink>
  </nav>
</template>
