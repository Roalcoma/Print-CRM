// Reclutamiento de agentes de seguros de vida: copia de la configuración real de
// Virtual Family Solutions (pipeline, bot de WhatsApp, confirmación de citas y respuesta a
// comentarios de Instagram), con los nombres propios convertidos en variables.
import { type AccountTemplate, C, V, avisoEncargado, noAsistio, weekdays } from './base.ts';

export const reclutamientoSeguros: AccountTemplate = {
  key: 'reclutamiento_seguros',
  name: 'Reclutamiento de agentes de seguros',
  sector: 'Seguros de vida / IUL',
  description: 'Basada en un embudo real de reclutamiento que ya funciona: lead por WhatsApp o Instagram, 4 preguntas de perfil, sesión informativa por Google Meet con recordatorio, y seguimiento hasta licenciarse.',
  variables: [
    V.empresa, V.remitente,
    { key: 'ciudad', label: 'Ciudad de la agencia', required: true, placeholder: 'Orlando, FL', help: 'Se menciona en los mensajes de Instagram.' },
    V.zona,
    V.encargado,
  ],
  pipelines: [{
    key: 'reclutamiento',
    name: 'Reclutamiento de agentes',
    stages: [
      { name: 'Nuevo Postulado', color: C.amarillo },
      { name: 'Sí Contestó', color: C.verde },
      { name: 'No respondió', color: C.rojo },
      { name: 'Cita Confirmada', color: C.azul },
      { name: 'Seguimiento', color: C.indigo },
      { name: 'Reagendar', color: C.rosa },
      { name: 'Formulario de Examen', color: C.morado },
      { name: 'Onboarding', color: C.gris },
      { name: 'Licenciado', color: C.verde },
      { name: 'Descartado', color: C.gris },
    ],
  }],
  calendars: [{
    name: 'Sesión informativa {{empresa}}',
    slug: 'reclutamiento-{{empresa}}',
    description: 'Sesión informativa gratuita de 30 minutos para conocer la oportunidad como agente de seguros de vida.',
    duration_minutes: 30,
    location_type: 'google_meet',
    availability: [...weekdays('14:00', '18:00').slice(0, 4), [5, '14:00', '17:00']],
  }],
  automations: [
    {
      name: 'Bot WhatsApp - Reclutamiento',
      description: 'Cuando un número nuevo escribe: detecta su estado (EE. UU.), abre la oportunidad, avisa al equipo, envía el calendario y hace 4 preguntas de perfil.',
      trigger_type: 'whatsapp_new_message',
      steps: [
        { id: 'step_1', type: 'detect_us_state', label: 'Detectar estado USA' },
        { id: 'step_2', type: 'create_opportunity', label: 'Crear oportunidad', title: '{{contact.name}}', source: '{{step.step_1.state}}', pipeline: 'reclutamiento', stage: 'Nuevo Postulado' },
        {
          id: 'step_3', type: 'send_notification', label: 'Notificación interna',
          notification_title: '🔥 ¡Nuevo Prospecto Captado! 🔥',
          notification_body: '🔥 ¡Nuevo Prospecto Captado! 🔥\n\nUn nuevo lead acaba de aterrizar en el embudo. Aquí tienes los datos para que inicies el contacto:\n\n👤 Nombre: {{contact.name}}\n📧 Email: {{contact.email}}\n📱 Teléfono: {{contact.phone}}\n📍 Origen: {{step.step_1.state}}',
        },
        ...avisoEncargado('🔥 *Nuevo prospecto captado*\n\n👤 {{contact.name}}\n📱 {{contact.phone}}\n📧 {{contact.email}}\n📍 Estado: {{step.step_1.state}}'),
        { id: 'step_4', type: 'send_whatsapp', label: 'Mensaje bienvenida + calendario', message: '¡Hola {{contact.first_name}}! 👋\n\nPuedes elegir el día y la hora que mejor te convengan para tu sesión directamente en nuestro calendario: 👉 {{enlace_reserva}}' },
        { id: 'step_5', type: 'send_whatsapp', label: 'Pregunta 1 - Licencia', message: '👋 ¡Hola! Queremos conocer un poco más sobre tu perfil. Para empezar:\n\n🪪 ¿Cuentas actualmente con licencia de Seguros de Vida? (Responde con el número de tu opción)\n1️⃣ Sí\n2️⃣ No' },
        { id: 'step_6', type: 'wait_for_reply', label: 'Esperar respuesta 1' },
        { id: 'step_7', type: 'send_whatsapp', label: 'Pregunta 2 - Ventas', message: '¡Perfecto! 🚀 Avanzando al siguiente punto:\n\n💰 ¿Tienes experiencia en el área de las ventas? (Envía el número correspondiente)\n1️⃣ Sí\n2️⃣ No' },
        { id: 'step_8', type: 'wait_for_reply', label: 'Esperar respuesta 2' },
        { id: 'step_9', type: 'send_whatsapp', label: 'Pregunta 3 - Emprendimiento', message: '⏱️ ¡Queremos conocerte mejor!\n\n¿Has emprendido o gestionado negocios anteriormente?\n\n(Envía el número de tu respuesta)\n\n1️⃣ Sí\n2️⃣ No' },
        { id: 'step_10', type: 'wait_for_reply', label: 'Esperar respuesta 3' },
        { id: 'step_11', type: 'send_whatsapp', label: 'Pregunta 4 - Disponibilidad', message: '¡Ya casi terminamos! ⏱️ Para adaptarnos a tu ritmo:\n\n📅 ¿Cuál es tu disponibilidad de tiempo?\n\n(Escribe el número de tu opción)\n1️⃣ Part time\n2️⃣ Full time' },
        { id: 'step_12', type: 'wait_for_reply', label: 'Esperar respuesta 4' },
        { id: 'step_13', type: 'send_whatsapp', label: 'Mensaje de cierre', message: '¡Todo listo! ✅\n\nMuchas gracias por tus respuestas. Con esta información podremos evaluar tu perfil correctamente. Nos pondremos en contacto contigo muy pronto con los siguientes pasos.\n\n¡Que tengas un excelente día! 🌟\n{{remitente}}' },
      ],
    },
    {
      name: 'Bot Notificaciones - Cita Agendada',
      description: 'Al reservar la sesión: confirma por WhatsApp con el enlace de la reunión, avisa al equipo y recuerda 2 horas antes.',
      trigger_type: 'appointment_booked',
      steps: [
        { id: 'step_1', type: 'send_whatsapp', label: 'Confirmación de cita', message: 'Hola {{contact.first_name}} 👋, te confirmamos desde el equipo de {{empresa}} 🚀 que tu cita quedó agendada para el {{appointment.start_date}} 📅 a las {{appointment.start_time}} ⏰.\n\nEl enlace para nuestra reunión es: {{appointment.meeting_url}} 💻\n\nSi necesitas reagendar, puedes hacerlo en cualquier momento tocando aquí: {{appointment.reschedule_link}} 🔄\n\n¡Nos vemos pronto! ✨' },
        {
          id: 'step_2', type: 'send_notification', label: 'Notificación interna al equipo',
          notification_title: '🚨 Nueva cita agendada: {{contact.name}}',
          notification_body: 'Tienes una nueva reserva en el calendario.\n\n👤 Nombre: {{contact.name}}\n📞 Teléfono: {{contact.phone}}\n✉️ Email: {{contact.email}}\n🗓️ Fecha: {{appointment.start_date}} a las {{appointment.start_time}}\n\nRevisa la ficha del contacto en el CRM para ver cualquier formulario previo que haya completado.',
        },
        ...avisoEncargado('🗓️ *Nueva cita agendada*\n\n👤 {{contact.name}}\n📞 {{contact.phone}}\n📅 {{appointment.start_date}} a las {{appointment.start_time}}\n\n🔗 {{appointment.meeting_url}}'),
        { id: 'step_3', type: 'wait_before_appointment', label: 'Esperar hasta 2 horas antes de la cita', minutes_before: 120 },
        { id: 'step_4', type: 'send_whatsapp', label: 'Recordatorio 2 horas antes', message: 'Hola {{contact.first_name}} 👋,\n\nBreve recordatorio de que hoy a las {{appointment.start_time}} ⏰ tenemos nuestra cita programada.\n\nÚnete a la reunión haciendo clic aquí: 💻 {{appointment.meeting_url}}\n\nTe recomendamos conectarte un par de minutos antes para verificar que el audio y video funcionen bien.\n\nSi no puedes asistir hoy, reprograma tu espacio aquí: {{appointment.reschedule_link}} 🔄\n\n¡Nos vemos en breve!\n{{remitente}}, equipo de {{empresa}}' },
      ],
    },
    {
      name: 'Instagram: comentario → respuesta + DM con calendario',
      description: 'Responde en público a quien comenta pidiendo información, le escribe al privado con el enlace de reserva y abre el lead. Se crea desactivada: conecta Instagram y actívala.',
      trigger_type: 'ig_comment_received',
      enabled: false,
      config: { intent_filter: true },
      steps: [
        {
          id: 'step_1', type: 'ig_reply_comment', label: 'Responder comentario con mensaje de confianza',
          messages: [
            '¡Eso es!! 🔥🙌 En {{empresa}} estamos armando un equipo increíble de personas que quieren generar ingresos reales ayudando a familias 💪✨ Si buscas libertad financiera y crecer profesionalmente… ¡este es tu momento! 🚀 ¡Ya te enviamos un mensaje al privado con todos los detalles! 📩👇',
            '¡Qué bueno que preguntaste! 😍🎉 Muchos de nuestros agentes empezaron desde cero y hoy trabajan a tiempo completo desde casa generando ingresos SIN TECHO 💰🏠 En {{empresa}} te damos todo el respaldo para lograrlo 💯 ¡Revisa tus mensajes directos, ya te escribimos! 📲🔥',
            '¡ESTO ES PARA TI! 👀🙌 En {{empresa}} no solo trabajas — construyes tu propio negocio con el respaldo de un equipo sólido en {{ciudad}} 🌴💼 Horario flexible, ingresos reales y una misión que importa ❤️🔥 ¡Dale un vistazo a tu DM que ya te mandamos la info! 📩✨',
            '¡Nos encanta tu energía! 🥳🔥 {{empresa}} está creciendo y hay espacio para personas como tú 💪🌟 Ayudar a familias a proteger su futuro mientras construyes el tuyo propio… ¡eso no tiene precio! 💛 ¡Ya te dejamos un mensajito en el privado, no lo dejes pasar! 👀📩',
            '¡Woow, qué alegría verte por aquí! 🎊💥 ¿Sabías que puedes generar ingresos reales ayudando a familias desde donde estés? 🌍💼 En {{empresa}} te entrenamos, te apoyamos y te acompañamos en cada paso del camino 🤝🔥 ¡Chequea tu privado que ya te escribimos! 📲😍',
            '¡Llevas toda la razón en informarte! 🧠✨ La industria de los seguros de vida es una de las más estables y rentables del mundo 💰📈 y en {{empresa}} te abrimos la puerta con todo el apoyo para comenzar 🚀❤️ ¡Ya te mandamos los detalles al DM, revísalo! 👇📩',
            '¡Esto puede cambiar tu vida! 🙌🌟 En {{empresa}} buscamos personas con ganas de crecer, aprender y construir algo propio 💪🏆 No necesitas experiencia previa — solo actitud y disposición 🔥 ¡Mira tu privado porque ya te escribimos con toda la información! 📩😊',
            '¡Qué momento tan perfecto para verlo! 👏🎯 {{empresa}} está expandiendo su equipo de agentes y hay un lugar reservado para personas con tu energía 💫🔥 Trabaja desde casa, a tu ritmo y con ingresos reales 🏠💰 ¡Ya te enviamos todo al privado, échale un ojito! 📲✨',
          ],
        },
        { id: 'step_2', type: 'wait_minutes', label: 'Esperar 1 minuto', minutes: 1 },
        { id: 'step_3', type: 'ig_send_dm', label: 'Enviar DM con calendario', message: '¡Hola! 👋😊 ¡Gracias por tu interés en {{empresa}}! 🌟🙌\n\nComo te mencionamos en el comentario, somos una agencia de seguros de vida en {{ciudad}} 🌴 en pleno crecimiento — y estamos buscando personas motivadas que quieran construir una carrera de verdad 🚀💼\n\n¿Qué te ofrecemos? 👇\n✅ Horario 100% flexible\n✅ Ingresos sin techo 💰\n✅ Respaldo completo para obtener tu licencia\n✅ Un equipo que te impulsa a crecer 💪\n✅ La satisfacción de ayudar a familias a proteger su futuro ❤️\n\nNos encantaría contarte todo en una sesión informativa GRATUITA 📅✨\n\n👉 Reserva tu espacio aquí:\n{{enlace_reserva}}?c={{contact.id}}\n\n📱 ¿No encuentras un horario que te funcione? Déjanos tu número de teléfono por aquí y te contactaremos lo más pronto posible.\n\n¡Te esperamos! 🥳🔥\n— Equipo {{empresa}} 💙' },
        { id: 'step_4', type: 'create_opportunity', label: 'Abrir lead en el pipeline', title: '{{contact.name}}', source: 'instagram-comentario', pipeline: 'reclutamiento', stage: 'Nuevo Postulado' },
      ],
    },
    noAsistio('Hola {{contact.first_name}} 👋, te estuvimos esperando en la sesión de hoy. Sabemos que a veces surgen imprevistos 🙏\n\nSi todavía te interesa conocer la oportunidad, elige otro horario aquí: {{enlace_reserva}}\n\n{{remitente}}, equipo de {{empresa}}'),
  ],
};
