<template>
  <section id="funcionalidades" class="py-24 bg-white scroll-mt-16">
    <div class="max-w-6xl mx-auto px-5">
      <div class="text-center mb-16">
        <p class="text-sm font-semibold text-primary uppercase tracking-widest mb-3">Todo en uno</p>
        <h2 class="text-3xl md:text-4xl font-black text-gray-900">Una plataforma, todo lo que necesitas</h2>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div
          v-for="feat in features" :key="feat.title"
          class="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm hover:-translate-y-1 hover:shadow-lg transition-all duration-200"
        >
          <div class="w-12 h-12 rounded-2xl flex items-center justify-center mb-5" :class="feat.iconBg">
            <span v-html="feat.icon" />
          </div>
          <h3 class="text-xl font-bold text-gray-900 mb-3">{{ feat.title }}</h3>
          <p class="text-gray-500 leading-relaxed mb-4">{{ feat.desc }}</p>
          <ul class="space-y-2 text-sm text-gray-600">
            <li v-for="item in feat.bullets" :key="item" class="flex items-center gap-2">
              <span class="text-green-500">✓</span> {{ item }}
            </li>
          </ul>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
const features = [
  {
    iconBg: 'bg-green-100',
    icon: `<svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>`,
    title: 'Inbox unificado',
    desc: 'WhatsApp, Instagram y Facebook en una sola bandeja de entrada. Nunca más cambiar entre apps.',
    bullets: ['Mensajes en tiempo real', 'Historial completo por contacto', 'Badge de canal diferenciado'],
  },
  {
    iconBg: 'bg-primary-light',
    icon: `<svg class="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>`,
    title: 'Automatizaciones',
    desc: 'Configura secuencias que trabajan por ti: confirmaciones de cita, recordatorios, seguimientos automáticos.',
    bullets: ['Mensajes programados por WhatsApp', 'Respuesta automática a comentarios IG', 'Notificaciones internas al equipo'],
  },
  {
    iconBg: 'bg-purple-100',
    icon: `<svg class="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>`,
    title: 'Calendario y citas',
    desc: 'Tu página de reservas pública lista en minutos. Tus clientes agendan solos y tú recibes la confirmación.',
    bullets: ['Página de reserva personalizada', 'Sincronización con Google Calendar', 'Recordatorio automático 2h antes'],
  },
  {
    iconBg: 'bg-orange-100',
    icon: `<svg class="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>`,
    title: 'Gestión de contactos',
    desc: 'Base de datos centralizada de prospectos y clientes con etiquetas, notas, historial y oportunidades.',
    bullets: ['Perfiles completos de contacto', 'Etiquetas y segmentación', 'Pipeline de ventas visual'],
  },
  {
    iconBg: 'bg-teal-100',
    icon: `<svg class="w-6 h-6 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/></svg>`,
    title: 'Tareas y seguimiento',
    desc: 'Asigna tareas a tu equipo, establece fechas de vencimiento y nunca más pierdas un seguimiento.',
    bullets: ['Asignación por usuario', 'Notificaciones de vencimiento', 'Historial de actividad'],
  },
  {
    iconBg: 'bg-pink-100',
    icon: `<svg class="w-6 h-6 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>`,
    title: 'Dashboard y métricas',
    desc: 'Ve de un vistazo cómo va tu negocio: conversaciones activas, citas del día, oportunidades abiertas.',
    bullets: ['Resumen diario del negocio', 'Métricas de conversación', 'Vista de equipo'],
  },
];
</script>
