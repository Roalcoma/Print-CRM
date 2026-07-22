// Motor de filtros para oportunidades. Traduce condiciones del frontend a SQL
// parametrizado. Seguridad: campos y operadores vienen de whitelists fijas;
// los valores SIEMPRE van como placeholders ($n), nunca interpolados.

type FieldType = 'text' | 'number' | 'enum' | 'id' | 'date';

const FIELDS: Record<string, { sql: string; type: FieldType }> = {
  title:      { sql: 'o.title', type: 'text' },
  value:      { sql: 'o.value', type: 'number' },
  status:     { sql: 'o.status', type: 'enum' },
  stage:      { sql: 'o.stage_id', type: 'id' },
  contact:    { sql: "coalesce(c.first_name,'')||' '||coalesce(c.last_name,'')", type: 'text' },
  created_at: { sql: 'o.created_at', type: 'date' },
};

// Operadores válidos por tipo → generador de fragmento SQL.
// Cada generador recibe la expresión de columna y el nombre del placeholder ($n)
// y devuelve el fragmento. Los que no usan valor devuelven placeholder vacío.
const OPS: Record<FieldType, Record<string, (col: string, p: string) => string>> = {
  text: {
    contains:     (c, p) => `${c} ILIKE '%'||${p}||'%'`,
    not_contains: (c, p) => `${c} NOT ILIKE '%'||${p}||'%'`,
    is:           (c, p) => `${c} = ${p}`,
    is_not:       (c, p) => `${c} <> ${p}`,
    is_empty:     (c) => `(${c} IS NULL OR ${c} = '')`,
    is_not_empty: (c) => `(${c} IS NOT NULL AND ${c} <> '')`,
  },
  number: {
    eq:  (c, p) => `${c} = ${p}`,
    neq: (c, p) => `${c} <> ${p}`,
    gt:  (c, p) => `${c} > ${p}`,
    gte: (c, p) => `${c} >= ${p}`,
    lt:  (c, p) => `${c} < ${p}`,
    lte: (c, p) => `${c} <= ${p}`,
  },
  enum: { is: (c, p) => `${c} = ${p}`, is_not: (c, p) => `${c} <> ${p}` },
  id:   { is: (c, p) => `${c} = ${p}`, is_not: (c, p) => `${c} <> ${p}` },
  date: { after: (c, p) => `${c} > ${p}`, before: (c, p) => `${c} < ${p}` },
};

const NO_VALUE = new Set(['is_empty', 'is_not_empty']);

export interface Condition { field: string; op: string; value?: unknown; }

// Devuelve { sql, params } donde sql es el WHERE combinado (sin la palabra WHERE)
// o cadena vacía si no hay condiciones válidas. startIndex = siguiente $n libre.
export function buildFilters(
  conditions: Condition[],
  match: 'AND' | 'OR',
  startIndex: number,
): { sql: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  let idx = startIndex;

  for (const c of conditions) {
    const field = FIELDS[c.field];
    const gen = field && OPS[field.type][c.op];
    if (!field || !gen) continue; // condición inválida → ignorada, no rompe
    if (NO_VALUE.has(c.op)) {
      parts.push(gen(field.sql, ''));
    } else {
      parts.push(gen(field.sql, `$${idx}`));
      params.push(c.value);
      idx++;
    }
  }

  if (parts.length === 0) return { sql: '', params: [] };
  return { sql: `(${parts.join(` ${match} `)})`, params };
}

// Self-check: `node src/filters.ts`
if (import.meta.url === `file://${process.argv[1]}`) {
  const r = buildFilters(
    [{ field: 'title', op: 'contains', value: 'acme' }, { field: 'value', op: 'gt', value: 1000 }],
    'AND', 3,
  );
  const assert = (c: boolean, m: string) => { if (!c) throw new Error('FALLO: ' + m); };
  assert(r.sql === "(o.title ILIKE '%'||$3||'%' AND o.value > $4)", 'sql: ' + r.sql);
  assert(r.params.length === 2, 'params');
  const bad = buildFilters([{ field: 'evil; DROP', op: 'is', value: 1 }], 'AND', 1);
  assert(bad.sql === '', 'campo no whitelisted ignorado');
  console.log('filters.ts OK');
}
