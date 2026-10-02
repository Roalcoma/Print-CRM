-- 045_token_version.sql
-- Versión de las sesiones de cada usuario: los JWT llevan `tv` y requireAuth exige que
-- coincida. Subirla (al restablecer la contraseña) cierra todas sus sesiones abiertas.
-- Los tokens emitidos antes de esta migración no traen `tv` y cuentan como 0: nadie
-- queda deslogueado al desplegar.
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
