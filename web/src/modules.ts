// Módulos que se pueden restringir por permiso (debe coincidir con el backend).
export const MODULES = [
  {
    key: 'contacts',
    label: 'Contactos',
    description: 'Ver, crear y editar contactos, empresas y datos de clientes potenciales.',
  },
  {
    key: 'opportunities',
    label: 'Oportunidades',
    description: 'Acceder al pipeline de ventas, gestionar leads y mover oportunidades entre etapas.',
  },
  {
    key: 'tasks',
    label: 'Tareas',
    description: 'Crear, asignar y marcar como completadas las tareas del equipo.',
  },
] as const;

export type ModuleKey = (typeof MODULES)[number]['key'];
