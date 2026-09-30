// Tienda que vende por WhatsApp (ropa, cosmética, repuestos, comida por encargo…): el modelo
// de venta más común en Venezuela. Sin calendario: el embudo es consulta → pago → entrega, y
// las etiquetas avisan al cliente de cada cambio de estado.
import { type AccountTemplate, C, V, avisoEncargado } from './base.ts';

export const tiendaWhatsapp: AccountTemplate = {
  key: 'tienda_whatsapp',
  name: 'Tienda por WhatsApp',
  sector: 'Comercio / e-commerce',
  description: 'Catálogo al primer mensaje, pedido en pipeline de ventas, avisos de pago recibido, envío y entrega por etiqueta, y reactivación de compradores.',
  variables: [
    V.empresa, V.remitente,
    { key: 'enlace_catalogo', label: 'Enlace del catálogo', type: 'url', required: true, placeholder: 'https://wa.me/c/584141234567', help: 'Catálogo de WhatsApp Business, Instagram o tu web.' },
    { key: 'metodos_pago', label: 'Métodos de pago', required: true, placeholder: 'Pago móvil, Zelle, Binance o efectivo en divisas' },
    { key: 'entrega', label: 'Cómo entregan', required: true, placeholder: 'delivery en Caracas y envíos a todo el país por MRW o Zoom' },
    V.encargado,
  ],
  pipelines: [{
    key: 'pedidos',
    name: 'Pedidos',
    stages: [
      { name: 'Nueva consulta', color: C.amarillo },
      { name: 'Cotizado', color: C.naranja },
      { name: 'Esperando pago', color: C.rosa },
      { name: 'Pago confirmado', color: C.azul },
      { name: 'Preparando pedido', color: C.indigo },
      { name: 'Enviado', color: C.morado },
      { name: 'Entregado', color: C.verde },
      { name: 'Cancelado', color: C.gris },
    ],
  }],
  calendars: [],
  automations: [
    {
      name: 'WhatsApp: nuevo cliente → catálogo',
      description: 'Cuando alguien escribe por primera vez: abre la oportunidad, avisa al equipo y le envía el catálogo con los datos de pago y entrega.',
      trigger_type: 'whatsapp_new_message',
      steps: [
        { id: 'step_1', type: 'create_opportunity', label: 'Crear oportunidad', title: '{{contact.name}}', source: 'whatsapp', pipeline: 'pedidos', stage: 'Nueva consulta' },
        { id: 'step_2', type: 'send_notification', label: 'Notificación interna', notification_title: 'Nuevo cliente: {{contact.name}}', notification_body: '{{contact.name}} ({{contact.phone}}) escribió por WhatsApp. Ya recibió el catálogo: atiéndelo para cerrar la venta.' },
        ...avisoEncargado('🛍️ *Nuevo cliente escribiendo*\n\n👤 {{contact.name}}\n📱 {{contact.phone}}'),
        { id: 'step_3', type: 'send_whatsapp', label: 'Saludo + catálogo', message: '¡Hola {{contact.first_name}}! Bienvenido a {{empresa}} 🛍️\n\nAquí puedes ver todo lo que tenemos disponible 👉 {{enlace_catalogo}}\n\nCuando veas algo que te guste, envíame el nombre o la foto del producto y la cantidad, y te confirmo disponibilidad y total.\n\n💳 Aceptamos: {{metodos_pago}}\n🚚 Hacemos {{entrega}}' },
      ],
    },
    {
      name: 'Esperando pago → datos de pago',
      description: 'Añade la etiqueta "esperando-pago" cuando el cliente confirma su pedido y se le envían los métodos de pago.',
      trigger_type: 'tag_added', tag: 'esperando-pago',
      steps: [
        { id: 'step_1', type: 'send_whatsapp', label: 'Métodos de pago', message: '¡Excelente elección, {{contact.first_name}}! 🙌 Para apartar tu pedido puedes pagar por: {{metodos_pago}}.\n\nCuando lo hagas, envíame por aquí la captura del comprobante y lo confirmo enseguida.' },
      ],
    },
    {
      name: 'Pago confirmado → aviso al cliente',
      description: 'Añade la etiqueta "pago-confirmado" y el cliente recibe la confirmación de que su pedido está en preparación.',
      trigger_type: 'tag_added', tag: 'pago-confirmado',
      steps: [
        { id: 'step_1', type: 'send_whatsapp', label: 'Confirmación de pago', message: 'Recibimos tu pago ✅ ¡Gracias, {{contact.first_name}}!\n\nYa estamos preparando tu pedido. Te aviso por aquí apenas salga.\n\n{{remitente}} · {{empresa}}' },
      ],
    },
    {
      name: 'Enviado → aviso al cliente',
      description: 'Añade la etiqueta "enviado" cuando el pedido sale y el cliente recibe el aviso.',
      trigger_type: 'tag_added', tag: 'enviado',
      steps: [
        { id: 'step_1', type: 'send_whatsapp', label: 'Aviso de envío', message: '¡Tu pedido va en camino, {{contact.first_name}}! 🚚\n\nSi es envío nacional, en breve te paso el número de guía. Cualquier duda, escríbeme por aquí.' },
      ],
    },
    {
      name: 'Entregado → seguimiento',
      description: 'Añade la etiqueta "entregado" y al día siguiente se le pregunta al cliente cómo le fue con su compra.',
      trigger_type: 'tag_added', tag: 'entregado',
      steps: [
        { id: 'step_1', type: 'wait_minutes', label: 'Esperar 1 día', minutes: 1440 },
        { id: 'step_2', type: 'send_whatsapp', label: 'Seguimiento de la compra', message: 'Hola {{contact.first_name}} 😊 ¿Te llegó todo bien? ¿Qué te pareció?\n\nSi te gustó, nos ayudas muchísimo recomendándonos o enviándonos una foto con tu compra para nuestras historias 📸' },
      ],
    },
    {
      name: 'Reactivar comprador',
      description: 'Añade la etiqueta "reactivar" a clientes que ya compraron para avisarles de mercancía nueva.',
      trigger_type: 'tag_added', tag: 'reactivar',
      steps: [
        { id: 'step_1', type: 'send_whatsapp', label: 'Mensaje de reactivación', message: '¡Hola {{contact.first_name}}! Te escribe {{remitente}} de {{empresa}} 👋\n\nNos llegó mercancía nueva y me acordé de ti. Échale un ojo aquí 👉 {{enlace_catalogo}}\n\nSi algo te gusta, me avisas y te lo aparto.' },
      ],
    },
  ],
};
