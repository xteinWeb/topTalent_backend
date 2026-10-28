const { poolPromise, sql } = require('../config/db');
const bcrypt = require('bcryptjs');
const { esSuperAdmin, mismoId, ROLES } = require('../middleware/auth');
const { mensajeErrorNegocio } = require('../utils/recuperacion');

// Roles que se pueden asignar desde la gestión de usuarios
const ROLES_ASIGNABLES = {
  SUPERADMIN: 'Superadmin',
  GERENCIA: 'Gerencia',
  TALENTO_HUMANO: 'Talento Humano',
  LIDER_AREA: 'Líder de área'
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function rolNormalizado(rol) {
  const r = String(rol || '').trim().toUpperCase();
  if (ROLES.SUPERADMIN.includes(r)) return 'SUPERADMIN';
  if (ROLES.TALENTO_HUMANO.includes(r)) return 'TALENTO_HUMANO';
  return r;
}

// Solo un superadmin puede crear, editar o asignar el rol de superadmin
function puedeGestionarRol(req, rol) {
  return rolNormalizado(rol) !== 'SUPERADMIN' || esSuperAdmin(req.user);
}

async function ejecutar(pool, accion, data) {
  const result = await pool.request()
    .input('ACCION', sql.VarChar(50), accion)
    .input('DATA_JSON', sql.NVarChar(sql.MAX), data ? JSON.stringify(data) : null)
    .execute('spUsuariosAdmin');
  const raw = result.recordset[0] && result.recordset[0]['DATOS'];
  return raw ? JSON.parse(raw) : null;
}

function publico(u) {
  return {
    id: u.id,
    nombre: u.nombre,
    username: u.username,
    email: u.email || '',
    rol: rolNormalizado(u.rol),
    area: u.area || '',
    activo: u.activo === true || u.activo === 1,
    fecha_creacion: u.fecha_creacion,
    fecha_actualizacion: u.fecha_actualizacion
  };
}

// Valida y limpia los campos comunes de creación/edición. Devuelve { datos } o { error }.
function validarCampos(body, { creando }) {
  const datos = {};
  if (creando || body.nombre !== undefined) {
    datos.nombre = String(body.nombre || '').trim();
    if (!datos.nombre) return { error: 'El nombre es obligatorio.' };
  }
  if (creando || body.email !== undefined) {
    datos.email = String(body.email || '').trim().toLowerCase();
    // El correo es necesario para recuperar la contraseña
    if (!EMAIL_RE.test(datos.email)) return { error: 'Ingrese un correo electrónico válido.' };
  }
  if (creando || body.rol !== undefined) {
    datos.rol = rolNormalizado(body.rol);
    if (!ROLES_ASIGNABLES[datos.rol]) return { error: 'Seleccione un rol válido.' };
  }
  if (body.area !== undefined) {
    datos.area = String(body.area || '').trim();
  }
  if (creando || body.password) {
    const password = String(body.password || '');
    if (password.length < 6) return { error: 'La contraseña debe tener al menos 6 caracteres.' };
    datos.password = password;
  }
  if (datos.rol === 'LIDER_AREA' && creando && !datos.area) {
    return { error: 'Indique el área del líder.' };
  }
  return { datos };
}

// GET usuarios administrativos de la empresa
exports.listar = async (req, res) => {
  try {
    const pool = await poolPromise;
    const usuarios = (await ejecutar(pool, 'SELECT_ALL', { empresa_id: req.user.empresa_id })) || [];
    const data = usuarios
      .map(publico)
      .sort((a, b) => (b.activo - a.activo) || a.nombre.localeCompare(b.nombre, 'es'));
    res.json({ data, roles: Object.entries(ROLES_ASIGNABLES).map(([id, nombre]) => ({ id, nombre })) });
  } catch (err) {
    console.error('Error al listar usuarios:', err);
    res.status(500).json({ error: err.message });
  }
};

// POST crear usuario administrativo en la empresa de quien lo crea
exports.crear = async (req, res) => {
  try {
    const { datos, error } = validarCampos(req.body, { creando: true });
    if (error) return res.status(400).json({ error });

    const username = String(req.body.username || '').trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,50}$/.test(username)) {
      return res.status(400).json({ error: 'El usuario debe tener entre 3 y 50 caracteres: letras, números, punto, guion o guion bajo.' });
    }
    if (!puedeGestionarRol(req, datos.rol)) {
      return res.status(403).json({ error: 'Solo un superadmin puede crear usuarios superadmin.' });
    }

    const pool = await poolPromise;
    const creado = await ejecutar(pool, 'INSERT', {
      empresa_id: req.user.empresa_id,
      nombre: datos.nombre,
      username,
      email: datos.email,
      password_hash: await bcrypt.hash(datos.password, 10),
      rol: datos.rol,
      area: datos.area || null,
      activo: 1
    });
    res.status(201).json({ data: publico({ ...creado, activo: true }) });
  } catch (err) {
    const negocio = mensajeErrorNegocio(err);
    if (negocio) return res.status(409).json({ error: negocio });
    console.error('Error al crear usuario:', err);
    res.status(500).json({ error: err.message });
  }
};

// PUT editar datos, rol, estado o contraseña de un usuario de la empresa
exports.actualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await poolPromise;
    const actual = await ejecutar(pool, 'SELECT_BY_ID', { id });
    if (!actual || (!esSuperAdmin(req.user) && actual.empresa_id !== req.user.empresa_id)) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }
    if (!puedeGestionarRol(req, actual.rol)) {
      return res.status(403).json({ error: 'Solo un superadmin puede modificar usuarios superadmin.' });
    }

    const { datos, error } = validarCampos(req.body, { creando: false });
    if (error) return res.status(400).json({ error });
    if (datos.rol && !puedeGestionarRol(req, datos.rol)) {
      return res.status(403).json({ error: 'Solo un superadmin puede asignar el rol de superadmin.' });
    }

    const activo = req.body.activo === undefined ? undefined : !!req.body.activo;
    // Nadie se quita a sí mismo el acceso ni los permisos
    if (mismoId(id, req.user.id)) {
      if (activo === false) return res.status(400).json({ error: 'No puede desactivar su propio usuario.' });
      if (datos.rol && datos.rol !== rolNormalizado(actual.rol)) {
        return res.status(400).json({ error: 'No puede cambiar su propio rol.' });
      }
    }

    const payload = { id };
    if (datos.nombre !== undefined) payload.nombre = datos.nombre;
    if (datos.email !== undefined) payload.email = datos.email;
    if (datos.rol !== undefined) payload.rol = datos.rol;
    if (datos.area !== undefined) payload.area = datos.area;
    if (activo !== undefined) payload.activo = activo ? 1 : 0;
    if (datos.password) payload.password_hash = await bcrypt.hash(datos.password, 10);

    const actualizado = await ejecutar(pool, 'UPDATE', payload);
    res.json({ data: publico(actualizado) });
  } catch (err) {
    const negocio = mensajeErrorNegocio(err);
    if (negocio) return res.status(409).json({ error: negocio });
    console.error('Error al actualizar usuario:', err);
    res.status(500).json({ error: err.message });
  }
};
