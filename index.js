const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:4200' || '181.79.25.235:3500/',
  credentials: true
}));
app.use(express.json());

// Import modular routes
const authRoutes = require('./routes/auth');
const perfilesRoutes = require('./routes/perfiles');

// Register modular routes
app.use('/api/auth', authRoutes);
app.use('/api/perfiles', perfilesRoutes);

// Basic health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Backend is running correctly with modular route layout',
    timestamp: new Date()
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
