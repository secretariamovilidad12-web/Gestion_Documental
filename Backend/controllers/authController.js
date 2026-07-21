const bcrypt = require('bcrypt');
const pool = require('../config/database');
const { registrarAuditoria } = require('../services/auditoriaService');
const {
    SESSION_TTL_MINUTES,
    generarTokenSesion,
    limpiarSesionesExpiradas,
    liberarSesionActiva
} = require('../services/sesionService');

async function obtenerCatalogosRegistro(req, res) {

    try {

        const oficinasResultado = await pool.query(
            `
            SELECT id_oficina, nombre
            FROM oficinas
            ORDER BY nombre
            `
        );

        const oficinas =
            oficinasResultado.rows || [];

        const oficinaRegistro =
            oficinas.find((oficina) =>
                String(oficina.nombre || '')
                    .trim()
                    .toLowerCase()
                    .includes('secretaria de movilidad')
            ) || oficinas[0] || null;

        res.json({
            success: true,
            oficinas: oficinaRegistro
                ? [
                    {
                        id_oficina: oficinaRegistro.id_oficina,
                        nombre: 'Secretaría de Movilidad'
                    }
                ]
                : []
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            success: false,
            message: 'Error al cargar el formulario de registro'
        });

    }

}

async function registrarUsuario(req, res) {

    try {

        const {
            nombre_completo,
            correo,
            usuario,
            password,
            id_oficina
        } = req.body;

        const nombreCompleto =
            String(nombre_completo || '').trim();

        const correoNormalizado =
            String(correo || '').trim().toLowerCase();

        const usuarioNormalizado =
            String(usuario || '').trim();

        const passwordTexto =
            String(password || '');

        const idOficina =
            Number(id_oficina);

        if (
            !nombreCompleto ||
            !correoNormalizado ||
            !usuarioNormalizado ||
            !passwordTexto ||
            !Number.isInteger(idOficina)
        ) {
            return res.status(400).json({
                success: false,
                message: 'Complete todos los datos obligatorios del registro'
            });
        }

        if (passwordTexto.length < 8) {
            return res.status(400).json({
                success: false,
                message: 'La contraseña debe tener al menos 8 caracteres'
            });
        }

        const existeOficina = await pool.query(
            `
            SELECT id_oficina
            FROM oficinas
            WHERE id_oficina = $1
            `,
            [idOficina]
        );

        if (existeOficina.rowCount === 0) {
            return res.status(400).json({
                success: false,
                message: 'La oficina seleccionada no es válida'
            });
        }

        const usuarioExistente = await pool.query(
            `
            SELECT
                id_usuario,
                usuario,
                correo,
                COALESCE(estado_registro, 'ACTIVO') AS estado_registro
            FROM usuarios
            WHERE (
                LOWER(usuario) = LOWER($1)
                OR LOWER(correo) = LOWER($2)
            )
            AND fecha_eliminacion IS NULL
            LIMIT 1
            `,
            [usuarioNormalizado, correoNormalizado]
        );

        if (usuarioExistente.rowCount > 0) {
            const existente =
                usuarioExistente.rows[0];

            const mensaje =
                existente.estado_registro === 'PENDIENTE'
                    ? 'Ya existe una solicitud de registro pendiente para ese usuario o correo'
                    : 'El usuario o correo ya se encuentra registrado';

            return res.status(409).json({
                success: false,
                message: mensaje
            });
        }

        const passwordHash =
            await bcrypt.hash(passwordTexto, 12);

        const creado = await pool.query(
            `
            INSERT INTO usuarios (
                nombre_completo,
                correo,
                password_hash,
                id_rol,
                id_oficina,
                activo,
                fecha_creacion,
                ultimo_acceso,
                usuario,
                estado_registro
            )
            VALUES (
                $1,
                $2,
                $3,
                NULL,
                $4,
                false,
                NOW(),
                NULL,
                $5,
                'PENDIENTE'
            )
            RETURNING id_usuario, usuario
            `,
            [
                nombreCompleto,
                correoNormalizado,
                passwordHash,
                idOficina,
                usuarioNormalizado
            ]
        );

        await registrarAuditoria({
            id_usuario: creado.rows[0].id_usuario,
            modulo: 'Usuarios',
            accion: 'Solicitar registro',
            descripcion: `Se registró una solicitud de acceso para el usuario ${usuarioNormalizado}.`,
            referencia_tipo: 'usuario',
            referencia_id: creado.rows[0].id_usuario,
            datos: {
                usuario: usuarioNormalizado,
                correo: correoNormalizado,
                estado_registro: 'PENDIENTE'
            }
        });

        res.status(201).json({
            success: true,
            message: 'Solicitud enviada. Un administrador debe aprobar su acceso.'
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            success: false,
            message: 'Error al registrar usuario'
        });

    }

}

