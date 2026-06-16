const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const chatRoutes = require('./chatRoutes');
const { registrarAuditoria } = require('../services/auditoriaService');

const ID_CONVERSACION_CHAT = Number(process.env.CHAT_ID_CONVERSACION || 1);
const MOTIVOS_RECHAZO = [
    'No se encuentra en archivo',
    'Trasladada a otra ciudad',
    'En auditoría',
    'Préstamo activo'
];

async function obtenerConversacion(client) {
    const existente = await client.query(
        `
        SELECT id_conversacion
        FROM conversaciones
        WHERE id_conversacion = $1
        `,
        [ID_CONVERSACION_CHAT]
    );

    if (existente.rows[0]) {
        return existente.rows[0].id_conversacion;
    }

    const creada = await client.query(
        `
        INSERT INTO conversaciones (nombre)
        VALUES ($1)
        RETURNING id_conversacion
        `,
        ['Chat institucional']
    );

    return creada.rows[0].id_conversacion;
}

async function obtenerMensajeSolicitud(idSolicitud) {
    const resultado = await pool.query(
        `
        SELECT
            m.id_mensaje,
            m.id_usuario,
            u.id_rol,
            COALESCE(u.nombre_completo, u.usuario, 'Usuario') AS nombre_usuario,
            'Solicitud de carpeta' AS mensaje,
            m.fecha_envio AS creado_en,
            m.tipo,
            jsonb_build_object(
                'id_solicitud', s.id_solicitud,
                'placa', s.placa,
                'id_motivo', s.id_motivo,
                'motivo', mp.nombre,
                'observacion', s.observacion,
                'estado', s.estado,
                'fecha_solicitud', s.fecha_solicitud,
                'fecha_respuesta', s.fecha_respuesta,
                'observacion_respuesta', s.observacion_respuesta,
                'usuario_solicita', us.nombre_completo,
                'oficina', o.nombre
            ) AS solicitud
        FROM mensajes m
        JOIN solicitudes_carpeta s
            ON s.id_solicitud = (m.contenido::jsonb->>'id_solicitud')::bigint
        LEFT JOIN usuarios u ON u.id_usuario = m.id_usuario
        LEFT JOIN usuarios us ON us.id_usuario = s.id_usuario_solicita
        LEFT JOIN oficinas o ON o.id_oficina = s.id_oficina_solicitante
        LEFT JOIN motivos_prestamo mp ON mp.id_motivo = s.id_motivo
        WHERE m.tipo = 'SOLICITUD_CARPETA'
        AND s.id_solicitud = $1
        AND COALESCE(m.eliminado, false) = false
        ORDER BY m.id_mensaje DESC
        LIMIT 1
        `,
        [idSolicitud]
    );

    return resultado.rows[0];
}

async function validarRolGestion(idUsuario) {
    const resultado = await pool.query(
        `
        SELECT id_usuario, id_rol
        FROM usuarios
        WHERE id_usuario = $1
        AND activo = true
        `,
        [idUsuario]
    );

    const usuario = resultado.rows[0];

    return usuario &&
        (String(usuario.id_rol) === '2' || String(usuario.id_rol) === '3');
}

router.get('/motivos', async (req, res) => {
    try {
        const resultado = await pool.query(
            `
            SELECT id_motivo, nombre
            FROM motivos_prestamo
            WHERE activo = true
            ORDER BY nombre
            `
        );

        res.json({
            success: true,
            motivos: resultado.rows
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Error al cargar motivos'
        });
    }
});

router.get('/prestamos', async (req, res) => {
    try {
        const resultado = await pool.query(
            `
            SELECT
              p.id_prestamo,
              p.placa,
              us.nombre_completo AS usuario_solicitante,
              p.fecha_prestamo,
              p.fecha_cierre AS fecha_devolucion,


              CASE

                  WHEN d.id_devolucion IS NOT NULL
                    OR p.fecha_cierre IS NOT NULL
                    OR p.activo = false
                  THEN 'devuelto'
                  WHEN p.activo = true
                  THEN 'activo'
                  ELSE 'proceso'
              END AS estado,
              COALESCE(ur.nombre_completo, 'Sin responsable') AS responsable
            FROM prestamos_documentales p
            JOIN usuarios us
                ON us.id_usuario = p.id_usuario_solicita
            LEFT JOIN solicitudes_carpeta s
                ON s.id_solicitud = p.id_solicitud
            LEFT JOIN usuarios ur
                ON ur.id_usuario = s.id_usuario_responde
            LEFT JOIN devoluciones d
                ON d.id_prestamo = p.id_prestamo
            ORDER BY p.fecha_prestamo DESC,
             p.id_prestamo DESC
           `
        );
        res.json({
            success: true,
            prestamos: resultado.rows
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Error al cargar préstamos'
        });
    }
});

