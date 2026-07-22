-- Permisos por módulo por usuario (array de claves de módulo permitidas).
-- owner/admin tienen acceso total por rol (este array se ignora para ellos).
ALTER TABLE users ADD COLUMN permissions JSONB NOT NULL DEFAULT '[]';
