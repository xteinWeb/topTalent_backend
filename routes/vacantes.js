const express = require('express');
const router = express.Router();
const vacantesController = require('../controllers/vacantesController');

// Mounted at /api/vacantes in index.js

// Public route to get only active vacancies
router.get('/public', vacantesController.getActive);

// Inbox of vacancy requests pending management approval (Gerencia / Superadmin)
router.get('/pendientes-autorizacion', vacantesController.getPendientesAutorizacion);

// Area Leader creates a vacancy request (state INACTIVA / PENDIENTE)
router.post('/solicitar', vacantesController.solicitar);

// Gerencia evaluates approval (Aprobado, Aprobado con reservas, No aprobado, Con observaciones)
router.put('/:id/autorizar', vacantesController.autorizar);

// Talento Humano activates an approved vacancy
router.put('/:id/activar', vacantesController.activar);

// Talento Humano pauses/deactivates a vacancy
router.put('/:id/desactivar', vacantesController.desactivar);

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