async function cambiarPassword(req, res) {

    try {

        const idUsuario =
            Number(req.usuarioSesion?.id_usuario);

        const passwordActual =
            String(req.body.password_actual || '');

        const nuevaPassword =
            String(req.body.nueva_password || '');

        const confirmarNuevaPassword =
            String(req.body.confirmar_nueva_password || '');

        if (!Number.isInteger(idUsuario) || idUsuario <= 0) {
            return res.status(401).json({
                success: false,
                message: 'La sesión no es válida o ha expirado'
            });
        }

        if (!passwordActual || !nuevaPassword || !confirmarNuevaPassword) {
            return res.status(400).json({
                success: false,
                message: 'Complete todos los datos obligatorios'
            });
        }

        if (nuevaPassword !== confirmarNuevaPassword) {
            return res.status(400).json({
                success: false,
                message: 'La nueva contraseña y su confirmación no coinciden'
            });
        }

        if (nuevaPassword.length < 8) {
            return res.status(400).json({
                success: false,
                message: 'La nueva contraseña debe tener al menos 8 caracteres'
            });
        }

        const resultado = await pool.query(
            `
            SELECT
                id_usuario,
                usuario,
                password_hash
            FROM usuarios
            WHERE id_usuario = $1
            AND activo = true
            AND fecha_eliminacion IS NULL
            LIMIT 1
            `,
            [idUsuario]
        );

        if (resultado.rowCount === 0) {
            return res.status(404).json({
                success: false,
                message: 'Usuario no encontrado'
            });
        }

        const usuario =
            resultado.rows[0];

        const passwordActualValida =
            await bcrypt.compare(
                passwordActual,
                usuario.password_hash
            );

        if (!passwordActualValida) {
            return res.status(400).json({
                success: false,
                message: 'La contraseña actual es incorrecta'
            });
        }

        const esMismaPassword =
            await bcrypt.compare(
                nuevaPassword,
                usuario.password_hash
            );

        if (esMismaPassword) {
            return res.status(400).json({
                success: false,
                message: 'La nueva contraseña no puede ser igual a la actual'
            });
        }

        const nuevoHash =
            await bcrypt.hash(nuevaPassword, 12);

        await pool.query(
            `
            UPDATE usuarios
            SET password_hash = $2
            WHERE id_usuario = $1
            `,
            [idUsuario, nuevoHash]
        );

        await registrarAuditoria({
            id_usuario: idUsuario,
            modulo: 'Usuarios',
            accion: 'Cambiar contraseña',
            descripcion: `El usuario ${usuario.usuario} actualizó su contraseña.`,
            referencia_tipo: 'usuario',
            referencia_id: idUsuario,
            datos: {
                cambio_password: true
            }
        });

        res.json({
            success: true,
            message: 'Contraseña actualizada correctamente'
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            success: false,
            message: 'Error al cambiar contraseña'
        });

    }

}

async function solicitarRecuperacionPassword(req, res) {

    try {

        const {
            usuario,
            correo
        } = req.body;

        void usuario;
        void correo;

        // Preparado para futura integracion SMTP:
        // 1. localizar usuario por correo o usuario;
        // 2. generar token temporal de recuperacion;
        // 3. persistir token, expiracion y estado;
        // 4. enviar enlace seguro mediante proveedor SMTP externo.
        return res.status(501).json({
            success: false,
            message: 'La recuperación de contraseña por correo aún no está disponible'
        });

    } catch (error) {

        console.error(error);

        return res.status(500).json({
            success: false,
            message: 'Error al preparar recuperación de contraseña'
        });

    }

}

