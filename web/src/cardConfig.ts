// Configuración de qué campos se muestran en las tarjetas de oportunidad
// (estilo "Customize card" de GHL). Se persiste en localStorage (preferencia de UI).

export interface CardConfig {
  fields: string[]; // claves habilitadas, en orden (el título siempre se muestra)
  layout: 'default' | 'compact';
}

// Catálogo de campos disponibles para la tarjeta.
export const CARD_FIELD_META: { key: string; label: string }[] = [
  { key: 'owner', label: 'Responsable (avatar)' },
  { key: 'status', label: 'Estado' },
  { key: 'value', label: 'Valor' },
  { key: 'tags', label: 'Etiquetas' },
  { key: 'contact_name', label: 'Contacto' },
  { key: 'contact_email', label: 'Email' },
  { key: 'contact_phone', label: 'Teléfono' },
  { key: 'business_name', label: 'Empresa' },
  { key: 'source', label: 'Fuente' },
  { key: 'created_at', label: 'Fecha de creación' },
  { key: 'followers', label: 'Seguidores' },
];

export const DEFAULT_CARD_CONFIG: CardConfig = {
  fields: ['owner', 'status', 'value', 'tags', 'contact_name', 'contact_email', 'created_at'],
  layout: 'default',
};

// Normaliza la config guardada en la cuenta (o defaults si no hay).
export function normalizeCardConfig(raw: unknown): CardConfig {
  const c = (raw ?? {}) as Partial<CardConfig>;
  return {
    fields: Array.isArray(c.fields) ? c.fields : [...DEFAULT_CARD_CONFIG.fields],
    layout: c.layout === 'compact' ? 'compact' : 'default',
  };
}
