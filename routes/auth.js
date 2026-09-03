const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Mounted at /api/auth in index.js
router.post('/login', authController.login);
router.get('/perfil/:id', authController.getProfile);
router.put('/credenciales', authController.updateCredentials);

module.exports = router;
