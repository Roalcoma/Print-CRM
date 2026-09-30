// Inmobiliaria / asesor inmobiliario: la clave es responder al instante y calificar
// (compra o alquiler, zona, presupuesto, plazo) antes de gastar tiempo en visitas.
// Dos pipelines: clientes que buscan inmueble y propietarios que quieren vender o alquilar.
import { type AccountTemplate, C, V, avisoEncargado, noAsistio, weekdays } from './base.ts';

export const inmobiliaria: AccountTemplate = {
  key: 'inmobiliaria',
  name: 'Inmobiliaria',
  sector: 'Bienes raíces',
  description: 'Respuesta inmediata por WhatsApp con 4 preguntas de calificación, llamada de asesoría agendada, captación de propietarios y reactivación de clientes antiguos.',
  variables: [
    V.empresa,
    { ...V.remitente, label: 'Asesor que firma los mensajes', placeholder: 'Luis Rodríguez' },
    { key: 'zona', label: 'Zona o ciudad donde trabajan', required: true, placeholder: 'Caracas (este) / Miami-Dade' },
    V.zona, V.encargado,
  ],
  pipelines: [
    {
      key: 'clientes',
      name: 'Compradores e inquilinos',
      stages: [
        { name: 'Nuevo contacto', color: C.amarillo },
        { name: 'Calificando', color: C.naranja },
        { name: 'Asesoría agendada', color: C.azul },
        { name: 'Visitando inmuebles', color: C.indigo },
        { name: 'Oferta / negociación', color: C.morado },
        { name: 'Trámites y documentos', color: C.turquesa },
        { name: 'Cerrado', color: C.verde },
        { name: 'Perdido', color: C.gris },
      ],
    },
    {
      key: 'propietarios',
      name: 'Captación de propietarios',
      stages: [
        { name: 'Propietario interesado', color: C.amarillo },
        { name: 'Avalúo agendado', color: C.azul },
        { name: 'Exclusiva firmada', color: C.morado },
        { name: 'Publicado', color: C.indigo },
        { name: 'Vendido / alquilado', color: C.verde },
        { name: 'Descartado', color: C.gris },
      ],
    },
  ],
  calendars: [{
    name: 'Asesoría inmobiliaria',
    slug: 'asesoria-{{empresa}}',
    description: 'Llamada de 20 minutos para entender qué buscas y enviarte opciones que de verdad encajen con tu presupuesto.',
    duration_minutes: 20,
    location_type: 'phone',
    min_notice_hours: 1,
    availability: [...weekdays('09:00', '18:00'), [6, '10:00', '14:00']],
  }],
  automations: [
    {
      name: 'WhatsApp: nuevo contacto → calificar y agendar',
      description: 'Abre la oportunidad, avisa al asesor y califica al cliente (operación, zona, presupuesto y plazo) antes de enviarle el enlace de la asesoría.',
      trigger_type: 'whatsapp_new_message',
      steps: [
        { id: 'step_1', type: 'create_opportunity', label: 'Crear oportunidad', title: '{{contact.name}}', source: 'whatsapp', pipeline: 'clientes', stage: 'Nuevo contacto' },
        { id: 'step_2', type: 'send_notification', label: 'Notificación interna', notification_title: 'Nuevo contacto: {{contact.name}}', notification_body: '{{contact.name}} ({{contact.phone}}) escribió por WhatsApp. El bot le está haciendo las preguntas de calificación: revisa sus respuestas en la conversación.' },
        ...avisoEncargado('🏠 *Nuevo contacto*\n\n👤 {{contact.name}}\n📱 {{contact.phone}}\n\nRespóndele rápido: los primeros 5 minutos valen oro.'),
        { id: 'step_3', type: 'send_whatsapp', label: 'Saludo + operación', message: 'Hola {{contact.first_name}}, gracias por escribir a {{empresa}} 🏡 Soy {{remitente}}.\n\nPara mostrarte solo opciones que te sirvan, te hago 4 preguntas rápidas. ¿Qué estás buscando?\n\n1️⃣ Comprar\n2️⃣ Alquilar\n3️⃣ Vender o alquilar mi inmueble' },
        { id: 'step_4', type: 'wait_for_reply', label: 'Esperar respuesta 1' },
        { id: 'step_5', type: 'send_whatsapp', label: 'Pregunta zona', message: 'Perfecto. ¿En qué zona o sector te interesa? (Trabajamos principalmente en {{zona}})' },
        { id: 'step_6', type: 'wait_for_reply', label: 'Esperar respuesta 2' },
        { id: 'step_7', type: 'send_whatsapp', label: 'Pregunta presupuesto', message: '¿Qué presupuesto aproximado manejas? Un rango está bien, por ejemplo "entre 60 y 80 mil" o "hasta 500 al mes".' },
        { id: 'step_8', type: 'wait_for_reply', label: 'Esperar respuesta 3' },
        { id: 'step_9', type: 'send_whatsapp', label: 'Pregunta plazo', message: 'Última: ¿para cuándo lo necesitas?\n\n1️⃣ Lo antes posible\n2️⃣ En 1 a 3 meses\n3️⃣ Solo estoy viendo opciones' },
        { id: 'step_10', type: 'wait_for_reply', label: 'Esperar respuesta 4' },
        { id: 'step_11', type: 'send_whatsapp', label: 'Enlace de asesoría', message: '¡Gracias, {{contact.first_name}}! Con esto ya puedo filtrar. Agenda una llamada corta conmigo y te preparo una selección a tu medida 👉 {{enlace_reserva}}\n\nSi prefieres, sigo por aquí y te voy enviando opciones.\n\n{{remitente}} · {{empresa}}' },
      ],
    },
    {
      name: 'Asesoría agendada → confirmación y recordatorio',
      description: 'Confirma la llamada, avisa al asesor y recuerda 1 hora antes.',
      trigger_type: 'appointment_booked',
      steps: [
        { id: 'step_1', type: 'send_whatsapp', label: 'Confirmación', message: 'Listo, {{contact.first_name}} ✅ Te llamo el {{appointment.start_date}} a las {{appointment.start_time}} a este mismo número.\n\nSi necesitas moverla: {{appointment.reschedule_link}}\n\n{{remitente}}' },
        { id: 'step_2', type: 'send_notification', label: 'Notificación interna', notification_title: 'Asesoría agendada: {{contact.name}}', notification_body: '{{contact.name}} ({{contact.phone}}) agendó llamada para el {{appointment.start_date}} a las {{appointment.start_time}}. Revisa sus respuestas de calificación antes de llamar.' },
        ...avisoEncargado('📞 *Asesoría agendada*\n\n👤 {{contact.name}}\n📱 {{contact.phone}}\n{{appointment.start_date}} · {{appointment.start_time}}'),
        { id: 'step_3', type: 'wait_before_appointment', label: 'Esperar hasta 1 h antes', minutes_before: 60 },
        { id: 'step_4', type: 'send_whatsapp', label: 'Recordatorio 1 h', message: 'Hola {{contact.first_name}}, en una hora ({{appointment.start_time}}) te llamo para la asesoría. ¡Hablamos! 📞' },
      ],
    },
    {
      name: 'Propietario → captación',
      description: 'Añade la etiqueta "propietario" a quien quiere vender o alquilar su inmueble: se abre en el pipeline de captación y se le piden los datos básicos.',
      trigger_type: 'tag_added', tag: 'propietario',
      steps: [
        { id: 'step_1', type: 'create_opportunity', label: 'Abrir captación', title: 'Inmueble de {{contact.name}}', source: 'propietario', pipeline: 'propietarios', stage: 'Propietario interesado' },
        { id: 'step_2', type: 'send_whatsapp', label: 'Pedir datos del inmueble', message: 'Hola {{contact.first_name}}, gracias por pensar en {{empresa}} para tu inmueble 🙌\n\nPara darte un precio de mercado realista, envíame por aquí:\n• Ubicación\n• Metros cuadrados, habitaciones y baños\n• 3 o 4 fotos\n\nCon eso te preparo una valoración sin costo.' },
      ],
    },
    noAsistio('Hola {{contact.first_name}}, intenté llamarte a la hora que agendamos y no pude comunicarme. ¿Te queda mejor otro momento? Escógelo aquí: {{enlace_reserva}}'),
    {
      name: 'Reactivar cliente',
      description: 'Añade la etiqueta "reactivar" a clientes que dejaron de responder para retomar la conversación con opciones nuevas.',
      trigger_type: 'tag_added', tag: 'reactivar',
      steps: [
        { id: 'step_1', type: 'send_whatsapp', label: 'Mensaje de reactivación', message: 'Hola {{contact.first_name}}, soy {{remitente}} de {{empresa}}. Hace un tiempo hablamos sobre tu búsqueda de inmueble.\n\nEntraron opciones nuevas en {{zona}}. ¿Sigues buscando? Si me dices que sí, te envío las que encajan con lo que me contaste.' },
      ],
    },
  ],
};
