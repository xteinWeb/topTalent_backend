const { poolPromise, sql } = require('../config/db');

// Registro de Candidato
exports.registro = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Faltan campos obligatorios: email y password' });
    }

    const pool = await poolPromise;
    pool.request()
      .input('ACCION', sql.VarChar(50), 'INSERT')
      .input('DATA_JSON', sql.VarChar, JSON.stringify({ email, password_hash: password })) // En este mock/desarrollo local usamos la contraseña directamente
      .execute('spCandidatos')
      .then(function (recordSet) {
        let parsedData = null;
        try {
          parsedData = recordSet.recordset[0]["DATOS"] ? JSON.parse(recordSet.recordset[0]["DATOS"]) : null;
        } catch (e) {
          parsedData = recordSet.recordset[0]["DATOS"];
        }

        res.status(201).json({
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
      .then(function (recordSet) {
        let parsedData = null;
        try {
          parsedData = recordSet.recordset[0]["DATOS"] ? JSON.parse(recordSet.recordset[0]["DATOS"]) : null;
        } catch (e) {
          parsedData = recordSet.recordset[0]["DATOS"];
        }

        if (!parsedData || parsedData.password_hash !== password) {
          return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
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
