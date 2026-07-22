-- Datos de ejemplo para desarrollo. Idempotente vía ON CONFLICT sobre email fijo.
-- password_hash corresponde a 'demo1234' (lo regenera src/migrate.ts si hace falta).

INSERT INTO organizations (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'Organización Demo')
ON CONFLICT (id) DO NOTHING;

-- El usuario demo se inserta desde migrate.ts (necesita hash generado con scrypt).

-- Pipeline de ventas por defecto
INSERT INTO pipelines (id, organization_id, name)
VALUES ('00000000-0000-0000-0000-000000000010',
        '00000000-0000-0000-0000-000000000001', 'Pipeline de Ventas')
ON CONFLICT (id) DO NOTHING;

INSERT INTO pipeline_stages (id, pipeline_id, name, position) VALUES
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000010', 'Nuevo',       0),
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000010', 'Contactado',  1),
  ('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000010', 'Propuesta',   2),
  ('00000000-0000-0000-0000-000000000104', '00000000-0000-0000-0000-000000000010', 'Negociación', 3),
  ('00000000-0000-0000-0000-000000000105', '00000000-0000-0000-0000-000000000010', 'Ganado',      4)
ON CONFLICT (id) DO NOTHING;
