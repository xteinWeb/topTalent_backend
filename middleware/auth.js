const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  // Sin secreto no se puede firmar ni verificar ningún token: mejor no arrancar que arrancar inseguro.
  throw new Error('JWT_SECRET no está configurado. Defínalo en el .env o en ecosystem.config.js.');
}

const ADMIN_EXPIRES_IN = process.env.JWT_ADMIN_EXPIRES_IN || '8h';
const CANDIDATO_EXPIRES_IN = process.env.JWT_CANDIDATO_EXPIRES_IN || '24h';

// Grupos de roles de usuarios_admin.rol (se comparan en mayúsculas, igual que en el frontend)
const ROLES = {
  SUPERADMIN: ['SUPERADMIN', 'ADMIN', 'ADMINISTRATOR'],
  GERENCIA: ['GERENCIA'],
  TALENTO_HUMANO: ['TALENTO_HUMANO', 'TALENTO'],
  LIDER_AREA: ['LIDER_AREA']
};

function normalizarRol(rol) {
  return String(rol || '').trim().toUpperCase();
}

function esSuperAdmin(user) {
  return !!user && user.tipo === 'admin' && ROLES.SUPERADMIN.includes(normalizarRol(user.rol));
}

function esLiderArea(user) {
  return !!user && user.tipo === 'admin' && ROLES.LIDER_AREA.includes(normalizarRol(user.rol));
}

// SQL Server devuelve los UNIQUEIDENTIFIER en mayúsculas; se comparan sin distinguir mayúsculas
function mismoId(a, b) {
  return !!a && !!b && String(a).toLowerCase() === String(b).toLowerCase();
}

function firmarTokenAdmin(usuario) {
  return jwt.sign(
    {
      tipo: 'admin',
      rol: usuario.rol || 'SUPERADMIN',
      empresa_id: usuario.empresa_id || null
    },
    JWT_SECRET,
    { subject: String(usuario.id), expiresIn: ADMIN_EXPIRES_IN }
  );
}

function firmarTokenCandidato(candidato) {
  return jwt.sign(
    { tipo: 'candidato' },
    JWT_SECRET,
    { subject: String(candidato.id), expiresIn: CANDIDATO_EXPIRES_IN }
  );
}

// Devuelve el payload del token Bearer, null si no viene, o lanza si es inválido/expirado
function leerToken(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  const payload = jwt.verify(header.slice(7).trim(), JWT_SECRET);
  return { id: payload.sub, tipo: payload.tipo, rol: payload.rol, empresa_id: payload.empresa_id };
}

function autenticar(tipoRequerido) {
  return (req, res, next) => {
    let user;
    try {
      user = leerToken(req);
    } catch (err) {
      return res.status(401).json({ error: 'Sesión inválida o expirada. Inicie sesión nuevamente.' });
    }
    if (!user || user.tipo !== tipoRequerido) {
      return res.status(401).json({ error: 'No autorizado. Inicie sesión para continuar.' });
    }
    req.user = user;
    next();
  };
}

// Exige un usuario administrativo; si se pasan grupos de ROLES, el rol debe pertenecer a alguno.
// SUPERADMIN siempre tiene acceso.
function requireAdmin(...grupos) {
  const permitidos = grupos.flatMap(g => ROLES[g] || [g]);
  const verificarToken = autenticar('admin');
  return (req, res, next) => {
    verificarToken(req, res, () => {
      if (permitidos.length > 0 && !esSuperAdmin(req.user) && !permitidos.includes(normalizarRol(req.user.rol))) {
        return res.status(403).json({ error: 'No tiene permisos para realizar esta acción.' });
      }
      next();
    });
  };
}

const requireCandidato = autenticar('candidato');

// Adjunta req.user si viene un token válido, pero no bloquea rutas públicas cuando no hay token.
// Un token presente pero inválido se ignora para no romper el flujo público.
function optionalAuth(req, res, next) {
  try {
    req.user = leerToken(req);
  } catch (err) {
    req.user = null;
  }
  next();
}

// Empresa a consultar: el superadmin puede elegirla por query/header; el resto queda limitado a la suya.
function empresaDelUsuario(req) {
  if (esSuperAdmin(req.user)) {
    return req.query.empresa_id || req.headers['x-empresa-id'] || null;
  }
  return req.user.empresa_id || null;
}

module.exports = {
  ROLES,
  firmarTokenAdmin,
  firmarTokenCandidato,
  requireAdmin,
  requireCandidato,
  optionalAuth,
  esSuperAdmin,
  esLiderArea,
  mismoId,
  empresaDelUsuario
};
