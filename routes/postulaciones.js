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

// Admin endpoint to trigger the second-pass AI validation workflow for a vacancy
router.post('/vacante/:vacanteId/validar', postulacionesController.ejecutarValidacion);

// Admin endpoint to export a candidate's profile as the corporate CV (FTO-GH-001) DOCX
router.get('/candidato/:candidatoId/hoja-vida-docx', postulacionesController.exportHojaVidaCorporativaDocx);

// Admin endpoint to download CV file
router.get('/download/:filename', postulacionesController.downloadFile);

module.exports = router;
