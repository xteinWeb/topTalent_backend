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
