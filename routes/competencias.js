const express = require('express');
const router = express.Router();
const competenciasController = require('../controllers/competenciasController');
const { requireAdmin } = require('../middleware/auth');

// Mounted at /api/competencias in index.js
// Consulta: cualquier usuario administrativo. Edición: Talento Humano (y Superadmin).
router.get('/', requireAdmin(), competenciasController.obtener);
router.get('/entrevista', requireAdmin('TALENTO_HUMANO', 'GERENCIA'), competenciasController.paraEntrevista);
router.put('/', requireAdmin('TALENTO_HUMANO'), competenciasController.guardar);

module.exports = router;
