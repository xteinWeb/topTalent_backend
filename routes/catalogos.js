const express = require('express');
const router = express.Router();
const catalogosController = require('../controllers/catalogosController');

// Mounted at /api/catalogos in index.js

// Public route to get catalog values by tipo
router.get('/:tipo', catalogosController.getByTipo);

module.exports = router;
