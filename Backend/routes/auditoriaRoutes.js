const express = require('express');
const pool = require('../config/database');
const { asegurarTablaAuditoria } = require('../services/auditoriaService');

const router = express.Router();

router.get('/', async (req, res) => {
    try {
        await asegurarTablaAuditoria();

        const resultado = await pool.query(`
            WITH eventos_registrados AS (
                SELECT
                    id_evento::text AS id_evento,
                    id_usuario,
                    COALESCE(nombre_usuario, 'Sistema') AS nombre_usuario,
                    modulo,
                    accion,
                    descripcion,
                    referencia_tipo,
                    referencia_id,
                    datos,
                    fecha_evento
                FROM auditoria_eventos
            ),
            mensajes_eliminados AS (
                SELECT
                    ('mensaje-eliminado-' || m.id_mensaje)::text AS id_evento,
                    m.id_usuario,
                    COALESCE(u.nombre_completo, u.usuario, 'Usuario') AS nombre_usuario,
                    'Chat institucional' AS modulo,
                    'Eliminar mensaje' AS accion,
                    'Se elimino un mensaje del chat institucional.' AS descripcion,
                    'mensaje' AS referencia_tipo,
                    m.id_mensaje AS referencia_id,
                    jsonb_build_object('contenido', m.contenido) AS datos,
                    m.fecha_envio AS fecha_evento
                FROM mensajes m
                LEFT JOIN usuarios u ON u.id_usuario = m.id_usuario
                WHERE COALESCE(m.eliminado, false) = true
            ),
            solicitudes_gestionadas AS (
                SELECT
                    ('solicitud-' || s.id_solicitud || '-' || s.estado)::text AS id_evento,
                    s.id_usuario_responde AS id_usuario,
                    COALESCE(u.nombre_completo, u.usuario, 'Usuario') AS nombre_usuario,
                    'Solicitudes de carpeta' AS modulo,
                    CASE
                        WHEN s.estado = 'APROBADA' THEN 'Aprobar solicitud'
                        WHEN s.estado = 'RECHAZADA' THEN 'Rechazar solicitud'
                        ELSE 'Gestionar solicitud'
                    END AS accion,
                    CASE
                        WHEN s.estado = 'APROBADA'
                        THEN 'Se aprobo la solicitud de carpeta para la placa ' || s.placa || '.'
                        WHEN s.estado = 'RECHAZADA'
                        THEN 'Se rechazo la solicitud de carpeta para la placa ' || s.placa || '.'
                        ELSE 'Se gestiono la solicitud de carpeta para la placa ' || s.placa || '.'
                    END AS descripcion,
                    'solicitud_carpeta' AS referencia_tipo,
                    s.id_solicitud AS referencia_id,
                    jsonb_build_object(
                        'placa', s.placa,
                        'estado', s.estado,
                        'observacion_respuesta', s.observacion_respuesta
                    ) AS datos,
                    s.fecha_respuesta AS fecha_evento
                FROM solicitudes_carpeta s
                LEFT JOIN usuarios u ON u.id_usuario = s.id_usuario_responde
                WHERE s.fecha_respuesta IS NOT NULL
            ),
            solicitudes_creadas AS (
                SELECT
                    ('solicitud-creada-' || s.id_solicitud)::text AS id_evento,
                    s.id_usuario_solicita AS id_usuario,
                    COALESCE(u.nombre_completo, u.usuario, 'Usuario') AS nombre_usuario,
                    'Solicitudes de carpeta' AS modulo,
                    'Crear solicitud' AS accion,
                    'Se registro una solicitud de carpeta para la placa ' || s.placa || '.' AS descripcion,
                    'solicitud_carpeta' AS referencia_tipo,
                    s.id_solicitud AS referencia_id,
                    jsonb_build_object('placa', s.placa, 'estado', s.estado) AS datos,
                    s.fecha_solicitud AS fecha_evento
                FROM solicitudes_carpeta s
                LEFT JOIN usuarios u ON u.id_usuario = s.id_usuario_solicita
            ),
            prestamos_devueltos AS (
                SELECT
                    ('devolucion-' || d.id_devolucion)::text AS id_evento,
                    d.id_usuario_recibe AS id_usuario,
                    COALESCE(u.nombre_completo, u.usuario, 'Usuario') AS nombre_usuario,
                    'Prestamos documentales' AS modulo,
                    'Confirmar devolucion' AS accion,
                    'Se confirmo la devolucion del prestamo ' || d.id_prestamo || '.' AS descripcion,
                    'prestamo_documental' AS referencia_tipo,
                    d.id_prestamo AS referencia_id,
                    jsonb_build_object('id_devolucion', d.id_devolucion, 'observacion', d.observacion) AS datos,
                    d.fecha_devolucion AS fecha_evento
                FROM devoluciones d
                LEFT JOIN usuarios u ON u.id_usuario = d.id_usuario_recibe
            ),
            eventos_unificados AS (
                SELECT * FROM eventos_registrados
                UNION ALL
                SELECT * FROM mensajes_eliminados
                UNION ALL
                SELECT * FROM solicitudes_creadas
                UNION ALL
                SELECT * FROM solicitudes_gestionadas
                UNION ALL
                SELECT * FROM prestamos_devueltos
            )
            SELECT DISTINCT ON (modulo, accion, referencia_tipo, referencia_id, fecha_evento)
                id_evento,
                id_usuario,
                nombre_usuario,
                modulo,
                accion,
                descripcion,
                referencia_tipo,
                referencia_id,
                datos,
                fecha_evento
            FROM eventos_unificados
            WHERE fecha_evento IS NOT NULL
            ORDER BY modulo, accion, referencia_tipo, referencia_id, fecha_evento, id_evento
            LIMIT 500
        `);

        res.json({
            success: true,
            eventos: resultado.rows.sort((a, b) =>
                new Date(b.fecha_evento) - new Date(a.fecha_evento)
            )
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: 'Error al cargar auditoria'
        });
    }
});

module.exports = router;
