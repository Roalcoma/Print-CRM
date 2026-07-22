// CSV mínimo pero correcto (maneja comillas, comas y saltos de línea embebidos).
// ponytail: ~35 líneas evitan la dependencia csv-parse/csv-stringify.

export function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  const esc = (v: string | number | null) => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers, ...rows].map(r => r.map(esc).join(',')).join('\r\n');
}

// Devuelve filas como arrays de strings. Primera fila = cabeceras.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => c !== ''));
}

// Self-check: `node src/csv.ts`
if (import.meta.url === `file://${process.argv[1]}`) {
  const csv = toCsv(['a', 'b'], [['x,y', 'z"q'], ['plain', null]]);
  const back = parseCsv(csv);
  const assert = (c: boolean, m: string) => { if (!c) throw new Error('FALLO: ' + m); };
  assert(back[0].join('|') === 'a|b', 'cabeceras');
  assert(back[1][0] === 'x,y', 'coma embebida');
  assert(back[1][1] === 'z"q', 'comilla embebida');
  assert(back[2][1] === '', 'null -> vacío');
  console.log('csv.ts OK');
}
