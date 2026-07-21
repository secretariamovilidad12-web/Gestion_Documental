CREATE UNIQUE INDEX IF NOT EXISTS ux_solicitudes_carpeta_usuario_placa_pendiente
ON solicitudes_carpeta (id_usuario_solicita, UPPER(placa))
WHERE estado = 'PENDIENTE';
