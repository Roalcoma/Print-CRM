// Convierte el `error` que devuelve la API en un mensaje legible en español.
// Muchas rutas responden `{ error: parsed.error.issues }` (array de issues de zod): sin esto
// el usuario veía "[object Object]" o el JSON crudo de zod.

interface ZodIssue {
  code?: string;
  path?: (string | number)[];
  message?: string;
  validation?: string;
  type?: string;
  minimum?: number;
  maximum?: number;
  expected?: string;
  received?: string;
  options?: unknown[];
}

// Nombres de campo más habituales (snake y camel); el resto se muestra "humanizado".
const FIELDS: Record<string, string> = {
  email: 'Email', password: 'Contraseña', new_password: 'Nueva contraseña', current_password: 'Contraseña actual',
  name: 'Nombre', first_name: 'Nombre', firstName: 'Nombre', last_name: 'Apellido', lastName: 'Apellido',
  phone: 'Teléfono', title: 'Título', description: 'Descripción', notes: 'Notas', role: 'Rol',
  start_at: 'Inicio', end_at: 'Fin', startAt: 'Inicio', endAt: 'Fin', date: 'Fecha', time: 'Hora',
  due_date: 'Fecha límite', value: 'Valor', amount: 'Monto', slug: 'Enlace', url: 'URL',
  contact_id: 'Contacto', contactId: 'Contacto', stage_id: 'Etapa', pipeline_id: 'Pipeline',
  calendar_id: 'Calendario', assigned_to: 'Responsable', organizationName: 'Organización',
  body: 'Mensaje', text: 'Texto', timezone: 'Zona horaria', duration_minutes: 'Duración',
};

function fieldName(path: (string | number)[] | undefined): string {
  const key = [...(path ?? [])].reverse().find(p => typeof p === 'string') as string | undefined;
  if (!key) return '';
  return FIELDS[key] ?? key.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase());
}

function issueText(i: ZodIssue): string {
  switch (i.code) {
    case 'invalid_type':
      return i.received === 'undefined' || i.received === 'null' ? 'es obligatorio' : 'tiene un formato no válido';
    case 'too_small':
      if (i.type === 'string') return i.minimum === 1 ? 'es obligatorio' : `debe tener al menos ${i.minimum} caracteres`;
      if (i.type === 'array') return `debe tener al menos ${i.minimum} elemento${i.minimum === 1 ? '' : 's'}`;
      return `debe ser como mínimo ${i.minimum}`;
    case 'too_big':
      if (i.type === 'string') return `debe tener como máximo ${i.maximum} caracteres`;
      if (i.type === 'array') return `admite como máximo ${i.maximum} elementos`;
      return `debe ser como máximo ${i.maximum}`;
    case 'invalid_string':
      if (i.validation === 'email') return 'no es un email válido';
      if (i.validation === 'url') return 'no es una URL válida';
      if (i.validation === 'uuid') return 'no es un identificador válido';
      if (i.validation === 'datetime') return 'no es una fecha válida';
      return 'tiene un formato no válido';
    case 'invalid_enum_value':
      return 'tiene un valor no permitido';
    case 'invalid_date':
      return 'no es una fecha válida';
    case 'custom':
      return i.message ?? 'no es válido';
    default:
      return 'no es válido';
  }
}

const isIssue = (x: unknown): x is ZodIssue =>
  !!x && typeof x === 'object' && ('code' in x || 'path' in x) && 'message' in x;

// Mensaje legible a partir del `error` de la respuesta (string, array de issues u objeto).
export function apiErrorMessage(error: unknown, fallback = 'Algo salió mal'): string {
  if (typeof error === 'string' && error.trim()) return error;
  if (Array.isArray(error) && error.length && error.every(isIssue)) {
    const parts = error.slice(0, 3).map(i => {
      const f = fieldName(i.path);
      const t = issueText(i);
      // Mensaje propio del server (refine) que ya es frase completa: se usa tal cual
      if (i.code === 'custom') return f ? `${f}: ${t}` : t;
      return f ? `${f} ${t}` : t.replace(/^./, c => c.toUpperCase());
    });
    const more = error.length > 3 ? ` (y ${error.length - 3} más)` : '';
    return `Revisa los datos: ${parts.join('; ')}${more}.`;
  }
  if (error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }
  return fallback;
}
