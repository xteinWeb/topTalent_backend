const express = require('express');
const router = express.Router();
const perfilesController = require('../controllers/perfilesController');

// GET all profiles
// Mounted at /api/perfiles in index.js
router.get('/', perfilesController.getAll);

// GET a single profile by ID
router.get('/:id', perfilesController.getById);

// GET export profile as DOCX
router.get('/:id/docx', perfilesController.exportDocx);

// POST generate questions using n8n
router.post('/generate-questions', perfilesController.generateQuestions);

// POST create a new profile
router.post('/', perfilesController.create);

// PUT update a profile
router.put('/:id', perfilesController.update);

// DELETE a profile
router.delete('/:id', perfilesController.delete);

module.exports = router;
