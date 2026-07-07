const express = require('express');
const { requerirSesion } = require('../services/sesionService');

const router = express.Router();

const {
    obtenerCatalogosRegistro,
    registrarUsuario,
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
router.post('/login', login);
router.post('/logout', logout);

module.exports = router;
