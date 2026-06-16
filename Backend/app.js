const express = require('express');
const cors = require('cors');

const pool = require('./config/database');
const authRoutes = require('./routes/authRoutes');
const chatRoutes = require('./routes/chatRoutes');
const usuariosRoutes = require('./routes/usuariosRoutes');
const auditoriaRoutes = require('./routes/auditoriaRoutes');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/auditoria', auditoriaRoutes);

app.get('/', async (req, res) => {

    try {

        const resultado = await pool.query('SELECT NOW()');

        res.json({
            exito: true,
            fecha: resultado.rows[0]
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            exito: false,
            error: error.message
        });

    }

});
const solicitudesRoutes =
    require('./routes/solicitudesRoutes');

app.use(
    '/api/solicitudes-carpeta',
    solicitudesRoutes
);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Servidor iniciado en puerto ${PORT}`);
});