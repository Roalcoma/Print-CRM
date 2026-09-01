-- Migrar wa_settings de OpenWA a Evolution API.
ALTER TABLE wa_settings RENAME COLUMN openwa_url        TO evo_url;
ALTER TABLE wa_settings RENAME COLUMN openwa_api_key    TO evo_api_key;
ALTER TABLE wa_settings RENAME COLUMN openwa_session_id TO instance_name;

ALTER TABLE wa_settings ALTER COLUMN evo_url       SET DEFAULT 'http://localhost:8080';
ALTER TABLE wa_settings ALTER COLUMN instance_name SET DEFAULT 'crm';

-- Limpiar datos de desarrollo de OpenWA (sessions y conversaciones en blanco).
UPDATE wa_settings SET evo_url = 'http://localhost:8080', instance_name = 'crm', evo_api_key = '', session_status = 'disconnected';
