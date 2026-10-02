-- 044_phone_digits_booking_lock.sql
-- Teléfonos normalizados en contactos (ver server/src/phone.ts: la regla debe ser idéntica).
--
-- crm_phone_digits(texto): solo dígitos; quita el prefijo internacional 00; NANP de 10 dígitos → 1 delante;
-- móvil venezolano en formato nacional (0412/0414/0416/0422/0424/0426 + 7 dígitos) → 58 delante sin el 0.
-- Devuelve NULL si no queda ningún dígito. IMMUTABLE para poder usarla en una columna generada.
CREATE OR REPLACE FUNCTION crm_phone_digits(p text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
           WHEN d ~ '^[2-9][0-9]{2}[2-9][0-9]{6}$' THEN '1' || d
           WHEN d ~ '^0(41[246]|42[246])[0-9]{7}$' THEN '58' || substr(d, 2)
           ELSE nullif(d, '')
         END
  FROM (SELECT CASE WHEN x LIKE '00%' THEN substr(x, 3) ELSE x END AS d
        FROM (SELECT regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') AS x) s0) s1
$$;

-- Columna generada: se mantiene sola en cualquier INSERT/UPDATE de phone, venga de donde venga.
-- (Si algún día cambia la regla: CREATE OR REPLACE la función y `UPDATE contacts SET phone = phone`.)
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS phone_digits text GENERATED ALWAYS AS (crm_phone_digits(phone)) STORED;

-- Las búsquedas comparan por los últimos 10 dígitos (tolerante a código de país): índice sobre esa clave.
-- NO es único: hay datos reales con duplicados que no se fusionan automáticamente. Los duplicados
-- nuevos por carrera se evitan con pg_advisory_xact_lock en el buscar-o-crear (phone.ts lockPhone).
CREATE INDEX IF NOT EXISTS idx_contacts_org_phone_key
  ON contacts (organization_id, right(phone_digits, 10))
  WHERE phone_digits IS NOT NULL;

-- Doble reserva: NO se crea una restricción EXCLUDE sobre appointments porque
--  1) el CRM permite a propósito citas manuales solapadas en el mismo calendario (appointments.ts no
--     valida choques) y la restricción lo rompería;
--  2) EXCLUDE no admite NOT VALID: si producción ya tiene solapamientos, la migración fallaría al arrancar.
-- La reserva/reagendado público toma pg_advisory_xact_lock por calendario y revalida el hueco dentro
-- de la transacción antes de insertar (routes/booking.ts). No hace falta esquema nuevo para eso.
