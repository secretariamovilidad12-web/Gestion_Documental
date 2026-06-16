const pool = require('../config/database');

async function asegurarTablaAuditoria(db = pool) {
    await db.query(`
        CREATE TABLE IF NOT EXISTS auditoria_eventos (
            id_evento BIGSERIAL PRIMARY KEY,
            id_usuario BIGINT,
            nombre_usuario VARCHAR(150),
            modulo VARCHAR(80) NOT NULL,
            accion VARCHAR(120) NOT NULL,
            descripcion TEXT NOT NULL,
            referencia_tipo VARCHAR(80),
            referencia_id BIGINT,
            datos JSONB,
            fecha_evento TIMESTAMP NOT NULL DEFAULT NOW()
        )
    `);
}

async function registrarAuditoria({
    db = pool,
    id_usuario,
    modulo,
    accion,
    descripcion,
    referencia_tipo = null,
    referencia_id = null,
    datos = null
}) {
    await asegurarTablaAuditoria(db);

    await db.query(
        `
        INSERT INTO auditoria_eventos (
            id_usuario,
            nombre_usuario,
            modulo,
            accion,
            descripcion,
            referencia_tipo,
            referencia_id,
            datos
        )
        VALUES (
            $1,
            (
                SELECT COALESCE(nombre_completo, usuario, 'Usuario')
                FROM usuarios
                WHERE id_usuario = $1
            ),
            $2,
            $3,
            $4,
            $5,
            $6,
            $7::jsonb
        )
        `,
        [
            id_usuario || null,
            modulo,
            accion,
            descripcion,
            referencia_tipo,
            referencia_id,
            datos ? JSON.stringify(datos) : null
        ]
    );
}

module.exports = {
    asegurarTablaAuditoria,
    registrarAuditoria
};
