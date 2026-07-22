<script setup lang="ts">
import { ref } from 'vue';
// Menú flotante genérico. Cierra al hacer clic fuera (overlay) o en un ítem.
withDefaults(defineProps<{ align?: 'left' | 'right'; width?: string }>(), { align: 'left', width: '' });
const open = ref(false);
const close = () => { open.value = false; };
</script>

<template>
  <div class="relative">
    <div @click="open = !open"><slot name="trigger" :open="open" /></div>
    <div v-if="open" class="fixed inset-0 z-40" @click="close"></div>
    <Transition name="dropdown">
      <div
        v-if="open"
        class="absolute z-50 mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white p-1 shadow-dropdown"
        :class="align === 'right' ? 'right-0' : 'left-0'"
        :style="width ? { minWidth: width } : {}"
        @click="close"
      >
        <slot :close="close" />
      </div>
    </Transition>
  </div>
</template>
