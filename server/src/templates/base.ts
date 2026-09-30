// Tipos y piezas comunes de las plantillas de cuenta. Las plantillas son datos: la agencia las aplica a un
// cliente y se crean pipelines, calendarios y automatizaciones en su organización.
//
// Variables: los textos pueden llevar {{clave}} de una variable de la plantilla (se sustituye
// al aplicar) y además las variables de ejecución del motor ({{contact.*}}, {{appointment.*}},
// {{step.*}}), que se dejan intactas. {{enlace_reserva}} se calcula solo: es la página pública
// del primer calendario de la plantilla.

// Solo disparadores y pasos que existen en services/automation-engine.ts.
export type TriggerType = 'whatsapp_new_message' | 'appointment_booked' | 'tag_added' | 'ig_comment_received';
export type StepType =
  | 'detect_us_state' | 'create_opportunity' | 'send_notification' | 'send_whatsapp'
  | 'wait_minutes' | 'wait_for_reply' | 'wait_before_appointment' | 'ig_reply_comment' | 'ig_send_dm';

export interface TemplateVariable {
  key: string;
  label: string;
  type?: 'text' | 'phone' | 'timezone' | 'url';
  required?: boolean;
  placeholder?: string;
  help?: string;
  default?: string;
}

export interface TemplateStep {
  id: string;
  type: StepType;
  label: string;
  // Solo se incluye el paso si esta variable tiene valor (p. ej. aviso al teléfono del encargado).
  requires?: string;
  // create_opportunity: referencias a la plantilla; al aplicar se cambian por pipeline_id/stage_id.
  pipeline?: string;
  stage?: string;
  [field: string]: unknown;
}

export interface TemplateAutomation {
  name: string;
  description: string;
  trigger_type: TriggerType;
  tag?: string;                       // para tag_added
  enabled?: boolean;                  // por defecto true
  requires?: string;                  // se omite entera si la variable está vacía
  config?: Record<string, unknown>;   // extras del disparador (intent_filter…)
  steps: TemplateStep[];
}

export interface AccountTemplate {
  key: string;
  name: string;
  sector: string;
  description: string;
  variables: TemplateVariable[];
  pipelines: { key: string; name: string; stages: { name: string; color: string }[] }[];
  calendars: {
    name: string;
    slug: string;                     // puede llevar variables; se normaliza y se hace único
    description?: string;
    custom_message?: string;
    duration_minutes: number;
    location_type: 'custom' | 'google_meet' | 'zoom' | 'phone';
    location?: string;
    min_notice_hours?: number;
    // Días abiertos: [día (0=domingo), inicio, fin]. El resto queda cerrado.
    availability: [number, string, string][];
  }[];
  automations: TemplateAutomation[];
}

// Colores de etapa (los mismos tonos pastel del editor de pipelines).
export const C = {
  azul: '#dbeafe', amarillo: '#fef9c3', naranja: '#ffedd5', morado: '#f3e8ff', verde: '#dcfce7',
  rojo: '#fee2e2', indigo: '#e0e7ff', rosa: '#fce7f3', gris: '#e2e8f0', turquesa: '#ccfbf1',
};

// Variables comunes a casi todas las plantillas.
export const V = {
  empresa: { key: 'empresa', label: 'Nombre de la empresa', required: true, placeholder: 'Clínica Sonrisa' } as TemplateVariable,
  remitente: { key: 'remitente', label: 'Quién firma los mensajes', required: true, placeholder: 'Ana Pérez', help: 'Aparece en los mensajes de WhatsApp.' } as TemplateVariable,
  zona: { key: 'zona_horaria', label: 'Zona horaria del calendario', type: 'timezone', required: true, default: 'America/Caracas' } as TemplateVariable,
  encargado: {
    key: 'telefono_encargado', label: 'WhatsApp del encargado (opcional)', type: 'phone', placeholder: '584141234567',
    help: 'Con código de país. Recibe un aviso por cada lead o cita nueva. Si lo dejas vacío no se envía.',
  } as TemplateVariable,
  resenas: {
    key: 'enlace_resenas', label: 'Enlace para dejar reseña (opcional)', type: 'url', placeholder: 'https://g.page/r/…',
    help: 'Google Maps o Instagram. Sin él no se crea la automatización de reseñas.',
  } as TemplateVariable,
  direccion: { key: 'direccion', label: 'Dirección del local', required: true, placeholder: 'Av. Principal de Las Mercedes, Torre X, piso 3' } as TemplateVariable,
};

// Semana laboral típica: lunes a viernes con el mismo horario.
export function weekdays(start: string, end: string): [number, string, string][] {
  return [1, 2, 3, 4, 5].map(d => [d, start, end]);
}

// Aviso por WhatsApp al encargado (3 min después, como en VFS). Se omite si no hay teléfono.
export function avisoEncargado(message: string): TemplateStep[] {
  return [
    { id: 'aviso_espera', type: 'wait_minutes', label: 'Esperar 3 min antes de avisar al encargado', minutes: 3, requires: 'telefono_encargado' },
    { id: 'aviso_wa', type: 'send_whatsapp', label: 'Avisar al encargado por WhatsApp', to_phone: '{{telefono_encargado}}', message, requires: 'telefono_encargado' },
  ];
}

// Etiqueta "no-asistio": ofrece otro horario a quien faltó a la cita.
export function noAsistio(message: string): TemplateAutomation {
  return {
    name: 'No asistió → ofrecer otro horario',
    description: 'Añade la etiqueta "no-asistio" al contacto y se le envía un WhatsApp para reagendar.',
    trigger_type: 'tag_added', tag: 'no-asistio',
    steps: [{ id: 'step_1', type: 'send_whatsapp', label: 'Mensaje para reagendar', message }],
  };
}
