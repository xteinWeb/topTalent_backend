const { poolPromise, sql } = require('../config/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'cv-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const filetypes = /pdf|docx|doc/;
    const mimetype = file.mimetype;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    
    if (extname) {
      return cb(null, true);
    }
    cb(new Error('Solo se permiten archivos PDF, DOC o DOCX.'));
  }
}).single('hv_archivo');

// Export the upload middleware
exports.uploadMiddleware = upload;

// POST create a new job application
exports.create = async (req, res) => {
  try {
    const { 
      vacante_id, 
      nombre_completo, 
      correo, 
      telefono, 
      perfil_profesional, 
      experiencias_json, 
      estudios_json, 
      idiomas_json, 
      habilidades_json 
    } = req.body;

    if (!vacante_id || !nombre_completo || !correo) {
      // Clean up file if uploaded
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({ error: 'Faltan campos obligatorios: vacante_id, nombre_completo, correo' });
    }

    const hv_archivo_nombre = req.file ? req.file.originalname : null;
    const hv_archivo_ruta = req.file ? req.file.filename : null;

    const dataJson = {
      vacante_id,
      nombre_completo,
      correo,
      telefono,
      perfil_profesional: typeof perfil_profesional === 'string' ? JSON.parse(perfil_profesional) : perfil_profesional,
      experiencias_json: typeof experiencias_json === 'string' ? JSON.parse(experiencias_json) : experiencias_json,
      estudios_json: typeof estudios_json === 'string' ? JSON.parse(estudios_json) : estudios_json,
      idiomas_json: typeof idiomas_json === 'string' ? JSON.parse(idiomas_json) : idiomas_json,
      habilidades_json: typeof habilidades_json === 'string' ? JSON.parse(habilidades_json) : habilidades_json,
      hv_archivo_nombre,
      hv_archivo_ruta
    };

    const pool = await poolPromise;
    pool.request()
      .input('ACCION', sql.VarChar(50), 'INSERT')
      .input('DATA_JSON', sql.VarChar, JSON.stringify(dataJson))
      .execute('spPostulaciones')
      .then(function (recordSet) {
        let parsedData = null;
        try {
          parsedData = recordSet.recordset[0]["DATOS"] ? JSON.parse(recordSet.recordset[0]["DATOS"]) : null;
        } catch (e) {
          parsedData = recordSet.recordset[0]["DATOS"];
        }

        res.status(201).json({
          message: 'Postulación enviada exitosamente',
          data: parsedData
        });
      })
      .catch((err) => {
        console.error(err);
        // Clean up file on DB error
        if (req.file) {
          fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ error: err.message });
      });

  } catch (err) {
    // Clean up file on general catch error
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
    res.status(400).json({ message: err.message });
  }
};

// GET all job applications (Admin)
exports.getAll = async (req, res) => {
  try {
    const pool = await poolPromise;
    pool.request()
      .input('ACCION', sql.VarChar(50), 'SELECT_ALL')
      .input('DATA_JSON', sql.VarChar, null)
      .execute('spPostulaciones')
      .then(function (recordSet) {
        let refresh = undefined;
        if (process.env.NEWTOKEN && process.env.NEWTOKEN !== '')
          refresh = process.env.NEWTOKEN;

        let parsedData = null;
        try {
          parsedData = recordSet.recordset[0]["DATOS"] ? JSON.parse(recordSet.recordset[0]["DATOS"]) : [];
        } catch (e) {
          parsedData = recordSet.recordset[0]["DATOS"];
        }

        res.json({
          data: parsedData,
          token: refresh,
        });
      })
      .catch((err) => {
        console.error(err);
        res.status(500).json({ error: err.message });
      });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// GET applications by vacancy ID (Admin)
exports.getByVacante = async (req, res) => {
  try {
    const { vacanteId } = req.params;
    const pool = await poolPromise;
    pool.request()
      .input('ACCION', sql.VarChar(50), 'SELECT_BY_VACANTE')
      .input('DATA_JSON', sql.VarChar, JSON.stringify({ vacante_id: vacanteId }))
      .execute('spPostulaciones')
      .then(function (recordSet) {
        let refresh = undefined;
        if (process.env.NEWTOKEN && process.env.NEWTOKEN !== '')
          refresh = process.env.NEWTOKEN;

        let parsedData = null;
        try {
          parsedData = recordSet.recordset[0]["DATOS"] ? JSON.parse(recordSet.recordset[0]["DATOS"]) : [];
        } catch (e) {
          parsedData = recordSet.recordset[0]["DATOS"];
        }

        res.json({
          data: parsedData,
          token: refresh,
        });
      })
      .catch((err) => {
        console.error(err);
        res.status(500).json({ error: err.message });
      });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// GET download candidate resume file
exports.downloadFile = (req, res) => {
  const { filename } = req.params;
  const safeName = path.basename(filename);
  const filePath = path.join(__dirname, '../uploads', safeName);
  
  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).json({ error: 'Archivo no encontrado' });
  }
};
