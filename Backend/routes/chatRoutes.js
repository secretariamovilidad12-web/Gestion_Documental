const express = require('express');
const { requerirSesion } = require('../services/sesionService');
const {
    obtenerMensajes,
    suscribirEventos,
    crearMensaje,
    eliminarMensaje
} = require('../controllers/chatController');

const router = express.Router();

router.get('/mensajes', requerirSesion(), obtenerMensajes);
router.get('/eventos', requerirSesion(), suscribirEventos);
router.post('/mensajes', requerirSesion(), crearMensaje);
router.delete('/mensajes/:idMensaje', requerirSesion(), eliminarMensaje);

module.exports = router;
