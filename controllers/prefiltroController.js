const crypto = require('crypto');
const { poolPromise, sql } = require('../config/db');
const { esSuperAdmin } = require('../middleware/auth');
const {
  PREGUNTAS_PREFILTRO,
  RESULTADOS_PREFILTRO,
  VIGENCIA_ENLACE_HORAS,
  validarRespuestasPrefiltro
} = require('../config/prefiltro');

// Token del enlace: 32 bytes aleatorios en base64url (43 caracteres). En BD solo se guarda su SHA-256.
const FORMATO_TOKEN = /^[A-Za-z0-9_-]{43}$/;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function leerDatos(result) {
  const raw = result.recordset[0] && result.recordset[0]["DATOS"];
  return raw ? JSON.parse(raw) : null;
}

function prefiltroVacio() {
  return { intentos: [], respuestas: null, canal: null, respondido_fecha: null, resultado: null, observaciones: '' };
}

function normalizarPrefiltro(valor) {
  const base = prefiltroVacio();
  if (!valor) return base;
  const datos = typeof valor === 'string' ? JSON.parse(valor) : valor;
  return { ...base, ...datos, intentos: Array.isArray(datos.intentos) ? datos.intentos : [] };
}

async function obtenerPostulacion(pool, id) {
  const result = await pool.request()
    .input('ACCION', sql.VarChar(50), 'SELECT_PREFILTRO')
    .input('DATA_JSON', sql.VarChar, JSON.stringify({ id }))
    .execute('spPostulaciones');
  return leerDatos(result);
}

async function guardarPrefiltro(pool, id, prefiltro, invalidarToken) {
  await pool.request()
    .input('ACCION', sql.VarChar(50), 'GUARDAR_PREFILTRO')
    .input('DATA_JSON', sql.NVarChar, JSON.stringify({
      id,
      prefiltro_json: prefiltro,
      invalidar_token: invalidarToken ? 1 : 0
    }))
    .execute('spPostulaciones');
}

async function nombreUsuario(pool, id) {
  try {
    const result = await pool.request()
      .input('ACCION', sql.VarChar(50), 'SELECT_BY_ID')
      .input('DATA_JSON', sql.VarChar, JSON.stringify({ id }))
      .execute('spUsuariosAdmin');
    const usuario = leerDatos(result);
    return usuario ? usuario.nombre : '';
  } catch (e) {
    return '';
  }
}

// Carga la postulación verificando que sea de la empresa del usuario; responde 404 si no
async function cargarConAcceso(req, res) {
  const pool = await poolPromise;
  const postulacion = await obtenerPostulacion(pool, req.params.id);
  if (!postulacion || (!esSuperAdmin(req.user) && req.user.empresa_id && postulacion.empresa_id !== req.user.empresa_id)) {
    res.status(404).json({ error: 'Postulación no encontrada.' });
    return null;
  }
  return { pool, postulacion, prefiltro: normalizarPrefiltro(postulacion.prefiltro_json) };
}

function respuestaPrefiltro(postulacion, prefiltro, extra) {
  return {
    data: {
      postulacion_id: postulacion.id,
      prefiltro,
      enlace_expira: postulacion.prefiltro_enlace_expira || null,
      preguntas: PREGUNTAS_PREFILTRO,
      resultados: RESULTADOS_PREFILTRO,
      ...extra
    }
  };
}

// GET prefiltro de una postulación (Talento Humano / Gerencia)
exports.obtener = async (req, res) => {
  try {
    const ctx = await cargarConAcceso(req, res);
    if (!ctx) return;
    res.json(respuestaPrefiltro(ctx.postulacion, ctx.prefiltro));
  } catch (err) {
    console.error('Error al consultar el prefiltro:', err);
    res.status(500).json({ error: err.message });
  }
};

