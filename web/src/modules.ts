// Módulos que se pueden restringir por permiso (debe coincidir con el backend).
export const MODULES = [
  { key: 'contacts', label: 'Contactos' },
  { key: 'opportunities', label: 'Oportunidades' },
  { key: 'tasks', label: 'Tareas' },
] as const;

export type ModuleKey = (typeof MODULES)[number]['key'];
