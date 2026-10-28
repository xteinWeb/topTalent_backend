// Utilidades compartidas por la recuperación de contraseña de candidatos y de usuarios internos

// Evita que se usen los correos de recuperación para inundar el buzón de alguien: 1 solicitud por cuenta por minuto.
// Vive en memoria: se reinicia con el servidor y no se comparte entre instancias.
const ESPERA_MS = 60 * 1000;
const ultimaSolicitud = new Map();

function generarCodigo() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Devuelve true si se puede atender la solicitud (y la registra); false si llegó antes de que pase la espera
function registrarSolicitud(clave) {
  const ahora = Date.now();
  const ultima = ultimaSolicitud.get(clave);
  if (ultima && ahora - ultima < ESPERA_MS) return false;
  ultimaSolicitud.set(clave, ahora);
  return true;
}

function liberarSolicitud(clave) {
  ultimaSolicitud.delete(clave);
}

// Los errores de negocio (código incorrecto/expirado) llegan como THROW 50000 desde el SP
function mensajeErrorNegocio(err) {
  const info = err && err.originalError && err.originalError.info;
  return info && info.number === 50000 ? info.message : null;
}

module.exports = { generarCodigo, registrarSolicitud, liberarSolicitud, mensajeErrorNegocio };
