// Consultorio odontológico (sirve igual para consultorio médico): primera consulta,
// recordatorios contra inasistencias y un segundo pipeline para los controles periódicos,
// que es donde un consultorio recupera más ingresos.
import { type AccountTemplate, C, V, avisoEncargado, noAsistio } from './base.ts';

export const consultorioOdontologico: AccountTemplate = {
  key: 'consultorio_odontologico',
  name: 'Consultorio odontológico / médico',
  sector: 'Salud',
  description: 'Pacientes nuevos por WhatsApp con motivo de consulta, primera cita con doble recordatorio, plan de tratamiento, controles cada 6 meses y reseñas.',
  variables: [
    V.empresa,
    { ...V.remitente, placeholder: 'Dra. Carla Méndez' },
    V.direccion, V.zona, V.encargado, V.resenas,
  ],
  pipelines: [
    {
      key: 'pacientes',
      name: 'Pacientes nuevos',
      stages: [
        { name: 'Nuevo contacto', color: C.amarillo },
        { name: 'Consulta agendada', color: C.azul },
        { name: 'Consulta realizada', color: C.indigo },
        { name: 'Plan de tratamiento enviado', color: C.naranja },
        { name: 'En tratamiento', color: C.morado },
        { name: 'Tratamiento terminado', color: C.verde },
        { name: 'No asistió', color: C.rosa },
        { name: 'No continuó', color: C.gris },
      ],
    },
    {
      key: 'controles',
      name: 'Controles y limpiezas',
      stages: [
        { name: 'Control pendiente', color: C.amarillo },
        { name: 'Recordatorio enviado', color: C.naranja },
        { name: 'Control agendado', color: C.azul },
        { name: 'Al día', color: C.verde },
      ],
    },
  ],
  calendars: [{
    name: 'Primera consulta',
    slug: 'consulta-{{empresa}}',
    description: 'Consulta de valoración de 45 minutos: revisión, diagnóstico y presupuesto de tu tratamiento.',
    custom_message: 'Te esperamos en {{direccion}}. Si tienes radiografías o exámenes previos, tráelos.',
    duration_minutes: 45,
    location_type: 'custom',
    location: '{{direccion}}',
    min_notice_hours: 2,
    availability: [[1, '08:00', '17:00'], [2, '08:00', '17:00'], [3, '08:00', '17:00'], [4, '08:00', '17:00'], [5, '08:00', '17:00'], [6, '08:00', '12:00']],
  }],
  automations: [
    {
      name: 'WhatsApp: paciente nuevo → primera consulta',
      description: 'Abre la oportunidad, avisa al equipo, pregunta el motivo de consulta y envía el enlace para agendar.',
      trigger_type: 'whatsapp_new_message',
      steps: [
        { id: 'step_1', type: 'create_opportunity', label: 'Crear oportunidad', title: '{{contact.name}}', source: 'whatsapp', pipeline: 'pacientes', stage: 'Nuevo contacto' },
        { id: 'step_2', type: 'send_notification', label: 'Notificación interna', notification_title: 'Paciente nuevo: {{contact.name}}', notification_body: '{{contact.name}} ({{contact.phone}}) escribió por WhatsApp. Revisa su motivo de consulta en la conversación.' },
        ...avisoEncargado('🦷 *Paciente nuevo*\n\n👤 {{contact.name}}\n📱 {{contact.phone}}'),
        { id: 'step_3', type: 'send_whatsapp', label: 'Saludo + motivo de consulta', message: 'Hola {{contact.first_name}}, gracias por comunicarte con {{empresa}} 😊\n\n¿Cuál es el motivo de tu consulta? Responde con el número:\n\n1️⃣ Dolor o urgencia\n2️⃣ Limpieza / chequeo\n3️⃣ Ortodoncia (brackets o alineadores)\n4️⃣ Estética dental (blanqueamiento, carillas)\n5️⃣ Otro' },
        { id: 'step_4', type: 'wait_for_reply', label: 'Esperar respuesta' },
        { id: 'step_5', type: 'send_whatsapp', label: 'Enlace para agendar', message: 'Gracias por contarnos. Puedes escoger el día y la hora de tu primera consulta aquí 👉 {{enlace_reserva}}\n\nSi tienes *dolor fuerte*, respóndenos "URGENTE" y te buscamos un espacio hoy mismo.\n\n{{remitente}}' },
      ],
    },
    {
      name: 'Cita agendada → confirmación y recordatorios',
      description: 'Confirma la cita con la dirección, avisa al equipo y recuerda 24 h y 2 h antes.',
      trigger_type: 'appointment_booked',
      steps: [
        { id: 'step_1', type: 'send_whatsapp', label: 'Confirmación', message: 'Hola {{contact.first_name}}, tu cita en {{empresa}} quedó confirmada ✅\n\n🗓️ {{appointment.start_date}}\n⏰ {{appointment.start_time}}\n📍 {{direccion}}\n\nPara cambiarla o cancelarla: {{appointment.reschedule_link}}' },
        { id: 'step_2', type: 'send_notification', label: 'Notificación interna', notification_title: 'Cita agendada: {{contact.name}}', notification_body: '{{contact.name}} ({{contact.phone}}) agendó para el {{appointment.start_date}} a las {{appointment.start_time}}.' },
        ...avisoEncargado('🗓️ *Cita agendada*\n\n👤 {{contact.name}}\n📱 {{contact.phone}}\n{{appointment.start_date}} · {{appointment.start_time}}'),
        { id: 'step_3', type: 'wait_before_appointment', label: 'Esperar hasta 24 h antes', minutes_before: 1440 },
        { id: 'step_4', type: 'send_whatsapp', label: 'Recordatorio 24 h', message: 'Hola {{contact.first_name}}, te recordamos tu cita de mañana a las {{appointment.start_time}} en {{empresa}}.\n\nResponde *SÍ* para confirmar. Si no puedes venir, avísanos o cámbiala aquí para darle el espacio a otro paciente: {{appointment.reschedule_link}}' },
        { id: 'step_5', type: 'wait_before_appointment', label: 'Esperar hasta 2 h antes', minutes_before: 120 },
        { id: 'step_6', type: 'send_whatsapp', label: 'Recordatorio 2 h', message: 'Te esperamos hoy a las {{appointment.start_time}} 🦷 📍 {{direccion}}\n\n{{remitente}}' },
      ],
    },
    noAsistio('Hola {{contact.first_name}}, hoy no pudimos atenderte en {{empresa}} porque no llegaste a tu cita. Esperamos que todo esté bien 🙏\n\nPuedes elegir un nuevo horario aquí: {{enlace_reserva}}'),
    {
      name: 'Control de 6 meses',
      description: 'Añade la etiqueta "control-6-meses" a un paciente al que le toca control o limpieza: se abre en el pipeline de controles y se le escribe para agendar.',
      trigger_type: 'tag_added', tag: 'control-6-meses',
      steps: [
        { id: 'step_1', type: 'create_opportunity', label: 'Abrir control', title: 'Control · {{contact.name}}', source: 'control-periodico', pipeline: 'controles', stage: 'Recordatorio enviado' },
        { id: 'step_2', type: 'send_whatsapp', label: 'Recordatorio de control', message: 'Hola {{contact.first_name}} 😊 Ya pasaron unos meses desde tu última visita a {{empresa}} y te toca tu control y limpieza.\n\nPrevenir sale mucho más barato que tratar. Agenda aquí cuando te quede cómodo: {{enlace_reserva}}' },
      ],
    },
    {
      name: 'Pedir reseña',
      description: 'Añade la etiqueta "pedir-resena" al terminar un tratamiento y se le pide una reseña al día siguiente.',
      trigger_type: 'tag_added', tag: 'pedir-resena', requires: 'enlace_resenas',
      steps: [
        { id: 'step_1', type: 'wait_minutes', label: 'Esperar 1 día', minutes: 1440 },
        { id: 'step_2', type: 'send_whatsapp', label: 'Pedido de reseña', message: 'Hola {{contact.first_name}}, ¿cómo sigues? 😊\n\nSi quedaste contento con la atención en {{empresa}}, tu opinión ayuda a otros pacientes a encontrarnos: {{enlace_resenas}}\n\n¡Gracias!\n{{remitente}}' },
      ],
    },
  ],
};
