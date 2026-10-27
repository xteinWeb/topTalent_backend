const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { requireAdmin } = require('../middleware/auth');

// Mounted at /api/auth in index.js
router.post('/login', authController.login);
router.post('/recuperar', authController.solicitarRecuperacion);
router.post('/restablecer', authController.restablecerPassword);
router.get('/perfil/:id', requireAdmin(), authController.getProfile);
router.get('/lideres', requireAdmin('TALENTO_HUMANO'), authController.listarLideres);
router.put('/credenciales', requireAdmin(), authController.updateCredentials);

module.exports = router;
