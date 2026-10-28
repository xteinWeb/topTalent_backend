const express = require('express');
const router = express.Router();
const candidatosController = require('../controllers/candidatosController');
const { requireCandidato } = require('../middleware/auth');

// Mounted at /api/candidatos in index.js

router.post('/registro', candidatosController.registro);
router.post('/login', candidatosController.login);
router.post('/verificar', candidatosController.verificar);
router.post('/recuperar', candidatosController.solicitarRecuperacion);
router.post('/restablecer', candidatosController.restablecerPassword);
router.get('/perfil', requireCandidato, candidatosController.getPerfil);
router.put('/perfil', requireCandidato, candidatosController.uploadMiddleware, candidatosController.updatePerfil);

module.exports = router;
