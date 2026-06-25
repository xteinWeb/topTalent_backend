const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// POST login endpoint
// Mounted at /api/auth in index.js
router.post('/login', authController.login);

module.exports = router;
