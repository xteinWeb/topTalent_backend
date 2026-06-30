const express = require('express');
const router = express.Router();
const vacantesController = require('../controllers/vacantesController');

// Mounted at /api/vacantes in index.js

// Public route to get only active vacancies
router.get('/public', vacantesController.getActive);

// Admin / Public get single vacancy details
router.get('/:id', vacantesController.getById);

// Admin route to get all vacancies
router.get('/', vacantesController.getAll);

// Admin route to create a vacancy
router.post('/', vacantesController.create);

// Admin route to update a vacancy
router.put('/:id', vacantesController.update);

// Admin route to delete a vacancy
router.delete('/:id', vacantesController.delete);

module.exports = router;
