const express = require('express');
const pool = require('../config/database');
const { registrarAuditoria } = require('../services/auditoriaService');
const { requerirSesion } = require('../services/sesionService');

const router = express.Router();

router.get('/', requerirSesion({ rolesPermitidos: [2] }), async (req, res) => {
    try {
        const resultado = await pool.query(`
            SELECT
                u.id_usuario,
                u.usuario,
                u.nombre_completo,
                u.correo,
                u.activo,
                COALESCE(u.estado_registro, CASE WHEN u.activo THEN 'ACTIVO' ELSE 'RECHAZADO' END) AS estado_registro,
                u.fecha_creacion,
                u.ultimo_acceso,
                CASE
                    WHEN u.id_rol = 2 THEN 'Administrador'
                    WHEN u.id_rol = 3 THEN 'Gestor'
                    WHEN u.id_rol = 4 THEN 'Tramites'
                    ELSE r.nombre
                END AS rol,
                o.nombre AS oficina
            FROM usuarios u
            LEFT JOIN roles r ON r.id_rol = u.id_rol
            LEFT JOIN oficinas o ON o.id_oficina = u.id_oficina
            WHERE u.fecha_eliminacion IS NULL
            AND COALESCE(u.estado_registro, 'ACTIVO') <> 'PENDIENTE'
            ORDER BY u.activo DESC, u.nombre_completo ASC, u.usuario ASC
        `);

        res.json({
            success: true,
            usuarios: resultado.rows
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: 'Error al cargar usuarios'
        });
    }
});

router.get('/pendientes', requerirSesion({ rolesPermitidos: [2] }), async (req, res) => {
    try {
        const [resultado, roles] = await Promise.all([
            pool.query(`
                SELECT
                    u.id_usuario,
                    u.usuario,
                    u.nombre_completo,
                    u.correo,
                    u.fecha_creacion,
                    o.nombre AS oficina
                FROM usuarios u
                LEFT JOIN oficinas o ON o.id_oficina = u.id_oficina
                WHERE u.fecha_eliminacion IS NULL
                AND COALESCE(u.estado_registro, 'ACTIVO') = 'PENDIENTE'
                ORDER BY u.fecha_creacion ASC, u.id_usuario ASC
            `),
            pool.query(`
                SELECT
                    id_rol,
                    CASE
                        WHEN id_rol = 3 THEN 'Gestor'
                        WHEN id_rol = 2 THEN 'Administrador'
                        WHEN id_rol = 4 THEN 'Tramites'
                        ELSE nombre
                    END AS nombre
                FROM roles
                WHERE id_rol IN (2, 3, 4)
                ORDER BY CASE
                    WHEN id_rol = 3 THEN 1
                    WHEN id_rol = 2 THEN 2
                    WHEN id_rol = 4 THEN 3
                    ELSE 99
                END
            `)
        ]);

        res.json({
            success: true,
            usuarios: resultado.rows,
            roles: roles.rows
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: 'Error al cargar solicitudes pendientes'
        });
    }
});

router.put('/:idUsuario/aprobar', requerirSesion({ rolesPermitidos: [2] }), async (req, res) => {
    try {
        const idUsuario = Number(req.params.idUsuario);
        const idRol = Number(req.body.id_rol);

        if (!Number.isInteger(idUsuario) || idUsuario <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Usuario no válido'
            });
        }

        if (![2, 3, 4].includes(idRol)) {
            return res.status(400).json({
                success: false,
                message: 'Debe seleccionar un rol válido antes de aprobar'
            });
        }

        const resultado = await pool.query(
            `
            UPDATE usuarios
            SET activo = true,
                id_rol = $2,
                estado_registro = 'ACTIVO'
            WHERE id_usuario = $1
            AND fecha_eliminacion IS NULL
            AND COALESCE(estado_registro, 'ACTIVO') = 'PENDIENTE'
            RETURNING id_usuario, usuario
            `,
            [idUsuario, idRol]
        );

        if (resultado.rowCount === 0) {
            return res.status(404).json({
                success: false,
                message: 'Usuario no encontrado o sin solicitud pendiente'
            });
        }

        await registrarAuditoria({
            id_usuario: req.usuarioSesion.id_usuario,
            modulo: 'Usuarios',
            accion: 'Aprobar usuario',
            descripcion: `Se aprobó el registro del usuario ${resultado.rows[0].usuario}.`,
            referencia_tipo: 'usuario',
            referencia_id: idUsuario,
            datos: {
                id_rol: idRol,
                estado_registro: 'ACTIVO'
            }
        });

        res.json({
            success: true,
            message: 'Usuario aprobado correctamente'
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: 'Error al aprobar usuario'
        });
    }
});

router.put('/:idUsuario/rechazar', requerirSesion({ rolesPermitidos: [2] }), async (req, res) => {
    try {
        const idUsuario = Number(req.params.idUsuario);

        if (!Number.isInteger(idUsuario) || idUsuario <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Usuario no válido'
            });
        }

        const resultado = await pool.query(
            `
            UPDATE usuarios
            SET activo = false,
                estado_registro = 'RECHAZADO',
                token_sesion_activa = NULL,
                sesion_iniciada_en = NULL,
                sesion_expira_en = NULL
            WHERE id_usuario = $1
            AND fecha_eliminacion IS NULL
            AND COALESCE(estado_registro, 'ACTIVO') = 'PENDIENTE'
            RETURNING id_usuario, usuario
            `,
            [idUsuario]
        );

        if (resultado.rowCount === 0) {
            return res.status(404).json({
                success: false,
                message: 'Usuario no encontrado o sin solicitud pendiente'
            });
        }

        await registrarAuditoria({
            id_usuario: req.usuarioSesion.id_usuario,
            modulo: 'Usuarios',
            accion: 'Rechazar usuario',
            descripcion: `Se rechazó el registro del usuario ${resultado.rows[0].usuario}.`,
            referencia_tipo: 'usuario',
            referencia_id: idUsuario,
            datos: {
                estado_registro: 'RECHAZADO'
            }
        });

        res.json({
            success: true,
            message: 'Usuario rechazado correctamente'
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: 'Error al rechazar usuario'
        });
    }
});

module.exports = router;
