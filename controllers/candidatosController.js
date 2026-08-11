const { poolPromise, sql } = require('../config/db');
const bcrypt = require('bcryptjs');
const { sendVerificationEmail } = require('../utils/mailer');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure Multer storage for candidate resume uploads (perfil page)
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
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    if (extname) {
      return cb(null, true);
    }
    cb(new Error('Solo se permiten archivos PDF, DOC o DOCX.'));
  }
}).single('hv_archivo');

exports.uploadMiddleware = upload;

// Registro de Candidato
exports.registro = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Faltan campos obligatorios: email y password' });
    }

    // Hash the password
    const passwordHash = await bcrypt.hash(password, 10);
    // Generate a 6-digit verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    console.log(`=========================================`);
    console.log(`CÓDIGO DE VERIFICACIÓN ENVIADO A: ${email} -> ${verificationCode}`);
    console.log(`=========================================`);

    const pool = await poolPromise;
    pool.request()
      .input('ACCION', sql.VarChar(50), 'INSERT')
      .input('DATA_JSON', sql.VarChar, JSON.stringify({ 
        email, 
        password_hash: passwordHash,
        codigo_verificacion: verificationCode,
        verificado: 0
      }))
      .execute('spCandidatos')
      .then(async function (recordSet) {
        try {
          await sendVerificationEmail(email, verificationCode);
          console.log(`Correo de verificación enviado exitosamente a: ${email}`);
        } catch (mailErr) {
          console.error('Error al enviar el correo de verificación:', mailErr);
        }
        
        res.status(201).json({
          success: true,
          message: 'Código de verificación enviado al correo.',
          email: email
        });
      })
      .catch((err) => {
        console.error(err);
        res.status(500).json({ error: err.originalError ? err.originalError.info.message : err.message });
      });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Login de Candidato
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Faltan campos obligatorios: email y password' });
    }

    const pool = await poolPromise;
    pool.request()
      .input('ACCION', sql.VarChar(50), 'SELECT_BY_EMAIL')
      .input('DATA_JSON', sql.VarChar, JSON.stringify({ email }))
      .execute('spCandidatos')
      .then(async function (recordSet) {
        let parsedData = null;
        try {
          parsedData = recordSet.recordset[0]["DATOS"] ? JSON.parse(recordSet.recordset[0]["DATOS"]) : null;
        } catch (e) {
          parsedData = recordSet.recordset[0]["DATOS"];
        }

        if (!parsedData) {
          return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
        }

        // Compare password hash
        const isMatch = await bcrypt.compare(password, parsedData.password_hash);
        if (!isMatch) {
          return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
        }

        // Check if verified
        if (parsedData.verificado !== true && parsedData.verificado !== 1) {
          return res.status(403).json({ 
            error: 'Debes verificar tu correo electrónico antes de iniciar sesión.',
            unverified: true,
            email: parsedData.email
          });
        }

        res.json({
          success: true,
          token: `candidato-mock-token-${parsedData.id}`,
          user: {
            id: parsedData.id,
            email: parsedData.email,
            role: 'Candidato'
          }
        });
      })
      .catch((err) => {
        console.error(err);
        res.status(500).json({ error: err.message });
      });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Verificar Código de Candidato
exports.verificar = async (req, res) => {
  try {
    const { email, codigo } = req.body;

    if (!email || !codigo) {
      return res.status(400).json({ error: 'Faltan campos obligatorios: email y codigo' });
    }

    const pool = await poolPromise;
    pool.request()
      .input('ACCION', sql.VarChar(50), 'VERIFICAR_CORREO')
      .input('DATA_JSON', sql.VarChar, JSON.stringify({ email, codigo_verificacion: codigo }))
      .execute('spCandidatos')
      .then(function (recordSet) {
        let parsedData = null;
        try {
          parsedData = recordSet.recordset[0]["DATOS"] ? JSON.parse(recordSet.recordset[0]["DATOS"]) : null;
        } catch (e) {
          parsedData = recordSet.recordset[0]["DATOS"];
        }

        if (!parsedData) {
          return res.status(400).json({ error: 'Código de verificación inválido.' });
        }

        res.json({
          success: true,
          message: 'Cuenta verificada correctamente',
          token: `candidato-mock-token-${parsedData.id}`,
          user: {
            id: parsedData.id,
            email: parsedData.email,
            role: 'Candidato'
          }
        });
      })
      .catch((err) => {
        console.error(err);
        res.status(400).json({ error: err.originalError ? err.originalError.info.message : err.message });
      });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Obtener Perfil de Candidato
exports.getPerfil = async (req, res) => {
  try {
    const id = req.headers.authorization ? req.headers.authorization.replace('Bearer candidato-mock-token-', '') : null;

    if (!id) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    const pool = await poolPromise;
    pool.request()
      .input('ACCION', sql.VarChar(50), 'SELECT_BY_ID')
      .input('DATA_JSON', sql.NVarChar, JSON.stringify({ id }))
      .execute('spCandidatos')
      .then(function (recordSet) {
        let parsedData = null;
        try {
          parsedData = recordSet.recordset[0]["DATOS"] ? JSON.parse(recordSet.recordset[0]["DATOS"]) : null;
        } catch (e) {
          parsedData = recordSet.recordset[0]["DATOS"];
        }

        if (!parsedData) {
          return res.status(404).json({ error: 'Candidato no encontrado' });
        }

        res.json({
          data: parsedData
        });
      })
      .catch((err) => {
        console.error(err);
        res.status(500).json({ error: err.message });
      });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Actualizar Perfil de Candidato
exports.updatePerfil = async (req, res) => {
  let uploadedFilePath = req.file ? req.file.path : null;
  try {
    const id = req.headers.authorization ? req.headers.authorization.replace('Bearer candidato-mock-token-', '') : null;

    if (!id) {
      if (uploadedFilePath && fs.existsSync(uploadedFilePath)) fs.unlinkSync(uploadedFilePath);
      return res.status(401).json({ error: 'No autorizado' });
    }

    const perfil_completo_json = req.body.perfil_completo_json
      ? (typeof req.body.perfil_completo_json === 'string' ? JSON.parse(req.body.perfil_completo_json) : req.body.perfil_completo_json)
      : undefined;

    // Only overwrite the resume file fields when a new file was actually uploaded;
    // otherwise leave the candidate's existing file untouched.
    const hv_archivo_nombre = req.file ? req.file.originalname : undefined;
    const hv_archivo_ruta = req.file ? req.file.filename : undefined;

    const pool = await poolPromise;
    pool.request()
      .input('ACCION', sql.VarChar(50), 'UPDATE_PERFIL')
      .input('DATA_JSON', sql.NVarChar, JSON.stringify({
        id,
        perfil_completo_json,
        hv_archivo_nombre,
        hv_archivo_ruta
      }))
      .execute('spCandidatos')
      .then(function (recordSet) {
        res.json({
          message: 'Perfil actualizado exitosamente'
        });
      })
      .catch((err) => {
        console.error(err);
        if (uploadedFilePath && fs.existsSync(uploadedFilePath)) fs.unlinkSync(uploadedFilePath);
        res.status(500).json({ error: err.message });
      });
  } catch (err) {
    if (uploadedFilePath && fs.existsSync(uploadedFilePath)) fs.unlinkSync(uploadedFilePath);
    res.status(400).json({ error: err.message });
  }
};