router.post('/', async (req, res) => {
    const client = await pool.connect();

    try {
        const {
            id_usuario_solicita,
            id_oficina_solicitante,
            id_motivo,
            placa,
            observacion
        } = req.body;

        if (!id_usuario_solicita || !id_oficina_solicitante || !id_motivo || !placa) {
            return res.status(400).json({
                success: false,
                message: 'Faltan datos obligatorios de la solicitud'
            });
        }

        await client.query('BEGIN');

        const solicitud = await client.query(
            `
            INSERT INTO solicitudes_carpeta (
                id_usuario_solicita,
                id_oficina_solicitante,
                id_motivo,
                placa,
                observacion
            )
            VALUES ($1, $2, $3, UPPER($4), $5)
            RETURNING *
            `,
            [
                id_usuario_solicita,
                id_oficina_solicitante,
                id_motivo,
                String(placa).trim(),
                observacion || null
            ]
        );

        const idConversacion = await obtenerConversacion(client);
        const solicitudCreada = solicitud.rows[0];

        await client.query(
            `
            INSERT INTO mensajes (
                id_conversacion,
                id_usuario,
                contenido,
                tipo
            )
            VALUES ($1, $2, $3, 'SOLICITUD_CARPETA')
            `,
            [
                idConversacion,
                id_usuario_solicita,
                JSON.stringify({
                    id_solicitud: solicitudCreada.id_solicitud
                })
            ]
        );

        await client.query('COMMIT');

        const mensaje = await obtenerMensajeSolicitud(
            solicitudCreada.id_solicitud
        );

        await registrarAuditoria({
            id_usuario: id_usuario_solicita,
            modulo: 'Solicitudes de carpeta',
            accion: 'Crear solicitud',
            descripcion: `Se registro una solicitud de carpeta para la placa ${solicitudCreada.placa}.`,
            referencia_tipo: 'solicitud_carpeta',
            referencia_id: solicitudCreada.id_solicitud,
            datos: {
                placa: solicitudCreada.placa,
                id_motivo: solicitudCreada.id_motivo
            }
        });

        chatRoutes.emitirEventoChat('mensaje-creado', mensaje);

        return res.status(201).json({
            success: true,
            solicitud: solicitudCreada,
            mensaje
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(error);

        return res.status(500).json({
            success: false,
            message: 'Error al registrar solicitud'
        });
    } finally {
        client.release();
    }
});

router.put('/:idSolicitud/aprobar', async (req, res) => {
    const client = await pool.connect();

    try {
        const idSolicitud = Number(req.params.idSolicitud);
        const idUsuarioResponde = Number(req.body.id_usuario_responde);

        if (!Number.isInteger(idSolicitud) || !Number.isInteger(idUsuarioResponde)) {
            return res.status(400).json({
                success: false,
                message: 'Datos de aprobación inválidos'
            });
        }

        if (!await validarRolGestion(idUsuarioResponde)) {
            return res.status(403).json({
                success: false,
                message: 'No tiene permisos para aprobar solicitudes'
            });
        }

        await client.query('BEGIN');

        const solicitudResultado = await client.query(
            `
            SELECT *
            FROM solicitudes_carpeta
            WHERE id_solicitud = $1
            FOR UPDATE
            `,
            [idSolicitud]
        );

        const solicitud = solicitudResultado.rows[0];

        if (!solicitud) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                message: 'Solicitud no encontrada'
            });
        }

        if (solicitud.estado !== 'PENDIENTE') {
            await client.query('ROLLBACK');
            return res.status(409).json({
                success: false,
                message: 'La solicitud ya fue gestionada'
            });
        }
        const prestamoActivo = await client.query(
            `
            SELECT id_prestamo
            FROM prestamos_documentales
            WHERE UPPER(placa) = UPPER($1)
            AND activo = true
            LIMIT 1
         `,
            [solicitud.placa]
        );

        if (prestamoActivo.rows.length > 0) {
            await client.query('ROLLBACK');

            return res.status(409).json({
                success: false,
                message: 'La carpeta ya tiene un préstamo activo'
            });
        }



        const solicitudActualizada = await client.query(
            `
           UPDATE solicitudes_carpeta
           SET estado = 'APROBADA',
              fecha_respuesta = NOW(),
              id_usuario_responde = $2,
              observacion_respuesta = NULL
           WHERE id_solicitud = $1
           RETURNING *
          `,
            [idSolicitud, idUsuarioResponde]
        );
        const prestamo = await client.query(
            `
            INSERT INTO prestamos_documentales (
                consecutivo,
                placa,
                id_usuario_solicita,
                id_oficina_solicitante,
                id_motivo,
                observaciones,
                activo,
                id_solicitud
           )
           VALUES (
               (SELECT COALESCE(MAX(consecutivo),0) + 1
               FROM prestamos_documentales),
             $1,
             $2,
             $3,
             $4,
             $5,
             true,
             $6
           )
           RETURNING *
       `,
            [
                solicitud.placa,
                solicitud.id_usuario_solicita,
                solicitud.id_oficina_solicitante,
                solicitud.id_motivo,
                solicitud.observacion,
                solicitud.id_solicitud
            ]
        );

        const idConversacion = await obtenerConversacion(client);

        const mensajeAprobacion = await client.query(
            `
            INSERT INTO mensajes (
                id_conversacion,
                id_usuario,
                contenido,
                tipo
            )
            VALUES ($1, $2, $3, 'MENSAJE')
            RETURNING
                id_mensaje,
                id_usuario,
                (
                    SELECT id_rol
                    FROM usuarios
                    WHERE usuarios.id_usuario = mensajes.id_usuario
                ) AS id_rol,
                (
                    SELECT COALESCE(nombre_completo, usuario, 'Usuario')
                    FROM usuarios
                    WHERE usuarios.id_usuario = mensajes.id_usuario
                ) AS nombre_usuario,
                contenido AS mensaje,
                fecha_envio AS creado_en,
                tipo
            `,
            [
                idConversacion,
                idUsuarioResponde,
                'Solicitud aprobada. Ya la llevo.'
            ]
        );

        await client.query('COMMIT');

        const mensajeSolicitud = await obtenerMensajeSolicitud(idSolicitud);

        await registrarAuditoria({
            id_usuario: idUsuarioResponde,
            modulo: 'Solicitudes de carpeta',
            accion: 'Aprobar solicitud',
            descripcion: `Se aprobo la solicitud de carpeta para la placa ${solicitud.placa}.`,
            referencia_tipo: 'solicitud_carpeta',
            referencia_id: idSolicitud,
            datos: {
                id_prestamo: prestamo.rows[0]?.id_prestamo,
                placa: solicitud.placa
            }
        });

        chatRoutes.emitirEventoChat('solicitud-actualizada', mensajeSolicitud);
        chatRoutes.emitirEventoChat('mensaje-creado', mensajeAprobacion.rows[0]);

        res.json({
            success: true,
            solicitud: solicitudActualizada.rows[0],
            mensaje: mensajeSolicitud
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(error);

        res.status(500).json({
            success: false,
            message: 'Error al aprobar solicitud'
        });
    } finally {
        client.release();
    }
});

router.put('/:idSolicitud/rechazar', async (req, res) => {
    const client = await pool.connect();

    try {
        const idSolicitud = Number(req.params.idSolicitud);
        const idUsuarioResponde = Number(req.body.id_usuario_responde);
        const motivoRechazo = String(req.body.motivo_rechazo || '').trim();

        if (!MOTIVOS_RECHAZO.includes(motivoRechazo)) {
            return res.status(400).json({
                success: false,
                message: 'Motivo de rechazo inválido'
            });
        }

        if (!await validarRolGestion(idUsuarioResponde)) {
            return res.status(403).json({
                success: false,
                message: 'No tiene permisos para rechazar solicitudes'
            });
        }

        await client.query('BEGIN');

        const actualizada = await client.query(
            `
            UPDATE solicitudes_carpeta
            SET estado = 'RECHAZADA',
                fecha_respuesta = NOW(),
                id_usuario_responde = $2,
                observacion_respuesta = $3
            WHERE id_solicitud = $1
            AND estado = 'PENDIENTE'
            RETURNING *
            `,
            [idSolicitud, idUsuarioResponde, motivoRechazo]
        );

        if (actualizada.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                message: 'Solicitud no encontrada o ya gestionada'
            });
        }

        const idConversacion = await obtenerConversacion(client);

        const mensajeRechazo = await client.query(
            `
            INSERT INTO mensajes (
                id_conversacion,
                id_usuario,
                contenido,
                tipo
            )
            VALUES ($1, $2, $3, 'MENSAJE')
            RETURNING
                id_mensaje,
                id_usuario,
                (
                    SELECT id_rol
                    FROM usuarios
                    WHERE usuarios.id_usuario = mensajes.id_usuario
                ) AS id_rol,
                (
                    SELECT COALESCE(nombre_completo, usuario, 'Usuario')
                    FROM usuarios
                    WHERE usuarios.id_usuario = mensajes.id_usuario
                ) AS nombre_usuario,
                contenido AS mensaje,
                fecha_envio AS creado_en,
                tipo
            `,
            [
                idConversacion,
                idUsuarioResponde,
                `Solicitud rechazada. Motivo: ${motivoRechazo}`
            ]
        );

        await client.query('COMMIT');

        const mensajeSolicitud = await obtenerMensajeSolicitud(idSolicitud);

        await registrarAuditoria({
            id_usuario: idUsuarioResponde,
            modulo: 'Solicitudes de carpeta',
            accion: 'Rechazar solicitud',
            descripcion: `Se rechazo la solicitud de carpeta. Motivo: ${motivoRechazo}.`,
            referencia_tipo: 'solicitud_carpeta',
            referencia_id: idSolicitud,
            datos: {
                motivo_rechazo: motivoRechazo
            }
        });

        chatRoutes.emitirEventoChat('solicitud-actualizada', mensajeSolicitud);
        chatRoutes.emitirEventoChat('mensaje-creado', mensajeRechazo.rows[0]);

        res.json({
            success: true,
            solicitud: actualizada.rows[0],
            mensaje: mensajeSolicitud
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(error);

        res.status(500).json({
            success: false,
            message: 'Error al rechazar solicitud'
        });
    } finally {
        client.release();
    }
});

router.post('/prestamos/:idPrestamo/devolver', async (req, res) => {
    const client = await pool.connect();

    try {
        const idPrestamo = Number(req.params.idPrestamo);
        const idUsuarioRecibe = Number(req.body.id_usuario_recibe);

        if (!await validarRolGestion(idUsuarioRecibe)) {
            return res.status(403).json({
                success: false,
                message: 'No tiene permisos para confirmar devoluciones'
            });
        }

        await client.query('BEGIN');

        const devolucion = await client.query(
            `
            INSERT INTO devoluciones (
                id_prestamo,
                id_usuario_recibe,
                fecha_devolucion,
                observacion
            )
            VALUES ($1, $2, NOW(), $3)
            RETURNING *
            `,
            [idPrestamo, idUsuarioRecibe, req.body.observacion || null]
        );

        await client.query(
            `
            UPDATE prestamos_documentales
            SET activo = false,
                fecha_cierre = NOW()
            WHERE id_prestamo = $1
            `,
            [idPrestamo]
        );

        await client.query('COMMIT');

        await registrarAuditoria({
            id_usuario: idUsuarioRecibe,
            modulo: 'Prestamos documentales',
            accion: 'Confirmar devolucion',
            descripcion: `Se confirmo la devolucion del prestamo ${idPrestamo}.`,
            referencia_tipo: 'prestamo_documental',
            referencia_id: idPrestamo,
            datos: {
                id_devolucion: devolucion.rows[0]?.id_devolucion
            }
        });

        res.status(201).json({
            success: true,
            devolucion: devolucion.rows[0]
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(error);

        res.status(500).json({
            success: false,
            message: 'Error al confirmar devolución'
        });
    } finally {
        client.release();
    }
});

module.exports = router;
