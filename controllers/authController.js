const { poolPromise, sql } = require('../config/db');
const bcrypt = require('bcryptjs');

// POST admin login handler
exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Debe ingresar usuario y contraseña' });
    }

    const pool = await poolPromise;
    pool.request()
      .input('ACCION', sql.VarChar(50), 'SELECT_BY_USERNAME')
      .input('DATA_JSON', sql.VarChar, JSON.stringify({ username }))
      .execute('spUsuariosAdmin')
      .then(async function (recordSet) {
        let parsedData = null;
        try {
          const raw = recordSet.recordset[0]["DATOS"];
          parsedData = raw ? JSON.parse(raw) : null;
        } catch (e) {
          parsedData = null;
        }

        if (!parsedData) {
          return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
        }

        if (parsedData.activo !== true && parsedData.activo !== 1) {
          return res.status(403).json({ error: 'Este usuario se encuentra inactivo. Contacte al administrador del sistema.' });
        }

        // Compare bcrypt password
        const isMatch = await bcrypt.compare(password, parsedData.password_hash);
        if (!isMatch) {
          return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
        }

        res.json({
          success: true,
          token: `artdecon-admin-token-${parsedData.id}`,
          user: {
            id: parsedData.id,
            username: parsedData.username,
            nombre: parsedData.nombre,
            email: parsedData.email,
            empresa_id: parsedData.empresa_id,
            empresa_nombre: parsedData.empresa_nombre,
            role: parsedData.rol || 'Administrator'
          }
        });
      })
      .catch((err) => {
        console.error('Error in admin login:', err);
        res.status(500).json({ error: err.originalError ? err.originalError.info.message : err.message });
      });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// GET admin profile & company info
exports.getProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await poolPromise;
    pool.request()
      .input('ACCION', sql.VarChar(50), 'SELECT_BY_ID')
      .input('DATA_JSON', sql.VarChar, JSON.stringify({ id }))
      .execute('spUsuariosAdmin')
      .then(function (recordSet) {
        let parsedData = null;
        try {
          const raw = recordSet.recordset[0]["DATOS"];
          parsedData = raw ? JSON.parse(raw) : null;
        } catch (e) {
          parsedData = null;
        }

        if (!parsedData) {
          return res.status(404).json({ error: 'Usuario administrador no encontrado' });
        }

        delete parsedData.password_hash;

        res.json({
          data: parsedData
        });
      })
      .catch((err) => {
        console.error('Error fetching admin profile:', err);
        res.status(500).json({ error: err.message });
      });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// PUT update admin credentials and profile
exports.updateCredentials = async (req, res) => {
  try {
    const { id, nombre, email, password_actual, password_nuevo } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'Identificador de usuario es obligatorio.' });
    }

    const pool = await poolPromise;
    // 1. Fetch current user to verify identity and old password
    const userResult = await pool.request()
      .input('ACCION', sql.VarChar(50), 'SELECT_BY_ID')
      .input('DATA_JSON', sql.VarChar, JSON.stringify({ id }))
      .execute('spUsuariosAdmin');

    let currentUser = null;
    try {
      const raw = userResult.recordset[0]["DATOS"];
      currentUser = raw ? JSON.parse(raw) : null;
    } catch (e) {
      currentUser = null;
    }

    if (!currentUser) {
      return res.status(404).json({ error: 'Usuario administrador no encontrado.' });
    }

    let newPasswordHash = null;

    // 2. If password change is requested, validate current password
    if (password_nuevo) {
      if (!password_actual) {
        return res.status(400).json({ error: 'Debe ingresar la contraseña actual para establecer una nueva.' });
      }
      if (password_nuevo.length < 6) {
        return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres.' });
      }

      const isCurrentMatch = await bcrypt.compare(password_actual, currentUser.password_hash);
      if (!isCurrentMatch) {
        return res.status(401).json({ error: 'La contraseña actual ingresada es incorrecta.' });
      }

      newPasswordHash = await bcrypt.hash(password_nuevo, 10);
    }

    // 3. Update profile and credentials
    const updatePayload = {
      id,
      nombre: nombre ? nombre.trim() : currentUser.nombre,
      email: email ? email.trim() : currentUser.email,
      password_hash: newPasswordHash || currentUser.password_hash
    };

    const updateResult = await pool.request()
      .input('ACCION', sql.VarChar(50), 'UPDATE_PERFIL')
      .input('DATA_JSON', sql.VarChar, JSON.stringify(updatePayload))
      .execute('spUsuariosAdmin');

    let updatedUser = null;
    try {
      const raw = updateResult.recordset[0]["DATOS"];
      updatedUser = raw ? JSON.parse(raw) : null;
    } catch (e) {
      updatedUser = null;
    }

    res.json({
      success: true,
      message: 'Credenciales y perfil actualizados exitosamente.',
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        nombre: updatedUser.nombre,
        email: updatedUser.email,
        empresa_id: updatedUser.empresa_id,
        empresa_nombre: updatedUser.empresa_nombre,
        role: updatedUser.rol || 'Administrator'
      }
    });
  } catch (err) {
    console.error('Error updating credentials:', err);
    res.status(400).json({ error: err.message });
  }
};
