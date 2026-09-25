<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

const CRM_URL = 'https://rocco.arbolaureo.org';

const navLinks = [
  { href: '#funcionalidades', label: 'Funcionalidades' },
  { href: '#como-funciona',   label: 'Cómo funciona' },
  { href: '#precio',          label: 'Precio' },
  { href: '#faq',             label: 'FAQ' },
];

const scrolled = ref(false);

function onScroll() {
  scrolled.value = window.scrollY > 60;
}

onMounted(() => window.addEventListener('scroll', onScroll, { passive: true }));
onUnmounted(() => window.removeEventListener('scroll', onScroll));
</script>

<template>
  <nav
    class="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
    :class="scrolled ? 'bg-white shadow-sm' : 'bg-transparent'"
  >
    <div class="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
      <a href="#" class="flex items-center gap-2.5">
        <div class="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
          <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <span class="font-bold text-lg transition-colors" :class="scrolled ? 'text-gray-900' : 'text-white'">
          Rocco CRM
        </span>
      </a>

      <div class="hidden md:flex items-center gap-8">
        <a
          v-for="link in navLinks" :key="link.href"
          :href="link.href"
          class="text-sm font-medium transition-colors"
          :class="scrolled ? 'text-gray-600 hover:text-gray-900' : 'text-white/80 hover:text-white'"
        >
          {{ link.label }}
        </a>
      </div>

      <div class="flex items-center gap-3">
        <a
          :href="`${CRM_URL}/login`"
          class="hidden md:block text-sm font-medium transition-colors"
          :class="scrolled ? 'text-gray-600 hover:text-gray-900' : 'text-white/80 hover:text-white'"
        >
          Iniciar sesión
        </a>
        <a
          :href="`${CRM_URL}/login`"
          class="bg-primary hover:bg-primary-dark text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors shadow-lg shadow-primary/30"
        >
          Prueba 7 días gratis
        </a>
      </div>
    </div>
  </nav>
</template>
