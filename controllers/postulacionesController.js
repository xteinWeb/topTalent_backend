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
  let uploadedFileRuta = req.file ? req.file.path : null;
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
      habilidades_json,
      candidato_id
    } = req.body;

    if (!vacante_id || !nombre_completo || !correo) {
      if (uploadedFileRuta && fs.existsSync(uploadedFileRuta)) {
        fs.unlinkSync(uploadedFileRuta);
      }
      return res.status(400).json({ error: 'Faltan campos obligatorios: vacante_id, nombre_completo, correo' });
    }

    const hv_archivo_nombre = req.file ? req.file.originalname : null;
    const hv_archivo_ruta = req.file ? req.file.filename : null;

    const pool = await poolPromise;
    let finalCandidatoId = candidato_id;
    if (finalCandidatoId === 'null' || finalCandidatoId === 'undefined' || !finalCandidatoId) {
      finalCandidatoId = null;
    }

    if (!finalCandidatoId) {
      // Find candidate by email
      const checkResult = await pool.request()
        .input('ACCION', sql.VarChar(50), 'SELECT_BY_EMAIL')
        .input('DATA_JSON', sql.VarChar, JSON.stringify({ email: correo }))
        .execute('spCandidatos');
      
      let parsedCandidate = null;
      try {
        parsedCandidate = checkResult.recordset[0]["DATOS"] ? JSON.parse(checkResult.recordset[0]["DATOS"]) : null;
      } catch (e) {
        parsedCandidate = checkResult.recordset[0]["DATOS"];
      }

      if (parsedCandidate) {
        finalCandidatoId = parsedCandidate.id;
      } else {
        // Create new candidate
        const newPassword = 'AutoRegister-' + Math.random().toString(36).substring(2, 10);
        const insertResult = await pool.request()
          .input('ACCION', sql.VarChar(50), 'INSERT')
          .input('DATA_JSON', sql.VarChar, JSON.stringify({ email: correo, password_hash: newPassword }))
          .execute('spCandidatos');
        
        let parsedNewCandidate = null;
        try {
          parsedNewCandidate = insertResult.recordset[0]["DATOS"] ? JSON.parse(insertResult.recordset[0]["DATOS"]) : null;
        } catch (e) {
          parsedNewCandidate = insertResult.recordset[0]["DATOS"];
        }

        if (parsedNewCandidate) {
          finalCandidatoId = parsedNewCandidate.id;
        } else {
          throw new Error('No se pudo crear el registro del candidato en la base de datos.');
        }
      }
    }

    // Parse JSON fields
    const parsedExp = typeof experiencias_json === 'string' ? JSON.parse(experiencias_json) : experiencias_json;
    const parsedEst = typeof estudios_json === 'string' ? JSON.parse(estudios_json) : estudios_json;
    const parsedIdi = typeof idiomas_json === 'string' ? JSON.parse(idiomas_json) : idiomas_json;
    const parsedHab = typeof habilidades_json === 'string' ? JSON.parse(habilidades_json) : habilidades_json;

    const cedulaVal = req.body.cedula || '';
    const fechaNacVal = req.body.fecha_nacimiento || '';

    // Construct unified profile payload for candidates table
    const perfilCompletoObj = {
      nombre_completo,
      telefono,
      cedula: cedulaVal,
      fecha_nacimiento: fechaNacVal,
      tieneEducacionFormal: parsedEst && parsedEst.length > 0 ? 'Si' : 'No',
      tieneEducacionInformal: parsedEst && parsedEst.some(e => e.nivel && e.nivel.includes('Cursos y Certificaciones')) ? 'Si' : 'No',
      estudios: parsedEst || [],
      experiencias: parsedExp || [],
      capacitaciones: [],
      idiomas: parsedIdi || [],
      habilidades: parsedHab || { tecnicas: [], interpersonales: [], otros: [] }
    };

    // Update unified profile in candidates table
    await pool.request()
      .input('ACCION', sql.VarChar(50), 'UPDATE_PERFIL')
      .input('DATA_JSON', sql.NVarChar, JSON.stringify({
        id: finalCandidatoId,
        perfil_completo_json: JSON.stringify(perfilCompletoObj),
        hv_archivo_nombre: hv_archivo_nombre,
        hv_archivo_ruta: hv_archivo_ruta
      }))
      .execute('spCandidatos');

    // Create postulation record referencing candidato_id
    const postulationResult = await pool.request()
      .input('ACCION', sql.VarChar(50), 'INSERT')
      .input('DATA_JSON', sql.VarChar, JSON.stringify({
        vacante_id,
        candidato_id: finalCandidatoId
      }))
      .execute('spPostulaciones');

    let parsedData = null;
    try {
      parsedData = postulationResult.recordset[0]["DATOS"] ? JSON.parse(postulationResult.recordset[0]["DATOS"]) : null;
    } catch (e) {
      parsedData = postulationResult.recordset[0]["DATOS"];
    }

    res.status(201).json({
      message: 'Postulación enviada exitosamente',
      data: parsedData
    });

  } catch (err) {
    if (uploadedFileRuta && fs.existsSync(uploadedFileRuta)) {
      try { fs.unlinkSync(uploadedFileRuta); } catch (e) {}
    }
    res.status(400).json({ error: err.message });
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
