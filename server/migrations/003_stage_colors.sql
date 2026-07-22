-- Color de cabecera por etapa (estilo GHL). Pastel por defecto (slate-200).
ALTER TABLE pipeline_stages ADD COLUMN color TEXT NOT NULL DEFAULT '#e2e8f0';

-- Colores para las etapas del pipeline demo, para que se vea premium de entrada.
UPDATE pipeline_stages SET color = '#dbeafe' WHERE id = '00000000-0000-0000-0000-000000000101'; -- Nuevo (azul)
UPDATE pipeline_stages SET color = '#fef9c3' WHERE id = '00000000-0000-0000-0000-000000000102'; -- Contactado (amarillo)
UPDATE pipeline_stages SET color = '#ffedd5' WHERE id = '00000000-0000-0000-0000-000000000103'; -- Propuesta (naranja)
UPDATE pipeline_stages SET color = '#f3e8ff' WHERE id = '00000000-0000-0000-0000-000000000104'; -- Negociación (morado)
UPDATE pipeline_stages SET color = '#dcfce7' WHERE id = '00000000-0000-0000-0000-000000000105'; -- Ganado (verde)
