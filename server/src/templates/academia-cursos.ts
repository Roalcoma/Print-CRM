// Academia / cursos (idiomas, oficios, preparación, programas online): venden por Instagram
// y WhatsApp con una llamada de orientación antes de inscribir. Muy común tanto en Venezuela
// como entre hispanos en EE. UU. (inglés, licencias, oficios).
import { type AccountTemplate, C, V, avisoEncargado, noAsistio } from './base.ts';

export const academiaCursos: AccountTemplate = {
  key: 'academia_cursos',
  name: 'Academia / Cursos',
  sector: 'Educación',
  description: 'Interesado por WhatsApp o Instagram, 2 preguntas de objetivo y fecha de inicio, llamada de orientación por Google Meet, seguimiento de pago e inscripción con bienvenida.',
  variables: [
    V.empresa, V.remitente,
    { key: 'programa', label: 'Programa principal', required: true, placeholder: 'Inglés conversacional en 6 meses' },
    V.zona, V.encargado,
  ],
  pipelines: [{
    key: 'inscripciones',
    name: 'Inscripciones',
    stages: [
      { name: 'Nuevo interesado', color: C.amarillo },
      { name: 'Info enviada', color: C.naranja },
      { name: 'Orientación agendada', color: C.azul },
      { name: 'Asistió a orientación', color: C.indigo },
      { name: 'Pendiente de pago', color: C.rosa },
      { name: 'Inscrito', color: C.verde },
      { name: 'No asistió', color: C.rojo },
      { name: 'No se inscribió', color: C.gris },
    ],
  }],
  calendars: [{
    name: 'Llamada de orientación',
    slug: 'orientacion-{{empresa}}',
    description: 'Videollamada de 20 minutos para conocer tu objetivo, explicarte cómo funciona {{programa}} y resolver tus dudas antes de inscribirte.',
    duration_minutes: 20,
    location_type: 'google_meet',
    availability: [[1, '10:00', '19:00'], [2, '10:00', '19:00'], [3, '10:00', '19:00'], [4, '10:00', '19:00'], [5, '10:00', '19:00'], [6, '09:00', '13:00']],
  }],
  automations: [
    {
      name: 'WhatsApp: interesado → orientación',
      description: 'Abre la oportunidad, avisa al equipo, pregunta objetivo y fecha de inicio y envía el enlace de la llamada de orientación.',
      trigger_type: 'whatsapp_new_message',
      steps: [
        { id: 'step_1', type: 'create_opportunity', label: 'Crear oportunidad', title: '{{contact.name}}', source: 'whatsapp', pipeline: 'inscripciones', stage: 'Nuevo interesado' },
        { id: 'step_2', type: 'send_notification', label: 'Notificación interna', notification_title: 'Nuevo interesado: {{contact.name}}', notification_body: '{{contact.name}} ({{contact.phone}}) preguntó por {{programa}}. El bot le está haciendo las preguntas de perfil.' },
        ...avisoEncargado('🎓 *Nuevo interesado*\n\n👤 {{contact.name}}\n📱 {{contact.phone}}'),
        { id: 'step_3', type: 'send_whatsapp', label: 'Saludo + objetivo', message: '¡Hola {{contact.first_name}}! Gracias por tu interés en {{programa}} de {{empresa}} 🎓 Soy {{remitente}}.\n\nCuéntame, ¿para qué lo quieres? Responde con el número:\n\n1️⃣ Trabajo o conseguir mejor empleo\n2️⃣ Estudios o un examen\n3️⃣ Viajar o mudarme\n4️⃣ Crecimiento personal' },
        { id: 'step_4', type: 'wait_for_reply', label: 'Esperar respuesta 1' },
        { id: 'step_5', type: 'send_whatsapp', label: 'Pregunta inicio', message: 'Buenísimo. ¿Cuándo te gustaría empezar?\n\n1️⃣ Este mes\n2️⃣ El próximo mes\n3️⃣ Todavía estoy averiguando' },
        { id: 'step_6', type: 'wait_for_reply', label: 'Esperar respuesta 2' },
        { id: 'step_7', type: 'send_whatsapp', label: 'Enlace de orientación', message: 'Gracias, {{contact.first_name}}. El siguiente paso es una llamada corta de orientación (20 min, gratis): te explico el método, horarios y precio, y vemos si es para ti.\n\nElige tu horario aquí 👉 {{enlace_reserva}}' },
      ],
    },
    {
      name: 'Orientación agendada → confirmación y recordatorios',
      description: 'Confirma la llamada con el enlace de Meet, avisa al equipo y recuerda 24 h y 1 h antes.',
      trigger_type: 'appointment_booked',
      steps: [
        { id: 'step_1', type: 'send_whatsapp', label: 'Confirmación', message: '¡Agendado, {{contact.first_name}}! ✅\n\n🗓️ {{appointment.start_date}} a las {{appointment.start_time}}\n💻 Enlace: {{appointment.meeting_url}}\n\nSi necesitas cambiarla: {{appointment.reschedule_link}}' },
        { id: 'step_2', type: 'send_notification', label: 'Notificación interna', notification_title: 'Orientación agendada: {{contact.name}}', notification_body: '{{contact.name}} ({{contact.phone}}) agendó orientación para el {{appointment.start_date}} a las {{appointment.start_time}}.' },
        ...avisoEncargado('🎓 *Orientación agendada*\n\n👤 {{contact.name}}\n📱 {{contact.phone}}\n{{appointment.start_date}} · {{appointment.start_time}}'),
        { id: 'step_3', type: 'wait_before_appointment', label: 'Esperar hasta 24 h antes', minutes_before: 1440 },
        { id: 'step_4', type: 'send_whatsapp', label: 'Recordatorio 24 h', message: 'Hola {{contact.first_name}}, mañana a las {{appointment.start_time}} tenemos tu llamada de orientación. Si te surge algo, muévela aquí: {{appointment.reschedule_link}}' },
        { id: 'step_5', type: 'wait_before_appointment', label: 'Esperar hasta 1 h antes', minutes_before: 60 },
        { id: 'step_6', type: 'send_whatsapp', label: 'Recordatorio 1 h', message: 'En una hora nos vemos 👋 Entra desde aquí: {{appointment.meeting_url}}\n\n{{remitente}}' },
      ],
    },
    noAsistio('Hola {{contact.first_name}}, hoy te esperé en la llamada de orientación y no pudimos conectarnos. ¿Quieres escoger otro horario? {{enlace_reserva}}'),
    {
      name: 'Inscrito → bienvenida',
      description: 'Añade la etiqueta "inscrito" cuando pague: recibe la bienvenida y el equipo una notificación.',
      trigger_type: 'tag_added', tag: 'inscrito',
      steps: [
        { id: 'step_1', type: 'send_whatsapp', label: 'Bienvenida', message: '¡Bienvenido a {{programa}}, {{contact.first_name}}! 🎉\n\nYa estás inscrito en {{empresa}}. En las próximas horas te escribo con tu horario, el acceso a la plataforma y el grupo de tu cohorte.\n\nCualquier duda, aquí estoy.\n{{remitente}}' },
        { id: 'step_2', type: 'send_notification', label: 'Notificación interna', notification_title: 'Nueva inscripción: {{contact.name}}', notification_body: '{{contact.name}} quedó inscrito en {{programa}}. Envíale accesos y horario.' },
      ],
    },
    {
      name: 'Instagram: comentario → DM con orientación',
      description: 'Responde a quien comenta pidiendo información y le escribe al privado con el enlace de orientación. Se crea desactivada: conecta Instagram y actívala.',
      trigger_type: 'ig_comment_received',
      enabled: false,
      config: { intent_filter: true },
      steps: [
        {
          id: 'step_1', type: 'ig_reply_comment', label: 'Responder comentario',
          messages: [
            '¡Te escribimos al privado con toda la info! 📩',
            '¡Hola! Revisa tu DM, ahí te explicamos cómo funciona 🎓',
            'Listo, ya te mandamos los detalles por mensaje directo ✨',
            '¡Gracias por tu interés! Te acabamos de escribir al privado 🙌',
          ],
        },
        { id: 'step_2', type: 'wait_minutes', label: 'Esperar 1 minuto', minutes: 1 },
        { id: 'step_3', type: 'ig_send_dm', label: 'DM con enlace de orientación', message: '¡Hola! Soy {{remitente}} de {{empresa}} 👋\n\nGracias por preguntar por {{programa}}. Antes de inscribirte hacemos una llamada corta de orientación (gratis, 20 min) para ver tu nivel y tu objetivo.\n\nAgenda aquí 👉 {{enlace_reserva}}?c={{contact.id}}\n\nSi prefieres WhatsApp, déjame tu número y te escribo por ahí.' },
        { id: 'step_4', type: 'create_opportunity', label: 'Abrir lead', title: '{{contact.name}}', source: 'instagram-comentario', pipeline: 'inscripciones', stage: 'Nuevo interesado' },
      ],
    },
  ],
};
