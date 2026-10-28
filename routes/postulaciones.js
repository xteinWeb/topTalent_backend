const express = require('express');
const router = express.Router();
const postulacionesController = require('../controllers/postulacionesController');
const prefiltroController = require('../controllers/prefiltroController');
const { requireAdmin, optionalAuth } = require('../middleware/auth');

// Mounted at /api/postulaciones in index.js

// Public endpoint to apply for a job (con token de candidato, la postulación queda a nombre de su cuenta)
router.post('/', optionalAuth, postulacionesController.uploadMiddleware, postulacionesController.create);

// Admin endpoint to view all candidates (el líder de área solo recibe los de sus vacantes)
router.get('/', requireAdmin('TALENTO_HUMANO', 'GERENCIA', 'LIDER_AREA'), postulacionesController.getAll);

// Admin endpoint to view candidates by vacancy (el líder de área solo recibe los de sus vacantes)
router.get('/vacante/:vacanteId', requireAdmin('TALENTO_HUMANO', 'GERENCIA', 'LIDER_AREA'), postulacionesController.getByVacante);

// Admin endpoint to change applicant recruitment state
router.put('/:id/estado', requireAdmin('TALENTO_HUMANO'), postulacionesController.cambiarEstado);

// Admin endpoint to schedule an interview (Google Calendar + WhatsApp + Email)
router.post('/:id/agendar-entrevista', requireAdmin('TALENTO_HUMANO'), postulacionesController.agendarEntrevista);

// Admin endpoint to record psychological interview & competency matrix evaluation (FOR-TH-001)
router.post('/:id/evaluacion', requireAdmin('TALENTO_HUMANO'), postulacionesController.guardarEvaluacion);

// Resultado de la prueba psicotécnica (PDF) adjunto a la postulación
router.post('/:id/prueba-psicotecnica', requireAdmin('TALENTO_HUMANO'), postulacionesController.uploadPruebaPsicotecnica, postulacionesController.guardarPruebaPsicotecnica);
router.get('/:id/prueba-psicotecnica', requireAdmin('TALENTO_HUMANO', 'GERENCIA'), postulacionesController.descargarPruebaPsicotecnica);

// Prefiltro del candidato: llamada telefónica o enlace de un solo uso enviado por WhatsApp
router.get('/:id/prefiltro', requireAdmin('TALENTO_HUMANO', 'GERENCIA'), prefiltroController.obtener);
router.post('/:id/prefiltro/llamada', requireAdmin('TALENTO_HUMANO'), prefiltroController.registrarLlamada);
router.post('/:id/prefiltro/resultado', requireAdmin('TALENTO_HUMANO'), prefiltroController.guardarResultado);
router.post('/:id/prefiltro/enlace', requireAdmin('TALENTO_HUMANO'), prefiltroController.generarEnlace);

// Admin endpoint to trigger the second-pass AI validation workflow for a vacancy
router.post('/vacante/:vacanteId/validar', requireAdmin('TALENTO_HUMANO'), postulacionesController.ejecutarValidacion);

// Admin endpoint to export a candidate's profile as the corporate CV (FTO-GH-001) DOCX
router.get('/candidato/:candidatoId/hoja-vida-docx', requireAdmin('TALENTO_HUMANO', 'GERENCIA'), postulacionesController.exportHojaVidaCorporativaDocx);

// Admin endpoint to download CV file
router.get('/download/:filename', requireAdmin('TALENTO_HUMANO', 'GERENCIA'), postulacionesController.downloadFile);

module.exports = router;
