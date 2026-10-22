const express = require('express');
const router = express.Router();
const estadosPostulacionController = require('../controllers/estadosPostulacionController');

// Mounted at /api/estados-postulacion in index.js
router.get('/', estadosPostulacionController.getAll);
router.post('/', estadosPostulacionController.create);
router.put('/:id', estadosPostulacionController.update);

module.exports = router;