// POST registrar una llamada: sin respuesta (queda el intento) o con las respuestas del candidato
exports.registrarLlamada = async (req, res) => {
  try {
    const ctx = await cargarConAcceso(req, res);
    if (!ctx) return;
    const { pool, postulacion, prefiltro } = ctx;
    const contesto = req.body.contesto === true || req.body.contesto === 'true';
    const ahora = new Date().toISOString();
    const registradoPor = await nombreUsuario(pool, req.user.id);

    if (!contesto) {
      prefiltro.intentos.push({ fecha: ahora, canal: 'telefono', resultado: 'no_contesto', registrado_por: registradoPor });
      await guardarPrefiltro(pool, postulacion.id, prefiltro, false);
      return res.json({ message: 'Intento de llamada registrado.', ...respuestaPrefiltro(postulacion, prefiltro) });
    }

    const validacion = validarRespuestasPrefiltro(req.body.respuestas);
    if (validacion.error) {
      return res.status(400).json({ error: validacion.error });
    }

    prefiltro.intentos.push({ fecha: ahora, canal: 'telefono', resultado: 'contesto', registrado_por: registradoPor });
    prefiltro.respuestas = validacion.respuestas;
    prefiltro.canal = 'telefono';
    prefiltro.respondido_fecha = ahora;
    prefiltro.registrado_por = registradoPor;

    // Ya hay respuestas por teléfono: el enlace de WhatsApp pendiente, si lo hay, se invalida
    await guardarPrefiltro(pool, postulacion.id, prefiltro, true);
    res.json({ message: 'Respuestas del prefiltro registradas.', ...respuestaPrefiltro({ ...postulacion, prefiltro_enlace_expira: null }, prefiltro) });
  } catch (err) {
    console.error('Error al registrar la llamada del prefiltro:', err);
    res.status(500).json({ error: err.message });
  }
};

// POST decisión de Talento Humano sobre el prefiltro (Pasa / No pasa)
exports.guardarResultado = async (req, res) => {
  try {
    const ctx = await cargarConAcceso(req, res);
    if (!ctx) return;
    const { pool, postulacion, prefiltro } = ctx;

    const resultado = String(req.body.resultado || '').trim();
    if (!RESULTADOS_PREFILTRO.includes(resultado)) {
      return res.status(400).json({ error: `El resultado debe ser: ${RESULTADOS_PREFILTRO.join(' o ')}.` });
    }
    if (!prefiltro.respuestas) {
      return res.status(400).json({ error: 'Primero registre las respuestas del prefiltro (por llamada o por WhatsApp).' });
    }

    prefiltro.resultado = resultado;
    prefiltro.observaciones = String(req.body.observaciones || '').trim().slice(0, 2000);
    prefiltro.resultado_fecha = new Date().toISOString();
    prefiltro.resultado_por = await nombreUsuario(pool, req.user.id);

    await guardarPrefiltro(pool, postulacion.id, prefiltro, false);
    res.json({ message: `Prefiltro marcado como "${resultado}".`, ...respuestaPrefiltro(postulacion, prefiltro) });
  } catch (err) {
    console.error('Error al guardar el resultado del prefiltro:', err);
    res.status(500).json({ error: err.message });
  }
};

// POST generar el enlace de un solo uso para enviar por WhatsApp
exports.generarEnlace = async (req, res) => {
  try {
    const ctx = await cargarConAcceso(req, res);
    if (!ctx) return;
    const { pool, postulacion, prefiltro } = ctx;

    if (prefiltro.respuestas) {
      return res.status(409).json({ error: 'Este candidato ya respondió el prefiltro.' });
    }

    const token = crypto.randomBytes(32).toString('base64url');
    const result = await pool.request()
      .input('ACCION', sql.VarChar(50), 'GENERAR_TOKEN_PREFILTRO')
      .input('DATA_JSON', sql.VarChar, JSON.stringify({ id: postulacion.id, prefiltro_token_hash: hashToken(token) }))
      .execute('spPostulaciones');
    const generado = leerDatos(result);

    prefiltro.intentos.push({
      fecha: new Date().toISOString(),
      canal: 'whatsapp',
      resultado: 'enlace_enviado',
      registrado_por: await nombreUsuario(pool, req.user.id)
    });
    await guardarPrefiltro(pool, postulacion.id, prefiltro, false);

    // El token en claro solo viaja en esta respuesta: el frontend arma el enlace con su propio dominio
    res.json({
      message: `Enlace generado. Vence en ${VIGENCIA_ENLACE_HORAS} horas.`,
      ...respuestaPrefiltro({ ...postulacion, prefiltro_enlace_expira: generado ? generado.expira : null }, prefiltro, {
        token,
        candidato_nombre: postulacion.nombre_completo,
        candidato_telefono: postulacion.telefono,
        vacante_titulo: postulacion.vacante_titulo
      })
    });
  } catch (err) {
    console.error('Error al generar el enlace del prefiltro:', err);
    res.status(500).json({ error: err.message });
  }
};

