import type { TaskStatus } from './types';

// Estados tipo deck para el tablero de tareas. `color` = fondo pastel de la
// cabecera de columna (mismo estilo que las etapas de pipeline).
export const TASK_STATUSES: { key: TaskStatus; label: string; color: string; badge: string }[] = [
  { key: 'pending', label: 'Pendiente', color: '#e2e8f0', badge: 'bg-slate-100 text-slate-600' },
  { key: 'in_progress', label: 'En progreso', color: '#dbeafe', badge: 'bg-blue-50 text-blue-600' },
  { key: 'done', label: 'Finalizada', color: '#dcfce7', badge: 'bg-emerald-50 text-emerald-600' },
  { key: 'cancelled', label: 'Cancelada', color: '#fee2e2', badge: 'bg-red-50 text-red-600' },
];

export const statusLabel = (s: TaskStatus) => TASK_STATUSES.find(x => x.key === s)?.label ?? s;
export const statusBadge = (s: TaskStatus) => TASK_STATUSES.find(x => x.key === s)?.badge ?? 'bg-slate-100 text-slate-600';
