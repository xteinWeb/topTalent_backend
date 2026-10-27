const express = require('express');
const router = express.Router();
const empresasController = require('../controllers/empresasController');
const { requireAdmin } = require('../middleware/auth');

// Authenticated routes for companies
router.get('/', requireAdmin(), empresasController.getAll);
router.get('/:id', requireAdmin(), empresasController.getById);

module.exports = router;
