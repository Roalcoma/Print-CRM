<script setup lang="ts">
const CRM_URL = 'https://rocco.arbolaureo.org';
</script>

<template>
  <section class="py-24 gradient-hero relative overflow-hidden">
    <!-- glow naranja suave centrado -->
    <div class="absolute inset-0 overflow-hidden pointer-events-none">
      <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full blur-[120px]" style="background:rgba(246,144,8,0.18)" />
    </div>
    <div class="relative z-10 max-w-3xl mx-auto px-5 text-center">
      <!-- badge naranja pequeño -->
      <span class="inline-flex items-center gap-1.5 bg-primary/15 border border-primary/30 text-primary text-xs font-bold px-4 py-1.5 rounded-full mb-6">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 10V3L4 14h7v7l9-11h-7z"/>
        </svg>
        Empieza gratis hoy
      </span>
      <h2 class="text-3xl md:text-5xl font-black text-white mb-5">
        Tu negocio merece<br />un CRM que lo entienda
      </h2>
      <p class="text-white/60 text-lg mb-10 max-w-xl mx-auto leading-relaxed">
        Sin tarjeta de crédito. Sin contratos. Solo 7 días para que veas
        por qué nuestros clientes no vuelven a las notas de voz.
      </p>
      <a
        :href="`${CRM_URL}/login`"
        class="inline-block bg-primary hover:bg-primary-dark text-white font-black px-10 py-5 rounded-2xl text-lg transition-all duration-200 hover:-translate-y-1"
        style="box-shadow: 0 8px 32px rgba(246,144,8,0.35)"
      >
        Prueba Rocco CRM 7 días gratis →
      </a>
      <p class="text-white/40 text-sm mt-5">
        ¿Tienes preguntas? Escríbenos a
        <a href="mailto:rodrigoalfonzo97@gmail.com" class="text-white/60 hover:text-white underline">
          rodrigoalfonzo97@gmail.com
        </a>
      </p>
    </div>
  </section>
</template>
