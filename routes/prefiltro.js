const express = require('express');
const router = express.Router();
const prefiltroController = require('../controllers/prefiltroController');

// Mounted at /api/prefiltro in index.js
// Públicas: el candidato abre el enlace recibido por WhatsApp. El token de un solo uso es la autorización.
router.get('/:token', prefiltroController.consultarPublico);
router.post('/:token', prefiltroController.responderPublico);

module.exports = router;
