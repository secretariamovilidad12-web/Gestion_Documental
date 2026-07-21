const pool = require('../config/database');
const { registrarAuditoria } = require('../services/auditoriaService');

const defaultConversationId = Number(process.env.CHAT_ID_CONVERSACION || 1);
const clientesChat = new Set();
const LIMITE_MENSAJES_DEFECTO = 100;
const LIMITE_MENSAJES_MAXIMO = 200;

function emitirEventoChat(tipo, datos) {
    const evento = `event: ${tipo}\ndata: ${JSON.stringify(datos)}\n\n`;

    clientesChat.forEach((cliente) => {
        cliente.write(evento);
    });
}

async function obtenerContextoChat(idUsuarioSolicitado) {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const userResult = await client.query(
            `
            SELECT COALESCE(
                (SELECT id_usuario FROM usuarios WHERE id_usuario = $1),
                (SELECT id_usuario FROM usuarios WHERE activo = true ORDER BY id_usuario LIMIT 1),
                (SELECT id_usuario FROM usuarios ORDER BY id_usuario LIMIT 1)
            ) AS id_usuario
            `,
            [idUsuarioSolicitado || null]
        );

        const idUsuario = userResult.rows[0]?.id_usuario;

        if (!idUsuario) {
            await client.query('ROLLBACK');
            return null;
        }

        const conversationResult = await client.query(
            `
            SELECT id_conversacion
            FROM conversaciones
            WHERE id_conversacion = $1
            UNION ALL
            SELECT id_conversacion
            FROM conversaciones
            WHERE NOT EXISTS (
                SELECT 1 FROM conversaciones WHERE id_conversacion = $1
            )
            ORDER BY id_conversacion
            LIMIT 1
            `,
            [defaultConversationId]
        );

        let idConversacion = conversationResult.rows[0]?.id_conversacion;

        if (!idConversacion) {
            const createdConversation = await client.query(
                `
                INSERT INTO conversaciones (nombre)
                VALUES ($1)
                RETURNING id_conversacion
                `,
                ['Chat institucional']
            );

            idConversacion = createdConversation.rows[0].id_conversacion;
        }

        await client.query('COMMIT');

        return {
            id_conversacion: idConversacion,
            id_usuario: idUsuario
        };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

function normalizarLimiteMensajes(limitSolicitado) {
    const limit =
        Number(limitSolicitado);

    if (!Number.isInteger(limit) || limit <= 0) {
        return LIMITE_MENSAJES_DEFECTO;
    }

    return Math.min(limit, LIMITE_MENSAJES_MAXIMO);
}

function normalizarIdAnterior(beforeSolicitado) {
    const before =
        Number(beforeSolicitado);

    if (!Number.isInteger(before) || before <= 0) {
        return null;
    }

    return before;
}

async function obtenerMensajes(req, res) {
    try {
        const limit =
            normalizarLimiteMensajes(req.query.limit);

        const beforeId =
            normalizarIdAnterior(req.query.before);

        const resultado = await pool.query(
            `
            WITH mensajes_base AS (
                SELECT
                    m.id_mensaje,
                    m.id_usuario,
                    m.contenido,
                    m.fecha_envio,
                    m.tipo,
                    m.eliminado
                FROM mensajes m
                WHERE COALESCE(m.eliminado, false) = false
                AND ($1::bigint IS NULL OR m.id_mensaje < $1)
                ORDER BY m.fecha_envio DESC, m.id_mensaje DESC
                LIMIT $2
            )
            SELECT
                m.id_mensaje,
                m.id_usuario,
                u.id_rol,
                COALESCE(u.nombre_completo, u.usuario, 'Usuario') AS nombre_usuario,
                CASE
                    WHEN m.tipo = 'SOLICITUD_CARPETA'
                    THEN 'Solicitud de carpeta'
                    ELSE m.contenido
                END AS mensaje,
                m.fecha_envio AS creado_en,
                COALESCE(m.tipo, 'MENSAJE') AS tipo,
                CASE
                    WHEN m.tipo = 'SOLICITUD_CARPETA'
                    THEN jsonb_build_object(
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
                    )
                    ELSE NULL
                END AS solicitud
            FROM mensajes_base m
            LEFT JOIN usuarios u ON u.id_usuario = m.id_usuario
            LEFT JOIN LATERAL (
                SELECT (
                    CASE
                        WHEN m.tipo = 'SOLICITUD_CARPETA'
                        AND LEFT(LTRIM(m.contenido), 1) = '{'
                        THEN m.contenido::jsonb->>'id_solicitud'
                        ELSE NULL
                    END
                )::bigint AS id_solicitud
            ) ms ON true
            LEFT JOIN solicitudes_carpeta s ON s.id_solicitud = ms.id_solicitud
            LEFT JOIN usuarios us ON us.id_usuario = s.id_usuario_solicita
            LEFT JOIN oficinas o ON o.id_oficina = s.id_oficina_solicitante
            LEFT JOIN motivos_prestamo mp ON mp.id_motivo = s.id_motivo
            ORDER BY m.fecha_envio ASC, m.id_mensaje ASC
            `,
            [beforeId, limit]
        );

        res.json({
            success: true,
            mensajes: resultado.rows
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: 'Error al cargar mensajes'
        });
    }
}

function suscribirEventos(req, res) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders?.();

    res.write('event: conectado\ndata: {"success":true}\n\n');
    clientesChat.add(res);

    req.on('close', () => {
        clientesChat.delete(res);
    });
}

