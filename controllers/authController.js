const { poolPromise, sql } = require('../config/db');
const bcrypt = require('bcryptjs');
const { firmarTokenAdmin, esSuperAdmin, empresaDelUsuario, ROLES } = require('../middleware/auth');
const { sendPasswordResetEmail } = require('../utils/mailer');
const { generarCodigo, registrarSolicitud, liberarSolicitud, mensajeErrorNegocio } = require('../utils/recuperacion');

// Respuesta de sesión iniciada (login y restablecimiento de contraseña)
function respuestaSesion(usuario) {
  return {
    success: true,
    token: firmarTokenAdmin(usuario),
    user: {
      id: usuario.id,
      username: usuario.username,
      nombre: usuario.nombre,
      email: usuario.email,
      empresa_id: usuario.empresa_id,
      empresa_nombre: usuario.empresa_nombre,
      role: usuario.rol || 'Administrator',
      area: usuario.area || ''
    }
  };
}

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

        res.json(respuestaSesion(parsedData));
      })
      .catch((err) => {
        console.error('Error in admin login:', err);
        res.status(500).json({ error: err.originalError ? err.originalError.info.message : err.message });
      });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// POST solicitar código de recuperación de contraseña (por usuario o correo)
exports.solicitarRecuperacion = async (req, res) => {
  // Respuesta idéntica exista o no la cuenta, para no revelar qué usuarios están registrados
  const respuestaGenerica = {
    success: true,
    message: 'Si el usuario existe y tiene un correo registrado, enviamos a ese correo un código para restablecer la contraseña.'
  };

  try {
    const identificador = String(req.body.usuario || '').trim();
    if (!identificador) {
      return res.status(400).json({ error: 'Debe ingresar su usuario o correo electrónico.' });
    }

    if (!registrarSolicitud(`admin:${identificador.toLowerCase()}`)) {
      return res.status(429).json({ error: 'Ya enviamos un código hace poco. Espere un minuto antes de solicitar otro.' });
    }

    const codigo = generarCodigo();
    const pool = await poolPromise;
    const result = await pool.request()
      .input('ACCION', sql.VarChar(50), 'SOLICITAR_RECUPERACION')
      .input('DATA_JSON', sql.VarChar, JSON.stringify({ username: identificador, codigo_recuperacion: codigo }))
      .execute('spUsuariosAdmin');

    const raw = result.recordset[0] && result.recordset[0]["DATOS"];
    const usuario = raw ? JSON.parse(raw) : null;
    if (usuario && usuario.email) {
      try {
        await sendPasswordResetEmail(usuario.email, codigo);
      } catch (mailErr) {
        console.error('Error al enviar el correo de recuperación (admin):', mailErr);
      }
    }

    res.json(respuestaGenerica);
  } catch (err) {
    console.error('Error al solicitar recuperación de contraseña (admin):', err);
    res.status(500).json({ error: 'No se pudo procesar la solicitud. Intente nuevamente.' });
  }
};

// POST restablecer contraseña con el código recibido por correo
exports.restablecerPassword = async (req, res) => {
  try {
    const identificador = String(req.body.usuario || '').trim();
    const codigo = String(req.body.codigo || '').trim();
    const passwordNuevo = req.body.password_nuevo || '';

    if (!identificador || !codigo || !passwordNuevo) {
      return res.status(400).json({ error: 'Faltan campos obligatorios: usuario, codigo y password_nuevo' });
    }
    if (passwordNuevo.length < 6) {
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres.' });
    }

    const pool = await poolPromise;
    const result = await pool.request()
      .input('ACCION', sql.VarChar(50), 'RESTABLECER_PASSWORD')
      .input('DATA_JSON', sql.VarChar, JSON.stringify({
        username: identificador,
        codigo_recuperacion: codigo,
        password_hash: await bcrypt.hash(passwordNuevo, 10)
      }))
      .execute('spUsuariosAdmin');

    const raw = result.recordset[0] && result.recordset[0]["DATOS"];
    const usuario = raw ? JSON.parse(raw) : null;
    if (!usuario) {
      return res.status(400).json({ error: 'El código de recuperación no es válido o ya expiró. Solicite uno nuevo.' });
    }

    liberarSolicitud(`admin:${identificador.toLowerCase()}`);
    res.json({ ...respuestaSesion(usuario), message: 'Contraseña actualizada correctamente.' });
  } catch (err) {
    const mensaje = mensajeErrorNegocio(err);
    if (mensaje) {
      return res.status(400).json({ error: mensaje });
    }
    console.error('Error al restablecer contraseña (admin):', err);
    res.status(500).json({ error: 'No se pudo restablecer la contraseña. Intente nuevamente.' });
  }
};

// GET líderes de área activos de la empresa (para asignarlos como responsables de perfiles de cargo)
exports.listarLideres = async (req, res) => {
  try {
    const empresa_id = empresaDelUsuario(req);
    const pool = await poolPromise;
    const result = await pool.request()
      .input('ACCION', sql.VarChar(50), 'SELECT_ALL')
      .input('DATA_JSON', sql.VarChar, empresa_id ? JSON.stringify({ empresa_id }) : null)
      .execute('spUsuariosAdmin');

    const raw = result.recordset[0] && result.recordset[0]["DATOS"];
    const usuarios = raw ? JSON.parse(raw) : [];
    const lideres = usuarios
      .filter(u => (u.activo === true || u.activo === 1) && ROLES.LIDER_AREA.includes(String(u.rol || '').toUpperCase()))
      .map(u => ({ id: u.id, nombre: u.nombre, area: u.area || '', email: u.email || '' }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

    res.json({ data: lideres });
  } catch (err) {
    console.error('Error al listar líderes de área:', err);
    res.status(500).json({ error: err.message });
  }
};

// GET admin profile & company info
exports.getProfile = async (req, res) => {
  try {
    const { id } = req.params;
    if (String(id).toLowerCase() !== String(req.user.id).toLowerCase() && !esSuperAdmin(req.user)) {
      return res.status(403).json({ error: 'No tiene permisos para consultar este usuario.' });
    }
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
    const { nombre, email, password_actual, password_nuevo } = req.body;
    // El usuario a modificar es siempre el de la sesión, nunca uno enviado en el body
    const id = req.user.id;

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
