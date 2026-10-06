// Datos de demostración 100 % ficticios para capturas del README y demos locales.
// Crea (o recrea) dos cuentas: "Inmobiliaria Sol Caribe" y "Agencia Horizonte", más un admin de agencia.
// NUNCA correr contra producción: está pensado para la BD local del .env.
//
//   cd server && node --env-file=.env scripts/seed-demo.ts
//
// Accesos (BD local):
//   CRM     valentina@solcaribe.example / demo-rocco-2026
//   Agencia demo@arbolaureo.example     / demo-rocco-2026  (/agency/login)
import { pool } from '../src/db.ts';
import { hashPassword } from '../src/auth/password.ts';
import { applyTemplate, TEMPLATES } from '../src/templates/index.ts';

if (!/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL ?? '')) throw new Error('seed-demo solo se ejecuta contra una BD local (localhost)');

const PASSWORD = 'demo-rocco-2026';
const DEMO_DOMAINS = ['solcaribe.example', 'horizonte.example', 'arbolaureo.example'];
const ORGS = ['Inmobiliaria Sol Caribe', 'Agencia Horizonte', 'Clínica Bella Piel', 'Odontología Sonríe', 'Academia Impulso', 'Tienda La Ceiba'];

const q = <T = any>(sql: string, params: unknown[] = []) => pool.query(sql, params).then(r => r.rows as T[]);
const one = async <T = any>(sql: string, params: unknown[] = []) => (await q<T>(sql, params))[0];

// Fechas relativas a "ahora" en hora local de Caracas (UTC-4, sin horario de verano).
const TZ_OFFSET_H = 4;
function at(dayOffset: number, hh: number, mm = 0): Date {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + dayOffset, hh + TZ_OFFSET_H, mm));
  return d;
}
const minsAgo = (m: number) => new Date(Date.now() - m * 60_000);
// Lunes de la semana actual (offset en días respecto a hoy).
const dow = new Date().getUTCDay();
const monday = dow === 0 ? -6 : 1 - dow;

async function cleanup() {
  const orgs = await q<{ id: string }>(`SELECT id FROM organizations WHERE name = ANY($1)`, [ORGS]);
  const ids = orgs.map(o => o.id);
  if (ids.length) {
    await q(`DELETE FROM agency_clients WHERE organization_id = ANY($1)`, [ids]);
    for (const t of ['conv_messages', 'conversations', 'appointments', 'tasks', 'notifications', 'activity_feed', 'automation_runs', 'automation_media', 'opportunity_notes', 'opportunities', 'contacts', 'automation_rules', 'calendars', 'pipelines', 'account_template_applications', 'wa_settings']) {
      await q(`DELETE FROM ${t} WHERE organization_id = ANY($1)`, [ids]);
    }
    await q(`DELETE FROM users WHERE organization_id = ANY($1)`, [ids]);
    await q(`DELETE FROM organizations WHERE id = ANY($1)`, [ids]);
  }
  await q(`DELETE FROM agency_clients WHERE split_part(email,'@',2) = ANY($1)`, [DEMO_DOMAINS]);
  await q(`DELETE FROM users WHERE split_part(email,'@',2) = ANY($1)`, [DEMO_DOMAINS]);
  await q(`DELETE FROM agency_admins WHERE split_part(email,'@',2) = ANY($1)`, [DEMO_DOMAINS]);
}

