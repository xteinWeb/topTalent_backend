const express = require('express');
const router = express.Router();
const reportesController = require('../controllers/reportesController');
const { requireAdmin } = require('../middleware/auth');

// Mounted at /api/reportes in index.js
router.get('/indicadores', requireAdmin('TALENTO_HUMANO', 'GERENCIA'), reportesController.indicadores);
router.get('/indicadores/excel', requireAdmin('TALENTO_HUMANO', 'GERENCIA'), reportesController.indicadoresExcel);

module.exports = router;
