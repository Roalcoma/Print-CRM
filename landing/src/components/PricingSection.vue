<script setup lang="ts">
import { ref, computed } from 'vue';

const CRM_URL = 'https://rocco.arbolaureo.org';
const annual  = ref(true);

const price    = computed(() => annual.value ? 12 : 15);
const oldPrice = computed(() => annual.value ? 15 : null);

const included = [
  'Inbox unificado: WhatsApp, Instagram y Facebook',
  'Automatizaciones ilimitadas',
  'Calendario con página de reservas pública',
  'Gestión de contactos y pipeline de ventas',
  'Sincronización con Google Calendar',
  'Recordatorios automáticos de citas',
  'Soporte por WhatsApp',
];
</script>

<template>
  <section id="precio" class="py-20 scroll-mt-16 bg-gray-50">
    <div class="max-w-4xl mx-auto px-5">

      <!-- Header -->
      <div class="text-center mb-10">
        <p class="text-sm font-semibold text-primary uppercase tracking-widest mb-3">Precio</p>
        <h2 class="text-3xl md:text-4xl font-black text-gray-900">Simple y sin sorpresas</h2>
        <p class="text-gray-500 mt-3">Un solo plan con todo incluido. Sin contratos anuales obligatorios.</p>
      </div>

      <!-- Toggle -->
      <div class="flex items-center justify-center gap-4 mb-10">
        <span class="text-sm font-semibold" :class="!annual ? 'text-gray-900' : 'text-gray-400'">Mensual</span>
        <button
          class="relative w-14 h-7 rounded-full transition-colors duration-300 focus:outline-none"
          :class="annual ? 'bg-primary' : 'bg-gray-200'"
          @click="annual = !annual"
        >
          <span
            class="absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow-md transition-transform duration-300"
            :class="annual ? 'translate-x-7' : 'translate-x-0'"
          />
        </button>
        <span class="text-sm font-semibold" :class="annual ? 'text-gray-900' : 'text-gray-400'">Anual</span>
        <Transition
          enter-active-class="transition-all duration-200"
          enter-from-class="opacity-0 scale-75"
          enter-to-class="opacity-100 scale-100"
          leave-active-class="transition-all duration-150"
          leave-from-class="opacity-100 scale-100"
          leave-to-class="opacity-0 scale-75"
        >
          <span v-if="annual" class="bg-green-100 text-green-700 text-xs font-bold px-3 py-1 rounded-full">20% OFF</span>
        </Transition>
      </div>

      <!-- Card -->
      <div class="max-w-md mx-auto">
        <div class="rounded-3xl overflow-hidden shadow-2xl shadow-gray-200">

          <!-- Header oscuro -->
          <div class="bg-gray-900 px-8 pt-8 pb-10 text-center relative">
            <!-- Badge naranja -->
            <span class="inline-flex items-center gap-1.5 bg-primary text-white text-xs font-bold px-4 py-1.5 rounded-full mb-6 shadow-lg shadow-primary/40">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"/></svg>
              7 DÍAS GRATIS
            </span>

            <h3 class="text-xl font-black text-white mb-1">Plan Profesional</h3>
            <p class="text-gray-400 text-sm mb-6">Hasta 3 usuarios · Todo incluido</p>

            <!-- Precio -->
            <div class="flex items-end justify-center gap-1 mb-1">
              <span class="text-2xl font-bold text-gray-400 mb-2">$</span>
              <span class="text-8xl font-black leading-none text-white">{{ price }}</span>
              <div class="mb-2 ml-1 text-left">
                <div v-if="oldPrice" class="text-gray-500 text-sm line-through">${{ oldPrice }}/mes</div>
                <div class="text-gray-400 text-sm">/mes</div>
              </div>
            </div>

            <p class="text-gray-400 text-sm">
              {{ annual ? 'Facturado $144/año' : 'Facturado mes a mes' }}
            </p>

            <Transition
              enter-active-class="transition-all duration-300"
              enter-from-class="opacity-0 scale-90"
              enter-to-class="opacity-100 scale-100"
              leave-active-class="transition-all duration-150"
              leave-from-class="opacity-100 scale-100"
              leave-to-class="opacity-0 scale-90"
            >
              <div v-if="annual" class="mt-3 inline-flex items-center gap-1.5 bg-primary/15 border border-primary/30 text-primary text-xs font-semibold px-3 py-1.5 rounded-full">
                <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                Ahorras $36 al año vs plan mensual
              </div>
            </Transition>
          </div>

          <!-- Cuerpo blanco -->
          <div class="bg-white px-8 py-8">
            <ul class="space-y-3 mb-8">
              <li v-for="item in included" :key="item" class="flex items-center gap-3 text-sm text-gray-700">
                <span class="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span class="text-primary text-[10px] font-black">✓</span>
                </span>
                {{ item }}
              </li>
            </ul>

            <a
              :href="`${CRM_URL}/login`"
              class="block text-center bg-primary hover:bg-primary-dark text-white font-bold py-4 rounded-2xl text-base transition-colors"
              style="box-shadow: 0 6px 20px rgba(246,144,8,0.30)"
            >
              Empezar prueba de 7 días gratis →
            </a>
            <p class="text-center text-xs text-gray-400 mt-4">
              Sin tarjeta de crédito · Cancela cuando quieras
            </p>
          </div>
        </div>
      </div>

    </div>
  </section>
</template>
