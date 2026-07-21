const express = require('express');
const { requerirSesion } = require('../services/sesionService');
const {
    obtenerMotivos,
    obtenerPrestamos,
    crearSolicitud,
    aprobarSolicitud,
    rechazarSolicitud,
    devolverPrestamo
} = require('../controllers/solicitudesController');

const router = express.Router();

router.get('/motivos', requerirSesion(), obtenerMotivos);
router.get('/prestamos', requerirSesion(), obtenerPrestamos);
router.post('/', requerirSesion(), crearSolicitud);
router.put('/:idSolicitud/aprobar', requerirSesion(), aprobarSolicitud);
router.put('/:idSolicitud/rechazar', requerirSesion(), rechazarSolicitud);
router.post('/prestamos/:idPrestamo/devolver', requerirSesion(), devolverPrestamo);

module.exports = router;
