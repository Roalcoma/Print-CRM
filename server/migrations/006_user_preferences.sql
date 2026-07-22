-- Preferencias de UI por usuario (config de tarjetas, etc.), guardadas en la
-- cuenta en vez del navegador. Así siguen al usuario en cualquier dispositivo.
ALTER TABLE users ADD COLUMN preferences JSONB NOT NULL DEFAULT '{}';
