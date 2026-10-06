// Almacén de medios de las automatizaciones: videos e imágenes que se adjuntan a un paso
// "Enviar WhatsApp". El archivo se guarda en disco (MEDIA_DIR) con un nombre aleatorio y se sirve
// SIN autenticación en /m/:token, porque Evolution tiene que descargarlo por URL al enviarlo.
// El token (32 bytes aleatorios) es lo único que da acceso: no se lista en ninguna ruta pública.

import { Router, raw, type Request, type Response, type NextFunction } from 'express';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query, queryOne } from '../db.ts';
import { requireAdmin } from '../auth/perms.ts';
import { env } from '../env.ts';

// Directorio persistente (en Docker producción va montado como volumen)
export const MEDIA_DIR = path.resolve(
  process.env.MEDIA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '../../data/media'),
);

export const MAX_MEDIA_BYTES = 40 * 1024 * 1024;

// Tipos permitidos → extensión del archivo en disco
const ALLOWED: Record<string, string> = {
  'video/mp4':       '.mp4',
  'video/quicktime': '.mov',
  'image/jpeg':      '.jpg',
  'image/png':       '.png',
};

// Comprobación mínima de la firma del archivo (que un .mp4 sea de verdad un MP4/MOV, etc.)
function matchesSignature(mime: string, buf: Buffer): boolean {
  if (mime === 'image/jpeg') return buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (mime === 'image/png') return buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  // MP4 y QuickTime: caja ISO-BMFF ('ftyp', o 'moov'/'mdat'/'wide'/'free' en .mov antiguos) en el byte 4
  const box = buf.subarray(4, 8).toString('latin1');
  return buf.length > 12 && ['ftyp', 'moov', 'mdat', 'wide', 'free', 'skip'].includes(box);
}

export function mediaPublicUrl(token: string): string {
  return `${env.publicUrl.replace(/\/$/, '')}/m/${token}`;
}

const shape = (r: { id: string; token: string; file_name: string; mime: string; size: string | number; created_at: Date }) => ({
  id: r.id, file_name: r.file_name, mime: r.mime, size: Number(r.size), created_at: r.created_at,
  media_type: r.mime.startsWith('video/') ? 'video' : 'image',
  url: mediaPublicUrl(r.token),
});

export const automationMediaRouter = Router();

// GET / — medios de la organización
automationMediaRouter.get('/', async (req, res) => {
  const rows = await query<{ id: string; token: string; file_name: string; mime: string; size: string; created_at: Date }>(
    `SELECT id, token, file_name, mime, size, created_at FROM automation_media
     WHERE organization_id = $1 ORDER BY created_at DESC`,
    [req.auth!.organizationId],
  );
  res.json(rows.map(shape));
});

// Cuerpo binario (Content-Type = mime del archivo, nombre en ?name=). Un archivo demasiado grande → 413 en español.
const rawBody = raw({ type: Object.keys(ALLOWED), limit: MAX_MEDIA_BYTES });
function readBody(req: Request, res: Response, next: NextFunction) {
  rawBody(req, res, (err?: unknown) => {
    if (!err) return next();
    const e = err as { type?: string; status?: number };
    if (e.type === 'entity.too.large') return res.status(413).json({ error: 'El archivo supera el máximo de 40 MB' });
    return res.status(e.status && e.status < 500 ? e.status : 400).json({ error: 'No se pudo leer el archivo' });
  });
}

// POST / — subir un archivo (solo admin)
automationMediaRouter.post('/', requireAdmin, readBody, async (req, res) => {
  const mime = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
  const ext = ALLOWED[mime];
  if (!ext) return res.status(415).json({ error: 'Solo se aceptan videos MP4/MOV e imágenes JPG/PNG' });
  const buf = req.body as Buffer;
  if (!Buffer.isBuffer(buf) || !buf.length) return res.status(400).json({ error: 'Archivo vacío' });
  if (!matchesSignature(mime, buf)) return res.status(400).json({ error: 'El contenido no corresponde al tipo de archivo' });

  // Nombre a mostrar: el original sin rutas ni caracteres de control
  const rawName = typeof req.query.name === 'string' ? req.query.name : '';
  const fileName = (path.basename(rawName).replace(/[\u0000-\u001f\u007f]/g, '').trim() || `archivo${ext}`).slice(0, 200);

  const token = randomBytes(32).toString('base64url');
  const diskName = `${token}${ext}`;
  await mkdir(MEDIA_DIR, { recursive: true });
  await writeFile(path.join(MEDIA_DIR, diskName), buf, { flag: 'wx' });

  try {
    const row = await queryOne<{ id: string; token: string; file_name: string; mime: string; size: string; created_at: Date }>(
      `INSERT INTO automation_media (organization_id, token, file_name, mime, size, path, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, token, file_name, mime, size, created_at`,
      [req.auth!.organizationId, token, fileName, mime, buf.length, diskName, req.auth!.userId],
    );
    res.status(201).json(shape(row!));
  } catch (e) {
    await unlink(path.join(MEDIA_DIR, diskName)).catch(() => {});
    throw e;
  }
});

// DELETE /:id — borrar (solo admin). Los pasos que lo usaban enviarán solo el texto.
automationMediaRouter.delete('/:id', requireAdmin, async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(String(req.params.id))) return res.status(404).json({ error: 'Archivo no encontrado' });
  const row = await queryOne<{ path: string }>(
    `DELETE FROM automation_media WHERE id = $1 AND organization_id = $2 RETURNING path`,
    [req.params.id, req.auth!.organizationId],
  );
  if (!row) return res.status(404).json({ error: 'Archivo no encontrado' });
  await unlink(path.join(MEDIA_DIR, path.basename(row.path))).catch(() => {});
  res.status(204).end();
});

// GET /m/:token — descarga pública (sin auth). res.sendFile da soporte de Range (los videos lo necesitan).
export async function servePublicMedia(req: Request, res: Response) {
  const token = String(req.params.token ?? '');
  if (!/^[A-Za-z0-9_-]{32,}$/.test(token)) return res.status(404).end();
  const row = await queryOne<{ path: string; mime: string; file_name: string }>(
    'SELECT path, mime, file_name FROM automation_media WHERE token = $1', [token],
  );
  const file = row && path.join(MEDIA_DIR, path.basename(row.path));
  if (!row || !file || !existsSync(file)) return res.status(404).end();
  res.setHeader('Content-Type', row.mime);
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(row.file_name)}`);
  // El contenido de un token nunca cambia: caché de un día (al borrarlo deja de servirse aquí)
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.sendFile(file, { dotfiles: 'deny' }, err => {
    if (err && !res.headersSent) res.status(404).end();
  });
}
