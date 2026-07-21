const express = require('express');
const { requerirSesion } = require('../services/sesionService');
const {
    listarUsuarios,
    listarPendientes,
    aprobarUsuario,
    rechazarUsuario
} = require('../controllers/usuariosController');

const router = express.Router();

router.get('/', requerirSesion({ rolesPermitidos: [2] }), listarUsuarios);
router.get('/pendientes', requerirSesion({ rolesPermitidos: [2] }), listarPendientes);
router.put('/:idUsuario/aprobar', requerirSesion({ rolesPermitidos: [2] }), aprobarUsuario);
router.put('/:idUsuario/rechazar', requerirSesion({ rolesPermitidos: [2] }), rechazarUsuario);

module.exports = router;
