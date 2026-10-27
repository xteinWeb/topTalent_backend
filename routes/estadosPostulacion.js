const express = require('express');
const router = express.Router();
const estadosPostulacionController = require('../controllers/estadosPostulacionController');
const { requireAdmin } = require('../middleware/auth');

// Mounted at /api/estados-postulacion in index.js
router.get('/', requireAdmin(), estadosPostulacionController.getAll);
router.post('/', requireAdmin('TALENTO_HUMANO'), estadosPostulacionController.create);
router.put('/:id', requireAdmin('TALENTO_HUMANO'), estadosPostulacionController.update);

module.exports = router;
