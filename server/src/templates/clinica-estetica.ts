// Clínica estética / med spa: el nicho más vendido en snapshots de GoHighLevel y el que más
// vive de Instagram + WhatsApp en Latinoamérica. Evaluación gratuita, doble recordatorio
// (los no-show son el mayor dolor), reseñas y reactivación de pacientes.
import { type AccountTemplate, C, V, avisoEncargado, noAsistio } from './base.ts';

export const clinicaEstetica: AccountTemplate = {
  key: 'clinica_estetica',
  name: 'Clínica estética / Med spa',
  sector: 'Estética y bienestar',
  description: 'Lead por WhatsApp o Instagram, evaluación gratuita en el local, recordatorio 24 h y 2 h antes, pedido de reseña y reactivación de pacientes.',
  variables: [V.empresa, V.remitente, V.direccion, V.zona, V.encargado, V.resenas],
  pipelines: [{
    key: 'pacientes',
    name: 'Pacientes',
    stages: [
      { name: 'Nuevo lead', color: C.amarillo },
      { name: 'Evaluación agendada', color: C.azul },
      { name: 'Asistió a evaluación', color: C.indigo },
      { name: 'Presupuesto enviado', color: C.naranja },
      { name: 'En tratamiento', color: C.morado },
      { name: 'Paciente frecuente', color: C.verde },
      { name: 'No asistió', color: C.rosa },
      { name: 'Perdido', color: C.gris },
    ],
  }],
  calendars: [{
    name: 'Evaluación gratuita',
    slug: 'evaluacion-{{empresa}}',
    description: 'Evaluación sin costo de 30 minutos con nuestra especialista. Te decimos qué tratamiento te conviene y cuánto cuesta, sin compromiso.',
    custom_message: 'Te esperamos en {{direccion}}. Llega 10 minutos antes.',
    duration_minutes: 30,
    location_type: 'custom',
    location: '{{direccion}}',
    min_notice_hours: 3,
    availability: [[1, '09:00', '18:00'], [2, '09:00', '18:00'], [3, '09:00', '18:00'], [4, '09:00', '18:00'], [5, '09:00', '18:00'], [6, '09:00', '14:00']],
  }],
  automations: [
    {
      name: 'WhatsApp: nuevo lead → evaluación gratuita',
      description: 'Cuando alguien escribe por primera vez: abre la oportunidad, avisa al equipo, pregunta qué tratamiento le interesa y le envía el enlace para agendar la evaluación.',
      trigger_type: 'whatsapp_new_message',
      steps: [
        { id: 'step_1', type: 'create_opportunity', label: 'Crear oportunidad', title: '{{contact.name}}', source: 'whatsapp', pipeline: 'pacientes', stage: 'Nuevo lead' },
        { id: 'step_2', type: 'send_notification', label: 'Notificación interna', notification_title: 'Nuevo lead: {{contact.name}}', notification_body: '{{contact.name}} escribió por WhatsApp ({{contact.phone}}). El bot ya le está preguntando por el tratamiento.' },
        ...avisoEncargado('✨ *Nuevo lead en {{empresa}}*\n\n👤 {{contact.name}}\n📱 {{contact.phone}}'),
        { id: 'step_3', type: 'send_whatsapp', label: 'Saludo + pregunta de tratamiento', message: '¡Hola {{contact.first_name}}! 😊 Gracias por escribir a {{empresa}}, soy {{remitente}}.\n\nPara orientarte mejor, ¿qué te gustaría mejorar? Respóndeme con el número:\n\n1️⃣ Rostro (limpieza, manchas, arrugas)\n2️⃣ Cuerpo (reductores, celulitis, flacidez)\n3️⃣ Depilación láser\n4️⃣ Otro / aún no lo sé' },
        { id: 'step_4', type: 'wait_for_reply', label: 'Esperar respuesta' },
        { id: 'step_5', type: 'send_whatsapp', label: 'Enlace de evaluación', message: '¡Perfecto! 🙌 Lo ideal es que te veamos en persona: la *evaluación es gratis*, dura 30 minutos y sales sabiendo exactamente qué tratamiento te conviene y cuánto cuesta.\n\nElige el día y la hora aquí 👉 {{enlace_reserva}}\n\nSi prefieres que te llamemos, respóndeme "LLAMAR" y te contacto yo.' },
      ],
    },
    {
      name: 'Cita agendada → confirmación y recordatorios',
      description: 'Confirma la evaluación con la dirección, avisa al equipo y recuerda 24 h y 2 h antes para reducir inasistencias.',
      trigger_type: 'appointment_booked',
      steps: [
        { id: 'step_1', type: 'send_whatsapp', label: 'Confirmación', message: '¡Listo, {{contact.first_name}}! ✅ Tu evaluación en {{empresa}} quedó para el {{appointment.start_date}} a las {{appointment.start_time}}.\n\n📍 {{direccion}}\n\nSi necesitas cambiar la hora: {{appointment.reschedule_link}}' },
        { id: 'step_2', type: 'send_notification', label: 'Notificación interna', notification_title: 'Evaluación agendada: {{contact.name}}', notification_body: '{{contact.name}} ({{contact.phone}}) agendó para el {{appointment.start_date}} a las {{appointment.start_time}}.' },
        ...avisoEncargado('📅 *Evaluación agendada*\n\n👤 {{contact.name}}\n📱 {{contact.phone}}\n🗓️ {{appointment.start_date}} · {{appointment.start_time}}'),
        { id: 'step_3', type: 'wait_before_appointment', label: 'Esperar hasta 24 h antes', minutes_before: 1440 },
        { id: 'step_4', type: 'send_whatsapp', label: 'Recordatorio 24 h', message: 'Hola {{contact.first_name}} 👋 Te recuerdo que mañana a las {{appointment.start_time}} tienes tu evaluación en {{empresa}}.\n\n¿Nos confirmas que vienes? Responde *SÍ* y te guardamos el espacio. Si no puedes, cámbiala aquí: {{appointment.reschedule_link}}' },
        { id: 'step_5', type: 'wait_before_appointment', label: 'Esperar hasta 2 h antes', minutes_before: 120 },
        { id: 'step_6', type: 'send_whatsapp', label: 'Recordatorio 2 h', message: '¡Hoy nos vemos, {{contact.first_name}}! ✨ A las {{appointment.start_time}} en {{direccion}}. Llega unos 10 minutos antes para registrarte.\n\n{{remitente}}' },
      ],
    },
    noAsistio('Hola {{contact.first_name}}, hoy te esperábamos en {{empresa}} y no pudimos verte 😔 ¿Todo bien?\n\nTu evaluación sigue siendo gratis. Escoge otro horario cuando puedas: {{enlace_reserva}}'),
    {
      name: 'Pedir reseña',
      description: 'Añade la etiqueta "pedir-resena" después de un tratamiento y se le pide una reseña al día siguiente.',
      trigger_type: 'tag_added', tag: 'pedir-resena', requires: 'enlace_resenas',
      steps: [
        { id: 'step_1', type: 'wait_minutes', label: 'Esperar 1 día', minutes: 1440 },
        { id: 'step_2', type: 'send_whatsapp', label: 'Pedido de reseña', message: 'Hola {{contact.first_name}} 😊 ¿Cómo te has sentido después de tu sesión?\n\nSi te gustó la atención, nos ayudaría muchísimo que lo cuentes aquí (toma 1 minuto): {{enlace_resenas}}\n\n¡Gracias por confiar en {{empresa}}! 💛' },
      ],
    },
    {
      name: 'Reactivar paciente',
      description: 'Añade la etiqueta "reactivar" a pacientes que no vienen hace meses para invitarlos a volver.',
      trigger_type: 'tag_added', tag: 'reactivar',
      steps: [
        { id: 'step_1', type: 'send_whatsapp', label: 'Mensaje de reactivación', message: 'Hola {{contact.first_name}}, ¡tiempo sin verte por {{empresa}}! 🌸\n\nEste mes tenemos espacios para retomar tu tratamiento. Si quieres, agenda una evaluación de control (sin costo) aquí: {{enlace_reserva}}\n\n{{remitente}}' },
      ],
    },
    {
      name: 'Instagram: comentario → DM con evaluación',
      description: 'Responde a quien comenta pidiendo precio o información y le escribe al privado con el enlace de la evaluación. Se crea desactivada: conecta Instagram y actívala.',
      trigger_type: 'ig_comment_received',
      enabled: false,
      config: { intent_filter: true },
      steps: [
        {
          id: 'step_1', type: 'ig_reply_comment', label: 'Responder comentario',
          messages: [
            '¡Hola! 😊 Te escribimos al privado con los detalles 💌',
            '¡Claro que sí! Revisa tu DM, ahí te explicamos todo ✨',
            'Te acabamos de enviar la información por mensaje directo 📩',
            '¡Gracias por preguntar! Ya te escribimos al privado 🙌',
          ],
        },
        { id: 'step_2', type: 'wait_minutes', label: 'Esperar 1 minuto', minutes: 1 },
        { id: 'step_3', type: 'ig_send_dm', label: 'DM con enlace de evaluación', message: '¡Hola! Soy {{remitente}} de {{empresa}} 😊\n\nEl precio depende de tu tipo de piel y de lo que quieras lograr, por eso hacemos una *evaluación gratuita* de 30 minutos: te revisamos y te damos el presupuesto exacto, sin compromiso.\n\nAgenda aquí 👉 {{enlace_reserva}}?c={{contact.id}}\n\nSi prefieres, déjame tu número de WhatsApp y te escribo por ahí.' },
        { id: 'step_4', type: 'create_opportunity', label: 'Abrir lead', title: '{{contact.name}}', source: 'instagram-comentario', pipeline: 'pacientes', stage: 'Nuevo lead' },
      ],
    },
  ],
};
