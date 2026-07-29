const express = require('express');
const router = express.Router();
const candidatosController = require('../controllers/candidatosController');

// Mounted at /api/candidatos in index.js

router.post('/registro', candidatosController.registro);
router.post('/login', candidatosController.login);
router.get('/perfil', candidatosController.getPerfil);
router.put('/perfil', candidatosController.updatePerfil);

module.exports = router;
