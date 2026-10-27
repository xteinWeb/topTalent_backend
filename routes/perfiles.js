const express = require('express');
const router = express.Router();
const perfilesController = require('../controllers/perfilesController');
const { requireAdmin } = require('../middleware/auth');

// Mounted at /api/perfiles in index.js
// Lectura: cualquier usuario administrativo. Escritura: Talento Humano (y Superadmin).

// GET all profiles
router.get('/', requireAdmin(), perfilesController.getAll);

// GET a single profile by ID
router.get('/:id', requireAdmin(), perfilesController.getById);

// GET export profile as DOCX
router.get('/:id/docx', requireAdmin(), perfilesController.exportDocx);

// POST generate questions using n8n
router.post('/generate-questions', requireAdmin('TALENTO_HUMANO'), perfilesController.generateQuestions);

// POST create a new profile
router.post('/', requireAdmin('TALENTO_HUMANO'), perfilesController.create);

// PUT update a profile
router.put('/:id', requireAdmin('TALENTO_HUMANO'), perfilesController.update);

// DELETE a profile
router.delete('/:id', requireAdmin('TALENTO_HUMANO'), perfilesController.delete);

module.exports = router;
