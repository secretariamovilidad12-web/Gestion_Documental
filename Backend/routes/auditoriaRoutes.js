const express = require('express');
const { requerirSesion } = require('../services/sesionService');
const { listarAuditoria } = require('../controllers/auditoriaController');

const router = express.Router();

router.get('/', requerirSesion({ rolesPermitidos: [2] }), listarAuditoria);

module.exports = router;
