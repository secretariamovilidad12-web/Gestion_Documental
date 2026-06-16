const express = require('express');
const pool = require('../config/database');

const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const resultado = await pool.query(`
            SELECT
                u.id_usuario,
                u.usuario,
                u.nombre_completo,
                u.correo,
                u.activo,
                u.fecha_creacion,
                u.ultimo_acceso,
                r.nombre AS rol,
                o.nombre AS oficina
            FROM usuarios u
            LEFT JOIN roles r ON r.id_rol = u.id_rol
            LEFT JOIN oficinas o ON o.id_oficina = u.id_oficina
            WHERE u.fecha_eliminacion IS NULL
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

module.exports = router;
