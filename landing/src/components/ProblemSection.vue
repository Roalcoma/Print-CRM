<template>
  <section class="py-20 bg-gray-50">
    <div class="max-w-4xl mx-auto px-5 text-center">
      <p class="text-sm font-semibold text-primary uppercase tracking-widest mb-4">¿Te suena familiar?</p>
      <h2 class="text-3xl md:text-4xl font-black text-gray-900 mb-6">
        Tus prospectos te escriben por mil lados<br />y se pierden en el camino
      </h2>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mt-10 text-left">
        <div
          v-for="pain in pains" :key="pain.title"
          class="bg-white rounded-2xl p-6 border border-red-100 shadow-sm"
        >
          <div class="w-11 h-11 rounded-xl bg-red-50 text-red-400 flex items-center justify-center mb-4">
            <span v-html="pain.icon" />
          </div>
          <h3 class="font-bold text-gray-900 mb-2">{{ pain.title }}</h3>
          <p class="text-gray-500 text-sm leading-relaxed">{{ pain.body }}</p>
        </div>
      </div>
      <div class="mt-10 inline-flex items-center gap-3 bg-primary text-white font-bold px-6 py-4 rounded-2xl text-lg shadow-xl shadow-primary/30">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Rocco CRM resuelve todo esto
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
const pains = [
  {
    icon: `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>`,
    title: 'Conversaciones dispersas',
    body: 'Tienes un WhatsApp, un Instagram, un Facebook... y nunca sabes a cuál responder primero ni qué le dijiste a quién.',
  },
  {
    icon: `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
    title: 'Seguimientos que se olvidan',
    body: 'Prometiste llamar el jueves, el cliente esperó y nunca llegaste. La venta se enfrió y se fue con la competencia.',
  },
  {
    icon: `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>`,
    title: 'Sin historial ni contexto',
    body: '¿Cuántas citas tienes esta semana? ¿Quién ya pagó? ¿Quién sigue interesado? Todo está en tu cabeza y en notas de voz.',
  },
];
</script>
