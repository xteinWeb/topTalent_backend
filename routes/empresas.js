const express = require('express');
const router = express.Router();
const empresasController = require('../controllers/empresasController');

// Public / Authenticated routes for companies
router.get('/', empresasController.getAll);
router.get('/:id', empresasController.getById);

module.exports = router;
