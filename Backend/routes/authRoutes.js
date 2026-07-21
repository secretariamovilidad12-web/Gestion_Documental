const express = require('express');
const { requerirSesion } = require('../services/sesionService');

const router = express.Router();

const {
    obtenerCatalogosRegistro,
    registrarUsuario,
    cambiarPassword,
    solicitarRecuperacionPassword,
    restablecerPassword,
    logout,
    login
} = require('../controllers/authController');

router.get('/catalogos-registro', obtenerCatalogosRegistro);
router.get('/heartbeat', requerirSesion(), (req, res) => {
    res.json({
        success: true
    });
});
router.post('/registro', registrarUsuario);
router.post('/cambiar-password', requerirSesion(), cambiarPassword);
router.post('/recuperacion-password/solicitar', solicitarRecuperacionPassword);
router.post('/recuperacion-password/restablecer', restablecerPassword);
router.post('/login', login);
router.post('/logout', logout);

module.exports = router;
