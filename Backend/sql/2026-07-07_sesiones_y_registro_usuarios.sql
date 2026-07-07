ALTER TABLE usuarios
ADD COLUMN IF NOT EXISTS estado_registro VARCHAR(20);

UPDATE usuarios
SET estado_registro = CASE
    WHEN activo = true THEN 'ACTIVO'
    ELSE 'RECHAZADO'
END
WHERE estado_registro IS NULL;

UPDATE usuarios
SET estado_registro = 'ACTIVO'
WHERE estado_registro NOT IN ('ACTIVO', 'PENDIENTE', 'RECHAZADO');

ALTER TABLE usuarios
ALTER COLUMN estado_registro SET DEFAULT 'ACTIVO';

ALTER TABLE usuarios
ALTER COLUMN estado_registro SET NOT NULL;

ALTER TABLE usuarios
ADD COLUMN IF NOT EXISTS token_sesion_activa VARCHAR(120);

ALTER TABLE usuarios
ADD COLUMN IF NOT EXISTS sesion_iniciada_en TIMESTAMP WITHOUT TIME ZONE;

ALTER TABLE usuarios
ADD COLUMN IF NOT EXISTS sesion_expira_en TIMESTAMP WITHOUT TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_usuarios_estado_registro
ON usuarios (estado_registro);

CREATE INDEX IF NOT EXISTS idx_usuarios_sesion_expira_en
ON usuarios (sesion_expira_en);
