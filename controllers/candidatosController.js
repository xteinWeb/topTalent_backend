const { poolPromise, sql } = require('../config/db');
const bcrypt = require('bcryptjs');
const { sendVerificationEmail } = require('../utils/mailer');

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
  try {
    const id = req.headers.authorization ? req.headers.authorization.replace('Bearer candidato-mock-token-', '') : null;
    const { perfil_completo_json, hv_archivo_nombre, hv_archivo_ruta } = req.body;

    if (!id) {
      return res.status(401).json({ error: 'No autorizado' });
    }

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
        res.status(500).json({ error: err.message });
      });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