async function restablecerPassword(req, res) {

    try {

        const {
            token_recuperacion,
            nueva_password,
            confirmar_nueva_password
        } = req.body;

        void token_recuperacion;
        void nueva_password;
        void confirmar_nueva_password;

        // Preparado para futura integracion SMTP:
        // 1. validar token de recuperacion y su expiracion;
        // 2. validar nuevas credenciales;
        // 3. regenerar password_hash con bcrypt;
        // 4. invalidar el token para un solo uso.
        return res.status(501).json({
            success: false,
            message: 'El restablecimiento de contraseña por correo aún no está disponible'
        });

    } catch (error) {

        console.error(error);

        return res.status(500).json({
            success: false,
            message: 'Error al preparar restablecimiento de contraseña'
        });

    }

}

const login = async (req, res) => {

    try {

        const { usuario, password } = req.body;

        await limpiarSesionesExpiradas();

        const resultado = await pool.query(
            `
            SELECT *
            FROM usuarios
            WHERE usuario = $1
            AND fecha_eliminacion IS NULL
            `,
            [usuario]
        );

        if (resultado.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Usuario no encontrado'
            });
        }

        const user = resultado.rows[0];

        const passwordValida = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!passwordValida) {
            return res.status(401).json({
                success: false,
                message: 'Contraseña incorrecta'
            });
        }

        const estadoRegistro =
            String(user.estado_registro || 'ACTIVO').toUpperCase();

        if (estadoRegistro === 'PENDIENTE') {
            return res.status(403).json({
                success: false,
                message: 'Tu cuenta aún no ha sido aprobada por un administrador'
            });
        }

        if (estadoRegistro === 'RECHAZADO') {
            return res.status(403).json({
                success: false,
                message: 'Tu solicitud fue rechazada. Comunícate con el administrador'
            });
        }

        if (!user.activo) {
            return res.status(403).json({
                success: false,
                message: 'Tu cuenta no se encuentra habilitada'
            });
        }

        if (
            user.token_sesion_activa &&
            user.sesion_expira_en &&
            new Date(user.sesion_expira_en) > new Date()
        ) {
            return res.status(409).json({
                success: false,
                message: 'Ya existe una sesión abierta para este usuario. Debe cerrarla antes de iniciar una nueva.'
            });
        }

        const tokenSesion =
            generarTokenSesion();

        const sesionActualizada = await pool.query(
            `
            UPDATE usuarios
            SET ultimo_acceso = NOW(),
                token_sesion_activa = $2,
                sesion_iniciada_en = NOW(),
                sesion_expira_en = NOW() + ($3 || ' minutes')::interval
            WHERE id_usuario = $1
            RETURNING ultimo_acceso
            `,
            [
                user.id_usuario,
                tokenSesion,
                String(SESSION_TTL_MINUTES)
            ]
        );

        res.json({
            success: true,
            usuario: user.nombre_completo,
            rol: user.id_rol,
            id_usuario: user.id_usuario,
            id_oficina: user.id_oficina,
            token_sesion: tokenSesion,
            ultimo_acceso: sesionActualizada.rows[0]?.ultimo_acceso || null
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            success: false,
            message: 'Error interno'
        });

    }
};

const logout = async (req, res) => {

    try {

        const idUsuario =
            Number(req.body.id_usuario);

        const tokenSesion =
            String(req.body.token_sesion || '').trim();

        await liberarSesionActiva(idUsuario, tokenSesion);

        res.json({
            success: true
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            success: false,
            message: 'Error al cerrar sesión'
        });

    }

};

module.exports = {
    obtenerCatalogosRegistro,
    registrarUsuario,
    cambiarPassword,
    solicitarRecuperacionPassword,
    restablecerPassword,
    login,
    logout
};
