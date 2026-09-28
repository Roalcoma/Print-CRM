-- Usuario de Instagram de cada cuenta conectada: sirve para no disparar el flujo de
-- comentarios con las propias cuentas del equipo.
ALTER TABLE social_connections ADD COLUMN IF NOT EXISTS username TEXT;
