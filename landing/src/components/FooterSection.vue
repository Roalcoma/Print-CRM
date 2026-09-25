<script setup lang="ts">
const CRM_URL = 'https://rocco.arbolaureo.org';

const links = [
  { href: '#funcionalidades', label: 'Funcionalidades' },
  { href: '#como-funciona',   label: 'Cómo funciona' },
  { href: '#precio',          label: 'Precio' },
  { href: '#faq',             label: 'FAQ' },
  { href: `${CRM_URL}/privacy`, label: 'Privacidad' },
  { href: `${CRM_URL}/terms`,   label: 'Términos' },
  { href: 'mailto:rodrigoalfonzo97@gmail.com', label: 'Contacto' },
];
</script>

<template>
  <footer class="bg-gray-950 text-gray-400 py-12 px-5">
    <div class="max-w-5xl mx-auto">
      <div class="flex flex-col md:flex-row items-center md:items-start justify-between gap-8 mb-10">
        <div>
          <div class="flex items-center gap-2.5 mb-3">
            <div class="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <span class="font-bold text-lg text-white">Rocco CRM</span>
          </div>
          <p class="text-sm text-gray-500 max-w-xs">
            El CRM para negocios que venden<br />por WhatsApp e Instagram.
          </p>
          <p class="text-xs text-gray-600 mt-3">Operado por Árbol Áureo</p>
        </div>
        <div class="flex flex-wrap justify-center md:justify-end gap-6 text-sm">
          <a
            v-for="link in links" :key="link.href"
            :href="link.href"
            class="hover:text-white transition-colors"
          >
            {{ link.label }}
          </a>
        </div>
      </div>
      <div class="border-t border-gray-800 pt-6 text-center text-xs text-gray-600">
        © {{ year }} Árbol Áureo — Rocco CRM. Todos los derechos reservados.
      </div>
    </div>
  </footer>
</template>

<script lang="ts">
export default {
  computed: {
    year: () => new Date().getFullYear(),
  },
};
</script>
