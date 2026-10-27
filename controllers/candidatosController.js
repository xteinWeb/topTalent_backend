const { poolPromise, sql } = require('../config/db');
const bcrypt = require('bcryptjs');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/mailer');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { VERSION_TRATAMIENTO_DATOS } = require('../config/legal');
const { firmarTokenCandidato } = require('../middleware/auth');
const { generarCodigo, registrarSolicitud, liberarSolicitud, mensajeErrorNegocio } = require('../utils/recuperacion');

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
  defParamCharset: 'utf8', // nombres de archivo con tildes/ñ (por defecto multer los lee como latin1)
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
    const { email, password, acepto_tratamiento_datos } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Faltan campos obligatorios: email y password' });
    }

    if (acepto_tratamiento_datos !== true && acepto_tratamiento_datos !== 'true') {
      return res.status(400).json({ error: 'Debe aceptar el tratamiento de datos personales para registrarse.' });
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
        verificado: 0,
        acepto_tratamiento_datos: true,
        version_tratamiento_datos: VERSION_TRATAMIENTO_DATOS
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
          token: firmarTokenCandidato(parsedData),
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
          token: firmarTokenCandidato(parsedData),
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

// Solicitar código de recuperación de contraseña
exports.solicitarRecuperacion = async (req, res) => {
  // Respuesta idéntica exista o no la cuenta, para no revelar qué correos están registrados
  const respuestaGenerica = {
    success: true,
    message: 'Si el correo está registrado, te enviamos un código para restablecer tu contraseña.'
  };

  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ error: 'Debe ingresar su correo electrónico.' });
    }

    if (!registrarSolicitud(`candidato:${email}`)) {
      return res.status(429).json({ error: 'Ya enviamos un código hace poco. Espera un minuto antes de solicitar otro.' });
    }

    const codigo = generarCodigo();
    const pool = await poolPromise;
    const result = await pool.request()
      .input('ACCION', sql.VarChar(50), 'SOLICITAR_RECUPERACION')
      .input('DATA_JSON', sql.VarChar, JSON.stringify({ email, codigo_recuperacion: codigo }))
      .execute('spCandidatos');

    const raw = result.recordset[0] && result.recordset[0]["DATOS"];
    if (raw) {
      try {
        await sendPasswordResetEmail(email, codigo);
      } catch (mailErr) {
        console.error('Error al enviar el correo de recuperación:', mailErr);
      }
    }

    res.json(respuestaGenerica);
  } catch (err) {
    console.error('Error al solicitar recuperación de contraseña:', err);
    res.status(500).json({ error: 'No se pudo procesar la solicitud. Intente nuevamente.' });
  }
};

// Restablecer contraseña con el código recibido por correo
exports.restablecerPassword = async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const codigo = String(req.body.codigo || '').trim();
    const passwordNuevo = req.body.password_nuevo || '';

    if (!email || !codigo || !passwordNuevo) {
      return res.status(400).json({ error: 'Faltan campos obligatorios: email, codigo y password_nuevo' });
    }
    if (passwordNuevo.length < 6) {
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres.' });
    }

    const passwordHash = await bcrypt.hash(passwordNuevo, 10);
    const pool = await poolPromise;
    const result = await pool.request()
      .input('ACCION', sql.VarChar(50), 'RESTABLECER_PASSWORD')
      .input('DATA_JSON', sql.VarChar, JSON.stringify({ email, codigo_recuperacion: codigo, password_hash: passwordHash }))
      .execute('spCandidatos');

    const raw = result.recordset[0] && result.recordset[0]["DATOS"];
    const candidato = raw ? JSON.parse(raw) : null;
    if (!candidato) {
      return res.status(400).json({ error: 'El código de recuperación no es válido o ya expiró. Solicita uno nuevo.' });
    }

    liberarSolicitud(`candidato:${email}`);
    // Igual que tras verificar el correo: el candidato queda con sesión iniciada
    res.json({
      success: true,
      message: 'Contraseña actualizada correctamente.',
      token: firmarTokenCandidato(candidato),
      user: {
        id: candidato.id,
        email: candidato.email,
        role: 'Candidato'
      }
    });
  } catch (err) {
    const mensaje = mensajeErrorNegocio(err);
    if (mensaje) {
      return res.status(400).json({ error: mensaje });
    }
    console.error('Error al restablecer contraseña:', err);
    res.status(500).json({ error: 'No se pudo restablecer la contraseña. Intente nuevamente.' });
  }
};

// Obtener Perfil de Candidato
exports.getPerfil = async (req, res) => {
  try {
    const id = req.user.id;

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
    const id = req.user.id;

    const perfil_completo_json = req.body.perfil_completo_json
      ? (typeof req.body.perfil_completo_json === 'string' ? JSON.parse(req.body.perfil_completo_json) : req.body.perfil_completo_json)
      : undefined;

    // perfil_completo_json fully replaces the stored profile (no merge), so a save with
    // blank identity fields would silently wipe out previously valid data for this
    // candidate and every application already linked to them.
    if (perfil_completo_json && (
      !String(perfil_completo_json.nombre_completo || '').trim() ||
      !String(perfil_completo_json.telefono || '').trim() ||
      !String(perfil_completo_json.cedula || '').trim() ||
      !String(perfil_completo_json.fecha_nacimiento || '').trim()
    )) {
      if (uploadedFilePath && fs.existsSync(uploadedFilePath)) fs.unlinkSync(uploadedFilePath);
      return res.status(400).json({ error: 'Debe completar nombre, teléfono, cédula y fecha de nacimiento antes de guardar el perfil.' });
    }

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