async function crearMensaje(req, res) {
    try {
        const {
            id_usuario,
            mensaje
        } = req.body;

        const textoMensaje = String(mensaje || '').trim();

        if (!textoMensaje) {
            return res.status(400).json({
                success: false,
                message: 'El mensaje es obligatorio'
            });
        }

        const contextoChat = await obtenerContextoChat(id_usuario);

        if (
            !contextoChat?.id_conversacion ||
            !contextoChat?.id_usuario
        ) {
            return res.status(400).json({
                success: false,
                message: 'Faltan datos relacionados para guardar el mensaje'
            });
        }

        const resultado = await pool.query(
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
                contenido AS mensaje,
                fecha_envio AS creado_en,
                tipo
            `,
            [
                contextoChat.id_conversacion,
                contextoChat.id_usuario,
                textoMensaje
            ]
        );

        const mensajeGuardado = resultado.rows[0];

        const usuarioResult = await pool.query(
            `
            SELECT
                id_rol,
                COALESCE(nombre_completo, usuario, 'Usuario') AS nombre_usuario
            FROM usuarios
            WHERE id_usuario = $1
            `,
            [mensajeGuardado.id_usuario]
        );

        const mensajeRespuesta = {
            ...mensajeGuardado,
            id_rol:
                usuarioResult.rows[0]?.id_rol,
            nombre_usuario:
                usuarioResult.rows[0]?.nombre_usuario || 'Usuario'
        };

        emitirEventoChat('mensaje-creado', mensajeRespuesta);

        res.status(201).json({
            success: true,
            mensaje: mensajeRespuesta
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: 'Error al enviar mensaje'
        });
    }
}

async function eliminarMensaje(req, res) {
    try {
        const idMensaje = Number(req.params.idMensaje);
        const idUsuario = Number(req.body.id_usuario);

        if (!Number.isInteger(idMensaje) || idMensaje <= 0) {
            return res.status(400).json({
                success: false,
                message: 'El mensaje no es valido'
            });
        }

        if (!Number.isInteger(idUsuario) || idUsuario <= 0) {
            return res.status(400).json({
                success: false,
                message: 'El usuario no es valido'
            });
        }

        const resultado = await pool.query(
            `
            UPDATE mensajes
            SET eliminado = true
            WHERE id_mensaje = $1
            AND id_usuario = $2
            RETURNING id_mensaje, contenido
            `,
            [idMensaje, idUsuario]
        );

        if (resultado.rowCount === 0) {
            return res.status(403).json({
                success: false,
                message: 'Solo puede eliminar sus propios mensajes'
            });
        }

        emitirEventoChat('mensaje-eliminado', {
            id_mensaje: resultado.rows[0].id_mensaje
        });

        await registrarAuditoria({
            id_usuario: idUsuario,
            modulo: 'Chat institucional',
            accion: 'Eliminar mensaje',
            descripcion: 'El usuario elimino un mensaje del chat institucional.',
            referencia_tipo: 'mensaje',
            referencia_id: resultado.rows[0].id_mensaje,
            datos: {
                contenido: resultado.rows[0].contenido
            }
        });

        res.json({
            success: true,
            id_mensaje: resultado.rows[0].id_mensaje
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: 'Error al eliminar mensaje'
        });
    }
}

module.exports = {
    obtenerMensajes,
    suscribirEventos,
    crearMensaje,
    eliminarMensaje,
    emitirEventoChat
};
