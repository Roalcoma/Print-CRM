// ¿El comentario pide información? Filtro del flujo "comentario → DM" de Instagram.
// Prioriza no perder leads: lista amplia (español, inglés, jerga, faltas de ortografía),
// pero descarta felicitaciones y comentarios de solo emojis/menciones.

// Normaliza: minúsculas, sin acentos, sin menciones, letras repetidas colapsadas ("infooo" → "info").
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/@[\w.]+/g, ' ')
    .replace(/([a-z])\1{2,}/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

// Frases/palabras que por sí solas indican interés. Se buscan como palabra completa.
const INTEREST = [
  // información
  'info', 'infos', 'infor', 'informacion', 'informaciones', 'informes', 'informen', 'informame', 'informenme',
  'imformacion', 'infomacion', 'informasion', 'imfo', 'inf', 'infoo', 'mas info', 'mas informacion',
  'detalles', 'mas detalles', 'los detalles', 'datos', 'los datos', 'pasame los datos',
  // interés / deseo
  'me interesa', 'me intereza', 'me interesaria', 'interesado', 'interesada', 'interesados', 'interesadas',
  'intersado', 'interezado', 'tengo interes', 'estoy interesado', 'estoy interesada',
  'quiero', 'kiero', 'qiero', 'quisiera', 'queria', 'me gustaria', 'me gustaria saber', 'me encantaria',
  'yo quiero', 'yo tambien quiero', 'quiero saber', 'quiero mas', 'quiero entrar', 'quiero unirme',
  'quiero empezar', 'quiero aprender', 'quiero trabajar', 'quiero aplicar', 'quiero participar',
  'saber mas', 'conocer mas', 'aprender mas', 'cuentame mas', 'dime mas', 'digame mas',
  // pedir que le cuenten / expliquen / escriban
  'cuentame', 'cuentanos', 'cuenteme', 'cuentenme', 'cuentame todo', 'explicame', 'expliqueme', 'explicanme',
  'me explicas', 'me explican', 'me cuentas', 'me cuentan', 'me dices', 'me dicen', 'me informas', 'me informan',
  'enviame', 'envieme', 'envienme', 'mandame', 'mandeme', 'mandenme', 'me mandas', 'me mandan', 'me envias',
  'me envian', 'me pasas', 'me pasan', 'pasame', 'escribeme', 'escribame', 'escribanme', 'me escribes',
  'me escriben', 'hablame', 'hablenme', 'contactame', 'contacteme', 'contactenme', 'llamame', 'llamenme',
  'me llaman', 'me llamas', 'agregame', 'sigueme para', 'te escribo', 'les escribo',
  // canales
  'dm', 'md', 'mdd', 'inbox', 'privado', 'al privado', 'priv', 'al priv', 'por privado', 'por interno',
  'interno', 'whatsapp', 'whats', 'wsp', 'wasap', 'guasap', 'watsap', 'numero', 'mi numero', 'tu numero',
  'telefono', 'tlf', 'celular', 'correo', 'email', 'link', 'enlace', 'el link', 'pasa el link',
  // cómo / qué / cuánto
  'como hago', 'como hacer', 'como puedo', 'como funciona', 'como es', 'como seria', 'como aplico',
  'como aplicar', 'como me uno', 'como unirme', 'como empiezo', 'como empezar', 'como entro', 'como entrar',
  'como inicio', 'como iniciar', 'como me registro', 'como me inscribo', 'como trabajan', 'como se gana',
  'como gano', 'como participo', 'que hay que hacer', 'que tengo que hacer', 'que debo hacer',
  'que se necesita', 'que necesito', 'que se requiere', 'que requisitos', 'requisitos', 'requisito',
  'que hacen', 'a que se dedican', 'que es lo que hacen', 'de que se trata', 'de que trata', 'en que consiste',
  'que ofrecen', 'que es esto', 'que venden', 'cual es el trabajo', 'que tipo de trabajo',
  'cuanto', 'cuanto se gana', 'cuanto gano', 'cuanto pagan', 'cuanto cuesta', 'cuanto vale', 'cuanto es',
  'precio', 'precios', 'costo', 'costos', 'cuesta', 'valor', 'inversion', 'hay que invertir', 'hay que pagar',
  'es gratis', 'tiene costo', 'sueldo', 'salario', 'pago', 'pagan', 'comision', 'comisiones',
  'ingresos', 'generar ingresos', 'ganar dinero', 'se gana', 'donde', 'donde queda', 'donde estan',
  // trabajo / oportunidad
  'busco trabajo', 'necesito trabajo', 'necesito empleo', 'hay trabajo', 'hay vacantes', 'vacante', 'vacantes',
  'empleo', 'chamba', 'chambear', 'oportunidad', 'oportunidades', 'trabajar con ustedes', 'trabajar desde casa',
  'trabajo remoto', 'desde casa', 'puedo trabajar', 'puedo aplicar', 'puedo entrar', 'puedo participar',
  'aplicar', 'aplico', 'aplica', 'postular', 'postularme', 'postulo', 'me postulo',
  'unirme', 'me uno', 'me sumo', 'sumarme', 'me apunto', 'apuntame', 'anotame', 'me anoto', 'cuenten conmigo',
  'cuentan conmigo', 'inscribirme', 'inscribir', 'inscripcion', 'registrarme', 'registro',
  'licencia', 'sin licencia', 'sin experiencia', 'curso', 'cursos', 'capacitacion', 'entrenamiento', 'examen',
  'papeles', 'sin papeles', 'permiso de trabajo', 'ssn', 'social security', 'itin',
  'agenda', 'agendar', 'cita', 'reunion', 'llamada', 'zoom', 'entrevista',
  'por favor', 'porfa', 'porfavor', 'xfa', 'pls', 'plis', 'please',
  // inglés
  'information', 'interested', 'im interested', 'i am interested', 'more info', 'more information',
  'details', 'tell me more', 'how', 'how much', 'how do i', 'how can i', 'what do you do', 'what is this',
  'send me', 'send info', 'dm me', 'message me', 'text me', 'call me', 'contact me', 'join', 'i want',
  'i want in', 'apply', 'hiring', 'job', 'jobs', 'opportunity', 'license', 'salary', 'commission',
  'requirements', 'where', 'sign me up', 'count me in', 'me too', 'need a job',
];

// Respuestas cortas típicas a un "comenta YO/INFO si te interesa" (solo si el comentario es breve).
const SHORT_INTEREST = ['yo', 'yo tambien', 'yo quiero', 'aqui', 'aca', 'presente', 'me', 'si quiero', 'si me interesa', 'listo yo', 'yes', 'me please'];

// Emojis que suelen indicar "yo quiero" / "escríbeme".
const INTEREST_EMOJI = /[🙋✋☝📩📥📨💌🤚👋]/u;

// Elogios que contienen palabras de la lista pero NO piden información.
const PRAISE = [
  'buena informacion', 'excelente informacion', 'gran informacion', 'valiosa informacion', 'muy buena info',
  'gracias por la info', 'gracias por la informacion', 'que buena info', 'tremendo trabajo', 'buen trabajo',
  'excelente trabajo', 'gran trabajo', 'gran oportunidad', 'que oportunidad',
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const INTEREST_RE = new RegExp(`(?:^|[^a-z0-9])(?:${INTEREST.map(escape).join('|')})(?=$|[^a-z0-9])`);
const PRAISE_RE = new RegExp(`(?:${PRAISE.map(escape).join('|')})`);

export function wantsInfo(raw: string): boolean {
  if (!raw) return false;
  if (INTEREST_EMOJI.test(raw)) return true;
  const text = normalize(raw);
  const words = text.replace(/[^a-z0-9? ]/g, ' ').split(' ').filter(Boolean);
  if (!words.length) return false;                                  // solo emojis / menciones

  const withoutPraise = text.replace(PRAISE_RE, ' ');
  if (INTEREST_RE.test(withoutPraise)) return true;

  const plain = words.filter(w => w !== '?').join(' ');
  // Exactas ("me encanta" no es "me"), salvo "yo …" que casi siempre es "yo quiero/yo me apunto"
  if (words.length <= 4 && (SHORT_INTEREST.includes(plain) || plain.startsWith('yo '))) return true;

  // Una pregunta con al menos 2 palabras suele ser una consulta
  if (text.includes('?') && words.filter(w => w !== '?').length >= 2) return true;
  return false;
}
