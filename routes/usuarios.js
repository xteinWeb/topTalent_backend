const express = require('express');
const router = express.Router();
const usuariosController = require('../controllers/usuariosController');
const { requireAdmin } = require('../middleware/auth');

// Mounted at /api/usuarios in index.js
// Gestión de usuarios administrativos: Talento Humano y Superadmin
router.get('/', requireAdmin('TALENTO_HUMANO'), usuariosController.listar);
router.post('/', requireAdmin('TALENTO_HUMANO'), usuariosController.crear);
router.put('/:id', requireAdmin('TALENTO_HUMANO'), usuariosController.actualizar);

module.exports = router;
