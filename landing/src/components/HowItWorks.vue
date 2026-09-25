<template>
  <section id="como-funciona" class="py-24 bg-gray-50 scroll-mt-16">
    <div class="max-w-5xl mx-auto px-5">
      <div class="text-center mb-16">
        <p class="text-sm font-semibold text-primary uppercase tracking-widest mb-3">Sin complicaciones</p>
        <h2 class="text-3xl md:text-4xl font-black text-gray-900">Listo en menos de 10 minutos</h2>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div v-for="step in steps" :key="step.n" class="text-center">
          <div class="w-20 h-20 bg-primary rounded-full flex items-center justify-center mx-auto mb-5 shadow-xl shadow-primary/30">
            <span class="text-2xl font-black text-white">{{ step.n }}</span>
          </div>
          <h3 class="text-xl font-bold text-gray-900 mb-3">{{ step.title }}</h3>
          <p class="text-gray-500 leading-relaxed">{{ step.body }}</p>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
const steps = [
  {
    n: 1,
    title: 'Conecta tus canales',
    body: 'Vincula tu WhatsApp, Instagram y Facebook en pocos clics. Sin código, sin complicaciones técnicas.',
  },
  {
    n: 2,
    title: 'Importa tus contactos',
    body: 'Sube tu base de clientes existente o empieza desde cero. Rocco organiza todo automáticamente.',
  },
  {
    n: 3,
    title: 'Automatiza y vende',
    body: 'Configura tus automatizaciones y deja que Rocco trabaje mientras tú te concentras en cerrar ventas.',
  },
];
</script>