async function buscarPorToken(pool, token) {
  if (!FORMATO_TOKEN.test(token || '')) return null;
  const result = await pool.request()
    .input('ACCION', sql.VarChar(50), 'SELECT_BY_TOKEN_PREFILTRO')
    .input('DATA_JSON', sql.VarChar, JSON.stringify({ prefiltro_token_hash: hashToken(token) }))
    .execute('spPostulaciones');
  return leerDatos(result);
}

const ENLACE_NO_VALIDO = 'Este enlace no es válido, ya fue usado o venció. Si necesitas ayuda, comunícate con Talento Humano.';

// GET público: datos mínimos para mostrar el formulario (sin datos personales salvo el nombre de pila)
exports.consultarPublico = async (req, res) => {
  try {
    const pool = await poolPromise;
    const postulacion = await buscarPorToken(pool, req.params.token);
    if (!postulacion) {
      return res.status(404).json({ error: ENLACE_NO_VALIDO });
    }
    res.json({
      data: {
        nombre: (postulacion.nombre_completo || '').trim().split(/\s+/)[0] || '',
        vacante_titulo: postulacion.vacante_titulo,
        empresa_nombre: postulacion.empresa_nombre || 'Artdecon',
        expira: postulacion.expira,
        preguntas: PREGUNTAS_PREFILTRO
      }
    });
  } catch (err) {
    console.error('Error al consultar el prefiltro público:', err);
    res.status(500).json({ error: 'No se pudo cargar el formulario. Intenta más tarde.' });
  }
};

// POST público: el candidato envía sus respuestas (un solo uso)
exports.responderPublico = async (req, res) => {
  try {
    const pool = await poolPromise;
    const postulacion = await buscarPorToken(pool, req.params.token);
    if (!postulacion) {
      return res.status(404).json({ error: ENLACE_NO_VALIDO });
    }

    const validacion = validarRespuestasPrefiltro(req.body.respuestas);
    if (validacion.error) {
      return res.status(400).json({ error: validacion.error });
    }

    const prefiltro = normalizarPrefiltro(postulacion.prefiltro_json);
    const ahora = new Date().toISOString();
    prefiltro.respuestas = validacion.respuestas;
    prefiltro.canal = 'whatsapp';
    prefiltro.respondido_fecha = ahora;
    prefiltro.registrado_por = 'Candidato (formulario por WhatsApp)';
    prefiltro.intentos.push({ fecha: ahora, canal: 'whatsapp', resultado: 'respondido', registrado_por: 'Candidato' });

    const result = await pool.request()
      .input('ACCION', sql.VarChar(50), 'RESPONDER_PREFILTRO')
      .input('DATA_JSON', sql.NVarChar, JSON.stringify({
        prefiltro_token_hash: hashToken(req.params.token),
        prefiltro_json: prefiltro
      }))
      .execute('spPostulaciones');
    const resumen = leerDatos(result);
    if (!resumen || resumen.actualizadas !== 1) {
      return res.status(404).json({ error: ENLACE_NO_VALIDO });
    }

    res.json({ message: '¡Gracias! Recibimos tus respuestas. Talento Humano te contactará con los siguientes pasos.' });
  } catch (err) {
    console.error('Error al responder el prefiltro público:', err);
    res.status(500).json({ error: 'No se pudieron guardar tus respuestas. Intenta de nuevo.' });
  }
};
