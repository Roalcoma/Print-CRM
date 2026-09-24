-- Agrega 'blocked' como valor válido para el status de appointments
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_status_check;
ALTER TABLE appointments ADD CONSTRAINT appointments_status_check
  CHECK (status IN ('scheduled','completed','cancelled','no_show','blocked'));
