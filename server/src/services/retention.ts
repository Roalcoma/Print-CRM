// Retención de datos: un job diario (index.ts) borra lo que ya no sirve de las tablas que crecen
// sin límite. Siempre por lotes de BATCH filas (DELETE … WHERE id IN (SELECT … LIMIT n)) para no
// bloquear la tabla ni llenar el WAL de golpe en el primer pase.
//
// Qué se borra y por qué:
// - notifications: leídas con más de 90 días, no leídas con más de 180. Se conserva SIEMPRE el último
//   aviso de cada instancia de WhatsApp (entity_type 'wa_instance'): wa-monitor lo lee al arrancar
//   para saber si la instancia seguía caída.
// - automation_runs terminados (completed/cancelled/failed) con más de 90 días. Los que siguen en
//   espera no se tocan nunca.
// - activity_feed (historial de contactos/oportunidades) con más de 365 días.
// - crm_audit_log: es la auditoría que ve la agencia (quién borró/cambió qué). Se es conservador:
//   2 años (730 días) en vez de 1, por si hay que aclarar una disputa con un cliente.
// - ig_processed_comments con más de 30 días: es la deduplicación del polling de comentarios. El
//   polling ignora comentarios de más de IG_COMMENT_MAX_AGE_DAYS (ig-comments.ts, < 30), así que
//   borrar la marca nunca hace que un comentario viejo vuelva a disparar el DM.
// - conv_messages.media_url (data URI cacheado, puede pesar ~1 MB por mensaje): SOLO si
//   RETENTION_PURGE_MEDIA=true. El proxy /api/media/:id puede volver a pedirla a Evolution
//   (getBase64FromMediaMessage por wa_message_id), pero eso depende de que Evolution conserve el
//   mensaje en su BD y de que WhatsApp aún tenga el archivo (sus servidores lo guardan un tiempo
//   limitado): no está garantizado, así que viene apagado. Aun activado, solo se vacían mensajes
//   ENTRANTES con wa_message_id; las imágenes enviadas desde el CRM nunca (su data URI es la única copia).

import { pool } from '../db.ts';

const BATCH = 5000;

type Rule = { name: string; table: string; key: string; where: string; org: string; update?: string };

// `org` filtra por organización (tests); usa $1 = organization_id o NULL para todas.
const RULES: Rule[] = [
  {
    name: 'notificaciones', table: 'notifications', key: 'id', org: 'n.organization_id',
    where: `((n.read_at IS NOT NULL AND n.created_at < NOW() - INTERVAL '90 days')
             OR (n.read_at IS NULL AND n.created_at < NOW() - INTERVAL '180 days'))
            AND NOT (n.entity_type = 'wa_instance' AND NOT EXISTS (
              SELECT 1 FROM notifications n2
              WHERE n2.entity_type = 'wa_instance' AND n2.entity_id = n.entity_id AND n2.created_at > n.created_at))`,
  },
  {
    name: 'runs de automatizaciones', table: 'automation_runs', key: 'id', org: 'n.organization_id',
    where: `n.status IN ('completed', 'cancelled', 'failed')
            AND COALESCE(n.completed_at, n.updated_at) < NOW() - INTERVAL '90 days'`,
  },
  {
    name: 'actividad', table: 'activity_feed', key: 'id', org: 'n.organization_id',
    where: `n.created_at < NOW() - INTERVAL '365 days'`,
  },
  {
    name: 'auditoría', table: 'crm_audit_log', key: 'id', org: 'n.organization_id',
    where: `n.created_at < NOW() - INTERVAL '730 days'`,
  },
  {
    name: 'comentarios IG procesados', table: 'ig_processed_comments', key: 'comment_id',
    org: '(SELECT organization_id FROM social_connections sc WHERE sc.id = n.connection_id)',
    where: `n.created_at < NOW() - INTERVAL '30 days'`,
  },
];

const MEDIA_RULE: Rule = {
  name: 'media cacheada', table: 'conv_messages', key: 'id', org: 'n.organization_id',
  where: `n.media_url LIKE 'data:%' AND n.direction = 'inbound' AND n.wa_message_id IS NOT NULL
          AND n.created_at < NOW() - INTERVAL '30 days'`,
  update: 'media_url = NULL',
};

async function applyRule(r: Rule, orgId: string | null): Promise<number> {
  const pick = `SELECT n.${r.key} FROM ${r.table} n WHERE ${r.where} AND ($1::uuid IS NULL OR ${r.org} = $1) LIMIT ${BATCH}`;
  const sql = r.update
    ? `UPDATE ${r.table} SET ${r.update} WHERE ${r.key} IN (${pick})`
    : `DELETE FROM ${r.table} WHERE ${r.key} IN (${pick})`;
  let total = 0;
  for (;;) {
    const n = (await pool.query(sql, [orgId])).rowCount ?? 0;
    total += n;
    if (n < BATCH) return total;
    await new Promise(res => setTimeout(res, 200));   // respiro entre lotes
  }
}

// Devuelve cuántas filas tocó cada regla. `orgId` limita a una organización (tests).
export async function runRetention(opts: { orgId?: string; purgeMedia?: boolean } = {}): Promise<Record<string, number>> {
  const rules = [...RULES];
  if (opts.purgeMedia ?? process.env.RETENTION_PURGE_MEDIA === 'true') rules.push(MEDIA_RULE);
  const done: Record<string, number> = {};
  for (const r of rules) done[r.name] = await applyRule(r, opts.orgId ?? null);
  const summary = Object.entries(done).filter(([, n]) => n).map(([k, n]) => `${k}: ${n}`).join(', ');
  if (summary) console.log(`[retention] limpieza diaria → ${summary}`);
  return done;
}
