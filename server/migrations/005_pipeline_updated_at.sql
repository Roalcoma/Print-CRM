-- Fecha de última modificación del pipeline (columna "Actualizado" estilo GHL).
ALTER TABLE pipelines ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
