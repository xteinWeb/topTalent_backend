const express = require('express');
const router = express.Router();
const postulacionesController = require('../controllers/postulacionesController');

// Mounted at /api/postulaciones in index.js

// Public endpoint to apply for a job
router.post('/', postulacionesController.uploadMiddleware, postulacionesController.create);

// Admin endpoint to view all candidates
router.get('/', postulacionesController.getAll);

// Admin endpoint to view candidates by vacancy
router.get('/vacante/:vacanteId', postulacionesController.getByVacante);

// Admin endpoint to download CV file
router.get('/download/:filename', postulacionesController.downloadFile);

module.exports = router;
