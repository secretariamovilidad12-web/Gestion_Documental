const crypto = require('crypto');
const pool = require('../config/database');

const SESSION_TTL_MINUTES =
    Number(process.env.SESSION_TTL_MINUTES || 120);

async function limpiarSesionesExpiradas(db = pool) {
    await db.query(
        `
        UPDATE usuarios
        SET token_sesion_activa = NULL,
            sesion_iniciada_en = NULL,
            sesion_expira_en = NULL
        WHERE token_sesion_activa IS NOT NULL
        AND sesion_expira_en IS NOT NULL
        AND sesion_expira_en <= NOW()
        `
    );
}

function generarTokenSesion() {
    return crypto.randomUUID();
}

function obtenerCredencialesSesion(req) {
    const idUsuario =
        Number(
            req.headers['x-id-usuario'] ||
            req.query.id_usuario ||
            req.body?.id_usuario ||
            req.body?.id_usuario_admin ||
            req.body?.id_usuario_responde ||
            req.body?.id_usuario_solicita ||
            req.body?.id_usuario_recibe ||
            0
        );

    const tokenSesion =
        String(
            req.headers['x-session-token'] ||
            req.query.token_sesion ||
            req.body?.token_sesion ||
            ''
        ).trim();

    return {
        idUsuario,
        tokenSesion
    };
}

async function obtenerUsuarioSesionActiva(idUsuario, tokenSesion, db = pool) {
    if (!Number.isInteger(idUsuario) || idUsuario <= 0 || !tokenSesion) {
        return null;
    }

    await limpiarSesionesExpiradas(db);

    const resultado = await db.query(
        `
        SELECT
            id_usuario,
            id_rol,
            nombre_completo,
            usuario,
            token_sesion_activa,
            sesion_expira_en
        FROM usuarios
        WHERE id_usuario = $1
        AND token_sesion_activa = $2
        AND activo = true
        AND COALESCE(estado_registro, 'ACTIVO') = 'ACTIVO'
        AND fecha_eliminacion IS NULL
        AND sesion_expira_en IS NOT NULL
        AND sesion_expira_en > NOW()
        `,
        [idUsuario, tokenSesion]
    );

    return resultado.rows[0] || null;
}

async function extenderSesionActiva(idUsuario, tokenSesion, db = pool) {
    await db.query(
        `
        UPDATE usuarios
        SET sesion_expira_en = NOW() + ($3 || ' minutes')::interval
        WHERE id_usuario = $1
        AND token_sesion_activa = $2
        `,
        [idUsuario, tokenSesion, String(SESSION_TTL_MINUTES)]
    );
}

async function liberarSesionActiva(idUsuario, tokenSesion, db = pool) {
    if (!Number.isInteger(idUsuario) || idUsuario <= 0 || !tokenSesion) {
        return;
    }

    await db.query(
        `
        UPDATE usuarios
        SET token_sesion_activa = NULL,
            sesion_iniciada_en = NULL,
            sesion_expira_en = NULL
        WHERE id_usuario = $1
        AND token_sesion_activa = $2
        `,
        [idUsuario, tokenSesion]
    );
}

function requerirSesion(opciones = {}) {
    const {
        rolesPermitidos = null
    } = opciones;

    return async (req, res, next) => {
        try {
            const {
                idUsuario,
                tokenSesion
            } = obtenerCredencialesSesion(req);

            const usuario =
                await obtenerUsuarioSesionActiva(idUsuario, tokenSesion);

            if (!usuario) {
                return res.status(401).json({
                    success: false,
                    message: 'La sesión no es válida o ha expirado'
                });
            }

            if (
                Array.isArray(rolesPermitidos) &&
                !rolesPermitidos.includes(Number(usuario.id_rol))
            ) {
                return res.status(403).json({
                    success: false,
                    message: 'No tiene permisos para realizar esta acción'
                });
            }

            await extenderSesionActiva(idUsuario, tokenSesion);

            req.usuarioSesion = usuario;

            next();

        } catch (error) {

            console.error(error);

            return res.status(500).json({
                success: false,
                message: 'Error al validar la sesión'
            });

        }
    };
}

module.exports = {
    SESSION_TTL_MINUTES,
    generarTokenSesion,
    limpiarSesionesExpiradas,
    obtenerCredencialesSesion,
    obtenerUsuarioSesionActiva,
    extenderSesionActiva,
    liberarSesionActiva,
    requerirSesion
};
