// Calcula el offset actual de una timezone (respeta DST automáticamente)
export function tzCurrentOffset(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
    }).formatToParts(new Date());
    const raw = parts.find(p => p.type === 'timeZoneName')?.value ?? 'UTC';
    return raw.replace('GMT', 'UTC'); // "GMT-4" → "UTC-4"
  } catch {
    return 'UTC';
  }
}

const TZ_NAMES: Record<string, string> = {
  'America/Caracas':                'Caracas / Venezuela',
  'America/Bogota':                 'Bogotá / Colombia',
  'America/Lima':                   'Lima / Perú',
  'America/Mexico_City':            'Ciudad de México / México',
  'America/New_York':               'New York / EE.UU. Este',
  'America/Chicago':                'Chicago / EE.UU. Centro',
  'America/Denver':                 'Denver / EE.UU. Montaña',
  'America/Los_Angeles':            'Los Ángeles / EE.UU. Pacífico',
  'America/Phoenix':                'Phoenix / Arizona (sin DST)',
  'America/Santiago':               'Santiago / Chile',
  'America/Argentina/Buenos_Aires': 'Buenos Aires / Argentina',
  'America/Sao_Paulo':              'São Paulo / Brasil',
  'America/Halifax':                'Halifax / Atlántico',
  'America/Toronto':                'Toronto / Canadá Este',
  'America/Vancouver':              'Vancouver / Canadá Pacífico',
  'Europe/Madrid':                  'Madrid / España',
  'Europe/London':                  'Londres / Reino Unido',
  'Europe/Paris':                   'París / Francia',
  'Europe/Berlin':                  'Berlín / Alemania',
  'UTC':                            'UTC',
};

export const TZ_LIST = Object.keys(TZ_NAMES);

export function tzLabel(tz: string): string {
  const name = TZ_NAMES[tz] ?? tz;
  return `${name} (${tzCurrentOffset(tz)})`;
}

// Array {value, label} listo para usar en <select>
export const TIMEZONES = TZ_LIST.map(value => ({ value, label: tzLabel(value) }));
