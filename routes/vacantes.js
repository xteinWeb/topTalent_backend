const express = require('express');
const router = express.Router();
const vacantesController = require('../controllers/vacantesController');
const { requireAdmin, optionalAuth } = require('../middleware/auth');

// Mounted at /api/vacantes in index.js

// Public route to get only active vacancies
router.get('/public', vacantesController.getActive);

// Inbox of vacancy requests pending management approval (Gerencia / Talento Humano / Superadmin)
router.get('/pendientes-autorizacion', requireAdmin('GERENCIA', 'TALENTO_HUMANO'), vacantesController.getPendientesAutorizacion);

// Area Leader creates a vacancy request (state INACTIVA / PENDIENTE)
router.post('/solicitar', requireAdmin('LIDER_AREA', 'TALENTO_HUMANO'), vacantesController.solicitar);

// Gerencia evaluates approval (Aprobado, Aprobado con reservas, No aprobado, Con observaciones)
router.put('/:id/autorizar', requireAdmin('GERENCIA'), vacantesController.autorizar);

// Talento Humano activates an approved vacancy
router.put('/:id/activar', requireAdmin('TALENTO_HUMANO'), vacantesController.activar);

// Talento Humano pauses/deactivates a vacancy
router.put('/:id/desactivar', requireAdmin('TALENTO_HUMANO'), vacantesController.desactivar);

// Single vacancy details: sin sesión admin solo se ven vacantes publicadas y sin datos internos
router.get('/:id', optionalAuth, vacantesController.getById);

// Admin route to get all vacancies
router.get('/', requireAdmin(), vacantesController.getAll);

// Admin route to create a vacancy
router.post('/', requireAdmin('TALENTO_HUMANO'), vacantesController.create);

// Admin route to update a vacancy
router.put('/:id', requireAdmin('TALENTO_HUMANO'), vacantesController.update);

// Admin route to delete a vacancy
router.delete('/:id', requireAdmin('TALENTO_HUMANO'), vacantesController.delete);

module.exports = router;
