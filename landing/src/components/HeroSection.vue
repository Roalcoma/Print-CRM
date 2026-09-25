<script setup lang="ts">
const CRM_URL = 'https://rocco.arbolaureo.org';
</script>

<template>
  <section class="gradient-hero min-h-screen flex flex-col items-center justify-start pt-28 pb-32 px-5 relative">
    <!-- Glow -->
    <div class="absolute inset-0 overflow-hidden pointer-events-none">
      <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] bg-primary/25 rounded-full blur-[140px]" />
    </div>

    <!-- Badge -->
    <div class="relative z-10 mb-6 inline-flex items-center gap-2 bg-white/10 border border-white/20 text-white/90 text-xs font-semibold px-4 py-1.5 rounded-full backdrop-blur-sm">
      <span class="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
      Prueba gratis por 7 días · Sin tarjeta de crédito
    </div>

    <!-- Headline -->
    <h1 class="relative z-10 text-center text-4xl md:text-6xl font-black text-white leading-tight max-w-4xl mb-6">
      El CRM para negocios que<br />
      <span class="bg-gradient-to-r from-amber-300 to-orange-200 bg-clip-text text-transparent">
        venden por WhatsApp
      </span><br />
      e Instagram
    </h1>

    <p class="relative z-10 text-center text-lg md:text-xl text-white/70 max-w-2xl mb-10 leading-relaxed">
      Gestiona tus contactos, automatiza tus seguimientos, agenda citas y responde
      a todos tus canales desde un solo lugar. Sin perder ningún prospecto.
    </p>

    <!-- CTAs -->
    <div class="relative z-10 flex flex-col sm:flex-row gap-4">
      <a
        :href="`${CRM_URL}/login`"
        class="gradient-cta text-white font-bold px-8 py-4 rounded-xl text-base shadow-2xl shadow-primary/40 hover:opacity-90 transition-opacity text-center"
      >
        Empieza tu prueba de 7 días →
      </a>
      <a
        href="#como-funciona"
        class="bg-white/10 border border-white/20 text-white font-semibold px-8 py-4 rounded-xl text-base hover:bg-white/20 transition-colors backdrop-blur-sm text-center"
      >
        Ver cómo funciona
      </a>
    </div>

    <!-- Scroll indicator -->
    <a href="#canales" class="relative z-10 mt-8 flex flex-col items-center gap-1 text-white/40 hover:text-white/70 transition-colors">
      <span class="text-xs font-medium tracking-widest uppercase">Descubrir más</span>
      <svg class="w-5 h-5 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </a>

    <!-- Wave pronunciada -->
    <div class="absolute bottom-0 left-0 right-0 z-10">
      <svg viewBox="0 0 1440 130" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" class="w-full block" style="height:100px;margin-bottom:-2px">
        <path d="M0 130 L1440 130 L1440 60 C1320 100 1200 20 1080 50 C960 80 840 10 720 45 C600 80 480 15 360 50 C240 85 120 20 0 55 Z" fill="white"/>
      </svg>
    </div>
  </section>
</template>