async function createOrg(name: string, extra: Record<string, string>, users: { name: string; email: string; role: string; color: string }[]) {
  const org = await one<{ id: string }>(
    `INSERT INTO organizations (name, phone, business_email, city, country, industry, description, timezone, currency, website)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'America/Caracas','USD',$8) RETURNING id`,
    [name, extra.phone, extra.email, extra.city, extra.country, extra.industry, extra.description, extra.website]);
  const hash = await hashPassword(PASSWORD);
  const ids: string[] = [];
  for (const u of users) {
    const row = await one<{ id: string }>(
      `INSERT INTO users (organization_id, email, password_hash, name, role, avatar_color, permissions)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [org.id, u.email, hash, u.name, u.role, u.color, JSON.stringify(['contacts', 'opportunities', 'tasks', 'calendar', 'conversations'])]);
    await q(`INSERT INTO user_organizations (user_id, organization_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [row.id, org.id, u.role]);
    ids.push(row.id);
  }
  return { orgId: org.id, userIds: ids };
}

const tpl = (key: string) => TEMPLATES.find(t => t.key === key)!;

// ── Datos ficticios ─────────────────────────────────────────────────────────
const FIRST = ['María José', 'Carlos', 'Daniela', 'Luis Alberto', 'Gabriela', 'José Luis', 'Andreína', 'Ricardo', 'Mariana', 'Fernando',
  'Paola', 'Alejandro', 'Verónica', 'Héctor', 'Isabel', 'Jorge', 'Natalia', 'Rafael', 'Lucía', 'Eduardo',
  'Carolina', 'Manuel', 'Adriana', 'Gustavo', 'Sofía', 'Óscar', 'Patricia', 'Ramón', 'Elena', 'Javier',
  'Beatriz', 'Tomás', 'Claudia', 'Arturo', 'Rosa', 'Samuel', 'Inés', 'Martín', 'Fabiola', 'Hugo', 'Antonella', 'Iván'];
const LAST = ['Fernández', 'Mendoza', 'Rojas', 'Guzmán', 'Castillo', 'Herrera', 'Morales', 'Vargas', 'Suárez', 'Navarro',
  'Pineda', 'Romero', 'Acosta', 'Delgado', 'Méndez', 'Cabrera', 'Ruiz', 'Medina', 'Campos', 'Molina',
  'Aguilar', 'Contreras', 'Rangel', 'Silva', 'Torres', 'Peña', 'Blanco', 'Lozano', 'Ortiz', 'Salas',
  'Quintero', 'Briceño', 'León', 'Montilla', 'Paz', 'Uzcátegui', 'Villalobos', 'Zambrano', 'Carrasco', 'Ibarra', 'Marín', 'Ochoa'];
const phone = (i: number) => `58412555${String(1000 + i * 37).slice(-4)}`;

async function seedSolCaribe(adminId: string) {
  const { orgId, userIds } = await createOrg('Inmobiliaria Sol Caribe', {
    phone: '584125550100', email: 'hola@solcaribe.example', city: 'Lechería', country: 'Venezuela',
    industry: 'Bienes raíces', website: 'https://solcaribe.example',
    description: 'Compra, venta y alquiler de inmuebles en la costa oriental. Asesoría personalizada por WhatsApp.',
  }, [
    { name: 'Valentina Ríos', email: 'valentina@solcaribe.example', role: 'owner', color: '#F69008' },
    { name: 'Andrés Salazar', email: 'andres@solcaribe.example', role: 'admin', color: '#13243D' },
    { name: 'Camila Ortega', email: 'camila@solcaribe.example', role: 'member', color: '#0EA5E9' },
    { name: 'Diego Paredes', email: 'diego@solcaribe.example', role: 'member', color: '#10B981' },
  ]);
  const [valentina, andres, camila, diego] = userIds;
  const team = [valentina, andres, camila, diego];
  const teamNames = ['Valentina Ríos', 'Andrés Salazar', 'Camila Ortega', 'Diego Paredes'];

  const client = await one<{ id: string }>(
    `INSERT INTO agency_clients (organization_id, name, company, email, phone, country, plan, status, type, monthly_value, notes, created_at)
     VALUES ($1,'Valentina Ríos','Inmobiliaria Sol Caribe','valentina@solcaribe.example','584125550100','Venezuela','pro','active','client',30,'Cliente demo (datos ficticios).', now() - interval '64 days') RETURNING id`,
    [orgId]);
  await applyTemplate(orgId, tpl('inmobiliaria'), {
    empresa: 'Inmobiliaria Sol Caribe', remitente: 'Valentina Ríos', zona: 'Lechería y Puerto La Cruz',
    zona_horaria: 'America/Caracas', telefono_encargado: '',
  }, adminId);
  await q(`INSERT INTO agency_payments (client_id, amount_usd, status, method, period_start, period_end, paid_at)
           VALUES ($1, 30, 'paid', 'Zelle', current_date - 34, current_date - 4, now() - interval '33 days'),
                  ($1, 30, 'paid', 'Zelle', current_date - 4, current_date + 26, now() - interval '3 days')`, [client.id]).catch(() => {});

  const pipe = await one<{ id: string }>(`SELECT id FROM pipelines WHERE organization_id=$1 AND name='Compradores e inquilinos'`, [orgId]);
  const stages = await q<{ id: string; name: string }>(`SELECT id, name FROM pipeline_stages WHERE pipeline_id=$1 ORDER BY position`, [pipe.id]);
  const st = (n: string) => stages.find(s => s.name === n)!.id;
  const props = await one<{ id: string }>(`SELECT id FROM pipelines WHERE organization_id=$1 AND name='Captación de propietarios'`, [orgId]);
  const pstages = await q<{ id: string; name: string }>(`SELECT id, name FROM pipeline_stages WHERE pipeline_id=$1 ORDER BY position`, [props.id]);

  // Contactos + oportunidades
  const plan: [string, number, string, string[], number][] = [
    // [etapa, cantidad, fuentes cíclicas, etiquetas posibles, valor base]
    ['Nuevo contacto', 8, 'Anuncio,whatsapp,instagram,whatsapp', ['compra', 'alquiler', 'anuncio-ctwa'], 0],
    ['Calificando', 7, 'whatsapp,instagram,referido', ['compra', 'alquiler', 'primera-vivienda'], 0],
    ['Asesoría agendada', 6, 'Anuncio,whatsapp,facebook', ['compra', 'inversión'], 0],
    ['Visitando inmuebles', 6, 'whatsapp,referido,instagram', ['compra', 'alquiler', 'vip'], 0],
    ['Oferta / negociación', 5, 'referido,whatsapp,Anuncio', ['compra', 'inversión', 'vip'], 0],
    ['Trámites y documentos', 4, 'whatsapp,referido', ['compra', 'crédito'], 0],
    ['Cerrado', 4, 'referido,whatsapp,instagram', ['compra', 'alquiler'], 0],
    ['Perdido', 3, 'instagram,Anuncio,whatsapp', ['alquiler', 'compra'], 0],
  ];
  const kinds = [
    { t: 'Apartamento 3 hab. en Lechería', v: 125000 }, { t: 'Casa con piscina en El Morro', v: 210000 },
    { t: 'Alquiler apto. 2 hab. frente al mar', v: 850 }, { t: 'Townhouse en Puerto La Cruz', v: 98000 },
    { t: 'Local comercial en Av. Principal', v: 145000 }, { t: 'Penthouse con vista a la bahía', v: 265000 },
    { t: 'Alquiler estudio amoblado', v: 520 }, { t: 'Terreno 600 m² en Barcelona', v: 60000 },
    { t: 'Apartamento 2 hab. en Complejo Turístico', v: 78000 }, { t: 'Casa 4 hab. en urbanización cerrada', v: 175000 },
  ];
  let n = 0;
  const opps: { id: string; contactId: string; title: string; stage: string; name: string; first: string; phone: string }[] = [];
  for (const [stage, count, sources, tags] of plan) {
    const srcs = sources.split(',');
    for (let i = 0; i < count; i++, n++) {
      const first = FIRST[n % FIRST.length], last = LAST[(n * 5) % LAST.length];
      const source = srcs[i % srcs.length];
      const kind = kinds[(n * 3) % kinds.length];
      const value = Math.round(kind.v * (0.85 + ((n * 13) % 30) / 100) / (kind.v > 5000 ? 1000 : 10)) * (kind.v > 5000 ? 1000 : 10);
      const tg = [tags[i % tags.length], ...(i % 3 === 0 && tags.length > 1 ? [tags[(i + 1) % tags.length]] : [])];
      const adSource = source === 'Anuncio' ? {
        title: 'Apartamentos frente al mar desde $78.000', body: 'Escríbenos por WhatsApp y te enviamos fotos, planos y precios.',
        source_app: i % 2 ? 'instagram' : 'facebook', source_type: 'ad', source_url: null, source_id: '1200000000000' + n,
        media_url: null, thumbnail: null, ctwa_clid: null, greeting: '¡Hola! Quiero más información sobre los apartamentos.',
      } : null;
      const created = minsAgo(60 * (2 + n * 19));
      const c = await one<{ id: string }>(
        `INSERT INTO contacts (organization_id, first_name, last_name, email, phone, tags, source, city, country, ad_source, avatar_color, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Venezuela',$9,$10,$11,$11) RETURNING id`,
        [orgId, first, last, `${first.split(' ')[0].toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')}.${last.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')}@correo.example`,
         phone(n), tg, source === 'Anuncio' ? 'social' : source === 'referido' ? 'referral' : 'social', ['Lechería', 'Puerto La Cruz', 'Barcelona', 'Guanta'][n % 4],
         adSource ? JSON.stringify(adSource) : null, ['#F69008', '#0EA5E9', '#10B981', '#8B5CF6', '#EC4899', '#13243D'][n % 6], created]);
      const owner = team[n % team.length];
      const title = `${first} ${last}`;
      const o = await one<{ id: string }>(
        `INSERT INTO opportunities (organization_id, pipeline_id, stage_id, contact_id, title, value, status, position, source, business_name, tags, owner_id, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13) RETURNING id`,
        [orgId, pipe.id, st(stage), c.id, title, value, stage === 'Cerrado' ? 'won' : stage === 'Perdido' ? 'lost' : 'open', i, source.toLowerCase() === 'anuncio' ? 'Anuncio' : source,
         kind.t, tg, owner, created]);
      opps.push({ id: o.id, contactId: c.id, title, stage, name: title, first, phone: phone(n) });
      await q(`INSERT INTO activity_feed (organization_id, entity_type, entity_id, actor_id, actor_name, event_type, meta, created_at)
               VALUES ($1,'opportunity',$2,$3,$4,'opp_created',$5,$6)`,
        [orgId, o.id, owner, teamNames[n % 4], JSON.stringify({ title, value, stage_name: 'Nuevo contacto' }), created]);
      if (stage !== 'Nuevo contacto') {
        await q(`INSERT INTO activity_feed (organization_id, entity_type, entity_id, actor_id, actor_name, event_type, meta, created_at)
                 VALUES ($1,'opportunity',$2,$3,$4,'opp_stage_changed',$5,$6)`,
          [orgId, o.id, owner, teamNames[n % 4], JSON.stringify({ title, from: 'Nuevo contacto', to: stage }), new Date(created.getTime() + 3600_000 * 20)]);
      }
      if (i % 2 === 0) await q(`INSERT INTO opportunity_followers (opportunity_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [o.id, valentina]);
    }
  }
  // Un par de propietarios en captación
  const owners = [['Gloria', 'Carvajal', 'Apto. 3 hab. en Playa Lido', 135000, 0], ['Simón', 'Echeverría', 'Casa en Los Canales', 190000, 1], ['Mercedes', 'Arismendi', 'Local en C.C. Caribe', 88000, 2], ['Alonso', 'Figueroa', 'Townhouse en Nueva Barcelona', 112000, 3]] as const;
  for (const [f, l, t, v, s] of owners) {
    const c = await one<{ id: string }>(`INSERT INTO contacts (organization_id, first_name, last_name, phone, tags, source) VALUES ($1,$2,$3,$4,'{propietario}','referral') RETURNING id`, [orgId, f, l, phone(60 + s)]);
    await q(`INSERT INTO opportunities (organization_id, pipeline_id, stage_id, contact_id, title, value, source, business_name, tags, owner_id) VALUES ($1,$2,$3,$4,$5,$6,'referido',$7,'{propietario}',$8)`,
      [orgId, props.id, pstages[s].id, c.id, `Inmueble de ${f} ${l}`, v, t, andres]);
  }

  // Notas en la oportunidad destacada (la primera de "Oferta / negociación")
  const star = opps.find(o => o.stage === 'Oferta / negociación')!;
  await q(`UPDATE opportunities SET value = 182000, business_name = 'Casa con piscina en El Morro', tags = '{compra,vip,inversión}' WHERE id=$1`, [star.id]);
  for (const [body, author, h] of [
    ['Visitó la casa el sábado con su esposa. Les encantó la piscina y el patio; preguntan si el precio incluye el mobiliario de la terraza.', 'Valentina Ríos', 70],
    ['Contraoferta enviada: $182.000 con entrega en 45 días. El propietario acepta dejar el mobiliario exterior.', 'Andrés Salazar', 26],
    ['Tiene preaprobación bancaria. Pide revisar el documento de propiedad antes de firmar la opción de compra.', 'Valentina Ríos', 3],
  ] as const) {
    await q(`INSERT INTO opportunity_notes (organization_id, opportunity_id, body, author_name, created_at) VALUES ($1,$2,$3,$4,$5)`, [orgId, star.id, body, author, minsAgo(h * 60)]);
    await q(`INSERT INTO activity_feed (organization_id, entity_type, entity_id, actor_name, event_type, meta, created_at) VALUES ($1,'opportunity',$2,$3,'opp_note_added',$4,$5)`,
      [orgId, star.id, author, JSON.stringify({ title: star.title, body_preview: body.slice(0, 100) }), minsAgo(h * 60)]);
  }

  // Conversaciones
  type Msg = [dir: 'in' | 'out', body: string, minsAgo: number, extra?: Record<string, unknown>];
  const convs: { opp: number; channel: 'whatsapp' | 'instagram_dm' | 'facebook_dm'; unread: number; starred?: boolean; msgs: Msg[] }[] = [
    { opp: 0, channel: 'whatsapp', unread: 2, msgs: [
      ['in', '¡Hola! Quiero más información sobre los apartamentos.', 42, { ad: true }],
      ['out', 'Hola {n}, gracias por escribir a Inmobiliaria Sol Caribe 🏡 Soy Valentina Ríos.\n\nPara mostrarte solo opciones que te sirvan, te hago 4 preguntas rápidas. ¿Qué estás buscando?\n\n1️⃣ Comprar\n2️⃣ Alquilar\n3️⃣ Vender o alquilar mi inmueble', 41],
      ['in', '1, comprar', 38],
      ['out', 'Perfecto. ¿En qué zona o sector te interesa? (Trabajamos principalmente en Lechería y Puerto La Cruz)', 38],
      ['in', 'Lechería, cerca de la playa si es posible', 31],
      ['out', '¿Qué presupuesto aproximado manejas? Un rango está bien, por ejemplo "entre 60 y 80 mil" o "hasta 500 al mes".', 31],
      ['in', 'Entre 90 y 120 mil', 6],
      ['in', '¿Tienen algo con 3 habitaciones? 🙏', 5],
    ] },
    { opp: 8, channel: 'instagram_dm', unread: 1, msgs: [
      ['in', 'Hola, vi el reel del penthouse 😍 ¿sigue disponible?', 180],
      ['out', '¡Hola {n}! Sí, sigue disponible. Tiene 3 habitaciones, terraza de 40 m² y vista a la bahía. ¿Te paso el video completo por WhatsApp?', 170],
      ['in', 'Sí porfa, y el precio también', 25],
    ] },
    { opp: 15, channel: 'whatsapp', unread: 0, starred: true, msgs: [
      ['out', 'Buenos días, {n}. Te confirmo la asesoría de mañana a las 10:00 am 📞', 600],
      ['in', 'Perfecto, ahí estaré. ¿Debo preparar algún documento?', 590],
      ['out', 'Solo ten a mano tu rango de presupuesto y si vas a usar crédito bancario. Con eso te armo una selección a tu medida.', 585],
      ['in', 'Listo, gracias Valentina 👍', 120],
    ] },
    { opp: 22, channel: 'facebook_dm', unread: 0, msgs: [
      ['in', 'Buenas tardes, ¿el local de la Av. Principal se puede alquilar o solo venta?', 1500],
      ['out', 'Buenas tardes, {n}. Por ahora solo venta, pero el propietario evalúa opciones de financiamiento. ¿Te interesa agendar una visita?', 1440],
      ['in', 'Sí, el jueves en la tarde me queda bien', 300],
    ] },
    { opp: 26, channel: 'whatsapp', unread: 0, msgs: [
      ['out', '¡Hola {n}! Te dejo el recorrido en video del apartamento que vimos en planos 🎥', 2900, { video: true }],
      ['in', 'Qué bello quedó 😍 ¿la cocina es empotrada?', 2850],
      ['out', 'Sí, cocina empotrada con tope de granito y área de lavandero independiente.', 2840],
      ['in', 'Nos gustó mucho. ¿Podemos ofertar 175 mil?', 1300],
    ] },
    { opp: 3, channel: 'instagram_dm', unread: 3, msgs: [
      ['in', 'info', 15],
      ['out', '¡Hola {n}! Gracias por comentar en nuestra publicación 🙌 Te escribo por aquí para enviarte la información de los apartamentos.', 14],
      ['in', '¿Aceptan financiamiento?', 9],
      ['in', '¿Y cuánto es la inicial?', 9],
      ['in', 'Gracias!', 8],
    ] },
    { opp: 30, channel: 'whatsapp', unread: 0, msgs: [
      ['out', 'Hola {n}, ya tenemos lista la carpeta de documentos para la notaría ✅', 4400],
      ['in', 'Excelente. ¿Qué día firmamos?', 4300],
      ['out', 'El notario nos da cita el lunes 9:00 am. Te envío la dirección.', 4200],
    ] },
    { opp: 11, channel: 'whatsapp', unread: 1, msgs: [
      ['in', 'Buenas, me pasó tu número mi primo Eduardo. Busco alquiler de 2 habitaciones', 95],
      ['out', '¡Hola {n}! Encantada. ¿Para cuándo lo necesitas y qué presupuesto mensual manejas?', 90],
      ['in', 'Para noviembre, hasta 700 al mes', 50],
    ] },
    { opp: 19, channel: 'facebook_dm', unread: 0, msgs: [
      ['in', '¿Tienen terrenos en Barcelona?', 7000],
      ['out', 'Sí, tenemos un terreno de 600 m² con todos los servicios. Te comparto la ficha técnica.', 6900],
    ] },
  ];
  const media = await one<{ id: string }>(
    `INSERT INTO automation_media (organization_id, token, file_name, mime, size, path, created_by)
     VALUES ($1, md5(random()::text), 'recorrido-penthouse-bahia.mp4', 'video/mp4', 8734120, 'demo-no-existe.mp4', $2) RETURNING id`, [orgId, valentina]);
  for (const cv of convs) {
    const o = opps[cv.opp];
    const digits = o.phone.replace(/\D/g, '');
    const chatId = cv.channel === 'whatsapp' ? `${digits}@s.whatsapp.net` : `${cv.channel === 'instagram_dm' ? 'ig' : 'fb'}:demo${digits}`;
    const last = cv.msgs[cv.msgs.length - 1];
    const conv = await one<{ id: string }>(
      `INSERT INTO conversations (organization_id, contact_id, wa_chat_id, display_name, phone, last_message_at, last_message_preview, unread_count, starred, channel)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [orgId, o.contactId, chatId, o.name, cv.channel === 'whatsapp' ? o.phone : null, minsAgo(last[2]), last[1].slice(0, 100), cv.unread, !!cv.starred, cv.channel]);
    for (const [dir, body, m, extra] of cv.msgs) {
      const ad = extra?.ad ? (await one<{ ad_source: unknown }>(`SELECT ad_source FROM contacts WHERE id=$1`, [o.contactId])).ad_source : null;
      await q(`INSERT INTO conv_messages (conversation_id, organization_id, direction, msg_type, body, media_mime, media_filename, status, sender_name, ad_ref, created_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [conv.id, orgId, dir === 'in' ? 'inbound' : 'outbound', extra?.video ? 'video' : 'text', body.replaceAll('{n}', o.first), extra?.video ? 'video/mp4' : null,
         extra?.video ? 'recorrido-apartamento.mp4' : null, dir === 'in' ? 'delivered' : 'read', dir === 'in' ? o.name : 'Valentina Ríos',
         ad ? JSON.stringify(ad) : null, minsAgo(m)]);
    }
  }

  // Automatización propia: anuncio click-to-WhatsApp → video → esperar → seguimiento
  const nuevo = st('Nuevo contacto');
  await q(`INSERT INTO automation_rules (organization_id, trigger_type, name, description, enabled, run_count, last_run_at, config)
           VALUES ($1,'whatsapp_new_message',$2,$3,true,47,now() - interval '25 minutes',$4)`,
    [orgId, 'Anuncio "Frente al mar" → video del proyecto', 'Para quien llega desde el anuncio de Instagram/Facebook: crea la oportunidad, envía el recorrido en video y hace seguimiento si no responde.',
     JSON.stringify({
       trigger: { type: 'whatsapp_new_message' },
       steps: [
         { id: 'step_1', type: 'create_opportunity', label: 'Crear oportunidad', title: '{{contact.name}}', source: 'Anuncio', pipeline_id: pipe.id, stage_id: nuevo },
         { id: 'step_2', type: 'send_whatsapp', label: 'Enviar recorrido en video', message: '¡Hola {{contact.first_name}}! 🌊 Te dejo el recorrido del penthouse frente a la bahía. ¿Quieres que te envíe precios y planos?', media_id: media.id, media_type: 'video' },
         { id: 'step_3', type: 'wait_for_reply', label: 'Esperar respuesta', timeout_minutes: 1440 },
         { id: 'step_4', type: 'send_notification', label: 'Avisar al asesor', notification_title: '{{contact.name}} respondió al video', notification_body: 'Escríbele ahora: está caliente 🔥' },
         { id: 'step_5', type: 'wait_minutes', label: 'Esperar 2 horas', minutes: 120 },
         { id: 'step_6', type: 'send_whatsapp', label: 'Seguimiento', message: '{{contact.first_name}}, ¿te gustaría agendar una visita esta semana? Tengo horarios el jueves y el sábado 🗓️' },
       ],
     })]);
  await q(`UPDATE automation_rules SET run_count = 30 + (random()*90)::int, last_run_at = now() - (random()*3 || ' hours')::interval WHERE organization_id=$1 AND run_count = 0`, [orgId]);

  // Citas: esta semana y la próxima
  const cal = await one<{ id: string; slug: string }>(`SELECT id, slug FROM calendars WHERE organization_id=$1 LIMIT 1`, [orgId]);
  await q(`UPDATE calendars SET color = '#F69008', custom_message = '¡Gracias por agendar! Te llamaremos puntualmente al número que dejaste.' WHERE id=$1`, [cal.id]);
  const appts: [number, number, number, number, string, number, string?][] = [
    // [día desde lunes, hora, min, duración, tipo, opp idx, estado]
    [0, 9, 0, 20, 'Asesoría', 16], [0, 11, 30, 60, 'Visita', 21], [0, 15, 0, 20, 'Asesoría', 17],
    [1, 10, 0, 20, 'Asesoría', 15], [1, 14, 0, 90, 'Visita', 22], [1, 16, 30, 20, 'Asesoría', 18],
    [2, 9, 30, 60, 'Visita', 23], [2, 12, 0, 20, 'Asesoría', 19], [2, 15, 30, 45, 'Firma de opción', 26],
    [3, 10, 0, 90, 'Visita', 24], [3, 14, 30, 20, 'Asesoría', 20], [3, 17, 0, 30, 'Llamada', 27],
    [4, 9, 0, 60, 'Notaría', 30], [4, 11, 0, 20, 'Asesoría', 12], [4, 15, 0, 60, 'Visita', 25],
    [5, 10, 0, 120, 'Open house', 28],
    [7, 9, 30, 20, 'Asesoría', 13], [7, 15, 0, 60, 'Visita', 21], [8, 10, 0, 20, 'Asesoría', 14],
    [8, 16, 0, 60, 'Visita', 22], [9, 11, 0, 45, 'Firma de opción', 27], [10, 9, 0, 20, 'Asesoría', 6], [11, 14, 0, 60, 'Visita', 7],
  ];
  for (const [d, h, m, dur, kind, oi] of appts) {
    const o = opps[oi];
    const start = at(monday + d, h, m);
    const end = new Date(start.getTime() + dur * 60_000);
    const userId = kind === 'Asesoría' ? valentina : team[(oi % 3) + 1];
    await q(`INSERT INTO appointments (organization_id, user_id, contact_id, opportunity_id, title, start_at, end_at, timezone, status, location, calendar_id, provider)
             VALUES ($1,$2,$3,$4,$5,$6,$7,'America/Caracas','scheduled',$8,$9,'local')`,
      [orgId, userId, o.contactId, o.id, `${kind} · ${o.name}`, start, end,
       kind === 'Asesoría' || kind === 'Llamada' ? 'Llamada telefónica' : kind === 'Notaría' ? 'Notaría Pública Primera' : 'Lechería, Av. Principal',
       kind === 'Asesoría' ? cal.id : null]).catch(async e => {
        // provider puede tener CHECK: reintenta sin él
        if (e.code !== '23514') throw e;
        await q(`INSERT INTO appointments (organization_id, user_id, contact_id, opportunity_id, title, start_at, end_at, timezone, status, location, calendar_id)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,'America/Caracas','scheduled',$8,$9)`,
          [orgId, userId, o.contactId, o.id, `${kind} · ${o.name}`, start, end, 'Lechería', kind === 'Asesoría' ? cal.id : null]);
      });
  }

  // Tareas
  const tasks: [string, number, string, string, number, string?][] = [
    ['Enviar planos del penthouse', 8, 'high', 'pending', 0],
    ['Llamar para confirmar visita del jueves', 22, 'medium', 'pending', 1],
    ['Solicitar documento de propiedad al propietario', 26, 'high', 'in_progress', 1],
    ['Preparar carpeta para notaría', 30, 'high', 'in_progress', 2],
    ['Enviar 3 opciones de alquiler', 11, 'medium', 'pending', 2],
    ['Seguimiento: no respondió en 48 h', 4, 'low', 'pending', 3],
    ['Publicar townhouse en portales', 33, 'medium', 'done', 3],
    ['Agendar avalúo con el perito', 35, 'medium', 'pending', 0],
  ];
  for (const [i, [title, oi, prio, status, who]] of tasks.entries()) {
    const t = await one<{ id: string }>(
      `INSERT INTO tasks (organization_id, title, opportunity_id, due_at, status, priority, task_type, created_by, completed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [orgId, title, opps[oi]?.id ?? null, at(i % 5 === 0 ? 0 : i % 3, 10 + i, 0), status, prio, i % 2 ? 'call' : 'follow_up', valentina, status === 'done' ? minsAgo(300) : null]);
    await q(`INSERT INTO task_assignees (task_id, user_id) VALUES ($1,$2)`, [t.id, team[who]]);
  }

  // Notificaciones
  const notifs: [string, string, string, number, boolean][] = [
    ['new_lead', `Nuevo lead: ${opps[0].name}`, 'Escribió por WhatsApp desde el anuncio "Apartamentos frente al mar".', 42, false],
    ['automation', `${opps[3].name} pidió información`, 'El bot de comentarios de Instagram le respondió y le envió un DM.', 15, false],
    ['appointment_booked', `Asesoría agendada: ${opps[15].name}`, 'Mañana a las 10:00 a. m. desde la página de reservas.', 600, false],
    ['automation', `${opps[26].name} respondió al video`, 'Escríbele ahora: está caliente 🔥', 1300, true],
    ['system', 'WhatsApp conectado', 'La línea principal está lista para enviar y recibir mensajes.', 3000, true],
  ];
  for (const [type, title, body, m, read] of notifs) {
    await q(`INSERT INTO notifications (organization_id, user_id, type, title, body, created_at, read_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [orgId, valentina, type, title, body, minsAgo(m), read ? minsAgo(m - 5) : null]);
  }
  return { orgId, slug: cal.slug, star: star.id, clientId: client.id };
}

async function seedHorizonte(adminId: string) {
  const { orgId, userIds } = await createOrg('Agencia Horizonte', {
    phone: '14075550142', email: 'equipo@horizonte.example', city: 'Kissimmee, FL', country: 'Estados Unidos',
    industry: 'Seguros de vida', website: 'https://horizonte.example',
    description: 'Agencia ficticia de reclutamiento de agentes de seguros de vida.',
  }, [
    { name: 'Mateo Cárdenas', email: 'mateo@horizonte.example', role: 'owner', color: '#13243D' },
    { name: 'Lorena Pacheco', email: 'lorena@horizonte.example', role: 'admin', color: '#F69008' },
  ]);
  await q(`INSERT INTO agency_clients (organization_id, name, company, email, phone, country, plan, status, type, monthly_value, created_at)
           VALUES ($1,'Mateo Cárdenas','Agencia Horizonte','mateo@horizonte.example','14075550142','Estados Unidos','enterprise','active','client',99, now() - interval '120 days')`, [orgId]);
  await applyTemplate(orgId, tpl('reclutamiento_seguros'), {
    empresa: 'Agencia Horizonte', remitente: 'Mateo Cárdenas', ciudad: 'Kissimmee, FL', zona_horaria: 'America/New_York', telefono_encargado: '',
  }, adminId);
  const pipe = await one<{ id: string }>(`SELECT id FROM pipelines WHERE organization_id=$1`, [orgId]);
  const stages = await q<{ id: string }>(`SELECT id FROM pipeline_stages WHERE pipeline_id=$1 ORDER BY position`, [pipe.id]);
  for (let i = 0; i < 18; i++) {
    const f = FIRST[(i * 5 + 3) % FIRST.length], l = LAST[(i * 11 + 2) % LAST.length];
    const c = await one<{ id: string }>(`INSERT INTO contacts (organization_id, first_name, last_name, phone, source) VALUES ($1,$2,$3,$4,'social') RETURNING id`, [orgId, f, l, `1407555${String(2000 + i * 13).slice(-4)}`]);
    await q(`INSERT INTO opportunities (organization_id, pipeline_id, stage_id, contact_id, title, source, owner_id, position) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [orgId, pipe.id, stages[i % 7].id, c.id, `${f} ${l}`, i % 2 ? 'instagram' : 'whatsapp', userIds[i % 2], i]);
  }
}

// Otras cuentas solo para que el panel de agencia tenga variedad (sin datos dentro).
async function seedOtherClients() {
  const rows: [string, string, string, string, string, number, string, number][] = [
    ['Clínica Bella Piel', 'Daniela Prieto', 'daniela@bellapiel.example', 'pro', 'active', 30, 'Venezuela', 41],
    ['Odontología Sonríe', 'Julio Bastidas', 'julio@sonrie.example', 'starter', 'trial', 0, 'Colombia', 6],
    ['Academia Impulso', 'Renata Espinoza', 'renata@impulso.example', 'pro', 'active', 30, 'México', 88],
    ['Tienda La Ceiba', 'Pedro Linares', 'pedro@laceiba.example', 'starter', 'suspended', 15, 'Venezuela', 150],
  ];
  for (const [company, name, email, plan, status, value, country, days] of rows) {
    const org = await one<{ id: string }>(`INSERT INTO organizations (name, country) VALUES ($1,$2) RETURNING id`, [company, country]);
    await q(`INSERT INTO users (organization_id, email, password_hash, name, role) VALUES ($1,$2,$3,$4,'owner')`, [org.id, email, await hashPassword(PASSWORD), name]);
    await q(`INSERT INTO agency_clients (organization_id, name, company, email, country, plan, status, type, monthly_value, trial_ends_at, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,'client',$8,$9, now() - ($10 || ' days')::interval)`,
      [org.id, name, company, email, country, plan, status, value, status === 'trial' ? new Date(Date.now() + 8 * 86400_000) : null, days]);
  }
}

DEMO_DOMAINS.push('bellapiel.example', 'sonrie.example', 'impulso.example', 'laceiba.example');
await cleanup();
const admin = await one<{ id: string }>(
  `INSERT INTO agency_admins (email, password_hash, name, role) VALUES ('demo@arbolaureo.example', $1, 'Equipo Árbol Áureo', 'superadmin') RETURNING id`,
  [await hashPassword(PASSWORD)]);
const sol = await seedSolCaribe(admin.id);
await seedHorizonte(admin.id);
await seedOtherClients();
console.log(JSON.stringify({ ok: true, ...sol }, null, 2));
await pool.end();
