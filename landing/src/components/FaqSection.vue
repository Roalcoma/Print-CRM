<script setup lang="ts">
import { ref } from 'vue';

const faqs = [
  {
    q: '¿Necesito conocimientos técnicos para usar Rocco CRM?',
    a: 'No. Rocco CRM está diseñado para dueños de negocio y equipos de ventas, no para técnicos. La configuración toma menos de 10 minutos y el equipo de soporte te acompaña en cada paso.',
  },
  {
    q: '¿Qué pasa cuando terminan los 7 días de prueba?',
    a: 'Al terminar el período de prueba, podrás activar tu suscripción de $15/mes para continuar. Si decides no continuar, tu cuenta se pausa y conservas tus datos por 30 días.',
  },
  {
    q: '¿Puedo conectar más de una cuenta de WhatsApp o Instagram?',
    a: 'Sí. Puedes conectar múltiples instancias de WhatsApp Business y varias cuentas de Instagram al mismo equipo. Todos los mensajes llegan al mismo inbox unificado con etiqueta del canal de origen.',
  },
  {
    q: '¿Mis datos y los de mis clientes están seguros?',
    a: 'Sí. Toda la comunicación va cifrada con TLS (HTTPS). Las contraseñas se almacenan con hash bcrypt. Cada organización tiene su propio espacio de datos completamente aislado. Realizamos backups diarios.',
  },
  {
    q: '¿Funciona para cualquier tipo de negocio?',
    a: 'Rocco CRM está pensado para cualquier negocio que use WhatsApp, Instagram o Facebook para vender: agencias, coaches, clínicas, salones de belleza, bienes raíces, seguros, comercios, y más.',
  },
  {
    q: '¿Puedo cancelar en cualquier momento?',
    a: 'Sí, sin penalización. Puedes cancelar tu suscripción desde el panel de configuración o escribiéndonos. El acceso se mantiene activo hasta el final del período pagado.',
  },
  {
    q: '¿Tienen soporte en español?',
    a: 'Por supuesto. Todo el soporte es en español, por WhatsApp, de lunes a viernes. Somos un equipo hispanohablante y entendemos cómo operan los negocios en nuestra región.',
  },
];

const openIndex = ref<number | null>(null);

function toggle(i: number) {
  openIndex.value = openIndex.value === i ? null : i;
}
</script>

<template>
  <section id="faq" class="py-24 bg-gray-50 scroll-mt-16">
    <div class="max-w-3xl mx-auto px-5">
      <div class="text-center mb-14">
        <p class="text-sm font-semibold text-primary uppercase tracking-widest mb-3">Preguntas frecuentes</p>
        <h2 class="text-3xl md:text-4xl font-black text-gray-900">¿Tienes dudas?</h2>
      </div>
      <div class="space-y-3">
        <div
          v-for="(faq, i) in faqs" :key="i"
          class="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm"
        >
          <button
            class="w-full flex items-center justify-between p-6 text-left font-semibold text-gray-900 hover:text-primary transition-colors"
            @click="toggle(i)"
          >
            {{ faq.q }}
            <span
              class="text-xl text-primary shrink-0 ml-4 transition-transform duration-300"
              :class="openIndex === i ? 'rotate-45' : ''"
            >+</span>
          </button>
          <Transition
            enter-active-class="transition-all duration-300 ease-out"
            enter-from-class="opacity-0 max-h-0"
            enter-to-class="opacity-100 max-h-96"
            leave-active-class="transition-all duration-200 ease-in"
            leave-from-class="opacity-100 max-h-96"
            leave-to-class="opacity-0 max-h-0"
          >
            <div v-if="openIndex === i" class="px-6 pb-5 text-gray-600 leading-relaxed text-sm overflow-hidden">
              {{ faq.a }}
            </div>
          </Transition>
        </div>
      </div>
    </div>
  </section>
</template>
