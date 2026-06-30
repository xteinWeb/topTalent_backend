const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: [
    'http://localhost:4200',
    'http://181.79.25.235:3900',
    'http://192.168.11.151:3900',
    'http://181.79.25.235:4200',
    'http://192.168.11.151:4200'
  ],
  credentials: true
}));
app.use(express.json());

// Import modular routes
const authRoutes = require('./routes/auth');
const perfilesRoutes = require('./routes/perfiles');
const vacantesRoutes = require('./routes/vacantes');
const postulacionesRoutes = require('./routes/postulaciones');

// Register modular routes
app.use('/api/auth', authRoutes);
app.use('/api/perfiles', perfilesRoutes);
app.use('/api/vacantes', vacantesRoutes);
app.use('/api/postulaciones', postulacionesRoutes);

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
