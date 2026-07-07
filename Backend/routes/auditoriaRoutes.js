const express = require('express');
const pool = require('../config/database');
const { asegurarTablaAuditoria } = require('../services/auditoriaService');
const { requerirSesion } = require('../services/sesionService');

const router = express.Router();

router.get('/', requerirSesion({ rolesPermitidos: [2] }), async (req, res) => {
    try {
        await asegurarTablaAuditoria();

        const resultado = await pool.query(`
            WITH eventos_registrados AS (
                SELECT
                    ae.id_evento::text AS id_evento,
                    ae.id_usuario,
                    COALESCE(ae.nombre_usuario, 'Sistema') AS nombre_usuario,
                    ae.modulo,
                    ae.accion,
                    CASE
                        WHEN ae.modulo = 'Prestamos documentales'
                        AND ae.accion = 'Confirmar devolucion'
                        AND ae.referencia_tipo = 'prestamo_documental'
                        AND p.placa IS NOT NULL
                        THEN 'Se confirmo la devolucion de la carpeta con placa ' || p.placa || '.'
                        ELSE ae.descripcion
                    END AS descripcion,
                    ae.referencia_tipo,
                    ae.referencia_id,
                    CASE
                        WHEN ae.modulo = 'Prestamos documentales'
                        AND ae.accion = 'Confirmar devolucion'
                        AND ae.referencia_tipo = 'prestamo_documental'
                        AND p.placa IS NOT NULL
                        THEN COALESCE(ae.datos, '{}'::jsonb) || jsonb_build_object('placa', p.placa)
                        ELSE ae.datos
                    END AS datos,
                    ae.fecha_evento
                FROM auditoria_eventos
                LEFT JOIN prestamos_documentales p
                    ON ae.modulo = 'Prestamos documentales'
                    AND ae.accion = 'Confirmar devolucion'
                    AND ae.referencia_tipo = 'prestamo_documental'
                    AND p.id_prestamo = ae.referencia_id
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
                     AND NOT EXISTS (
                       SELECT 1
                       FROM auditoria_eventos ae
                       WHERE ae.modulo = 'Chat institucional'
                          AND ae.accion = 'Eliminar mensaje'
                          AND ae.referencia_tipo = 'mensaje'
                          AND ae.referencia_id = m.id_mensaje
                   )
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
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM auditoria_eventos ae
                    WHERE ae.modulo = 'Solicitudes de carpeta'
                    AND ae.accion = 'Crear solicitud'
                    AND ae.referencia_tipo = 'solicitud_carpeta'
                    AND ae.referencia_id = s.id_solicitud
                )
            ),
           prestamos_devueltos AS (
                SELECT
                    ('devolucion-' || d.id_devolucion)::text AS id_evento,
                    d.id_usuario_recibe AS id_usuario,
                    COALESCE(u.nombre_completo, u.usuario, 'Usuario') AS nombre_usuario,
                    'Prestamos documentales' AS modulo,
                    'Confirmar devolucion' AS accion,
                    'Se confirmo la devolucion de la carpeta con placa ' || p.placa || '.' AS descripcion,
                    'prestamo_documental' AS referencia_tipo,
                    d.id_prestamo AS referencia_id,
                    jsonb_build_object('id_devolucion', d.id_devolucion, 'placa', p.placa, 'observacion', d.observacion) AS datos,
                    d.fecha_devolucion AS fecha_evento
                FROM devoluciones d
                JOIN prestamos_documentales p ON p.id_prestamo = d.id_prestamo
                LEFT JOIN usuarios u ON u.id_usuario = d.id_usuario_recibe
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM auditoria_eventos ae
                    WHERE ae.modulo = 'Prestamos documentales'
                    AND ae.accion = 'Confirmar devolucion'
                    AND ae.referencia_tipo = 'prestamo_documental'
                    AND ae.referencia_id = d.id_prestamo
                )
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
            SELECT DISTINCT ON (modulo, accion, referencia_tipo, referencia_id)
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
            ORDER BY modulo, accion, referencia_tipo, referencia_id, fecha_evento DESC, id_evento DESC
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
