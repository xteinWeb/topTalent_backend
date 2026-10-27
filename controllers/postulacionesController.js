const { poolPromise, sql } = require('../config/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { VERSION_TRATAMIENTO_DATOS } = require('../config/legal');
const { Packer } = require('docx');
const { generateHojaVidaCorporativaDocx } = require('../utils/docxGenerator');
const mailer = require('../utils/mailer');
const { infoEstado } = require('./estadosPostulacionController');
const { empresaDelUsuario, esLiderArea, esSuperAdmin } = require('../middleware/auth');
const { setAttachmentHeader } = require('../utils/http');

// Opción fija al final de la lista de motivos (catálogo MOTIVO_NO_APROBADO); exige detalle en texto libre
const MOTIVO_OTRO = 'Otro';

// Devuelve { motivo, detalle } para guardar, o { error } si falta o no es válido.
// Solo los estados marcados con requiere_motivo (p. ej. Descartado, Reserva) lo exigen; en los demás queda vacío.
async function resolverMotivo(pool, estado, requiereMotivo, body) {
  if (!requiereMotivo) {
    return { motivo: null, detalle: null };
  }

  const motivo = String(body.motivo_no_aprobado || '').trim();
  const detalle = String(body.motivo_no_aprobado_detalle || '').trim();
  if (!motivo) {
    return { error: `Debe indicar el motivo para pasar al candidato a "${estado}".` };
  }

  if (motivo === MOTIVO_OTRO) {
    if (!detalle) {
      return { error: 'Describa el motivo en el campo "Otro".' };
    }
    return { motivo, detalle };
  }

  const result = await pool.request()
    .input('ACCION', sql.VarChar(50), 'SELECT_BY_TIPO')
    .input('DATA_JSON', sql.VarChar, JSON.stringify({ tipo: 'MOTIVO_NO_APROBADO' }))
    .execute('spCatalogos');
  const raw = result.recordset[0] && result.recordset[0]["DATOS"];
  const motivosValidos = raw ? JSON.parse(raw).map(m => m.valor) : [];
  if (!motivosValidos.includes(motivo)) {
    return { error: `Motivo no válido: "${motivo}".` };
  }
  return { motivo, detalle: detalle || null };
}

async function obtenerPruebaPsicotecnica(pool, postulacionId) {
  const result = await pool.request()
    .input('ACCION', sql.VarChar(50), 'SELECT_PRUEBA_PSICOTECNICA')
    .input('DATA_JSON', sql.VarChar, JSON.stringify({ id: postulacionId }))
    .execute('spPostulaciones');
  const raw = result.recordset[0] && result.recordset[0]["DATOS"];
  return raw ? JSON.parse(raw) : null;
}

function mismaEmpresa(req, empresaId) {
  return esSuperAdmin(req.user) || !req.user.empresa_id || req.user.empresa_id === empresaId;
}

const LOGO_PATH = path.join(__dirname, '../assets/logo-artdecon.png');

// Helper function to notify n8n about a new job application, attaching the resume file as multipart/form-data
async function notificarPostulacionN8N(payload, archivoPath, archivoNombre) {
  const webhookUrl = process.env.N8N_WEBHOOK_POSTULACIONES_URL;
  if (!webhookUrl) {
    console.warn('N8N_WEBHOOK_POSTULACIONES_URL not configured. Skipping postulacion notification.');
    return;
  }
  try {
    const formData = new FormData();
    formData.append('evento', payload.evento);
    formData.append('postulacion_id', payload.postulacion_id || '');
    formData.append('id_vacante', payload.vacante ? payload.vacante.id : '');
    formData.append('titulo_vacante', payload.vacante ? payload.vacante.titulo : '');
    formData.append('id_candidato', payload.candidato ? payload.candidato.id : '');
    formData.append('candidato', JSON.stringify(payload.candidato));
    formData.append('preguntas_respondidas', JSON.stringify(payload.preguntas_respondidas || []));

    if (archivoPath && fs.existsSync(archivoPath)) {
      const fileBuffer = fs.readFileSync(archivoPath);
      formData.append('hv_archivo', new Blob([fileBuffer]), archivoNombre || path.basename(archivoPath));
    } else {
      console.warn('No se encontró el archivo de hoja de vida para adjuntar al webhook de n8n.');
    }

    console.log(`Calling n8n webhook for postulacion: ${webhookUrl}`);
    const response = await fetch(webhookUrl, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error(`n8n response error: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.error('Error calling n8n webhook for postulacion:', error);
  }
}

function destinoUploads(req, file, cb) {
  const uploadDir = path.join(__dirname, '../uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  cb(null, uploadDir);
}

// Configure Multer storage
const storage = multer.diskStorage({
  destination: destinoUploads,
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
    const mimetype = file.mimetype;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    
    if (extname) {
      return cb(null, true);
    }
    cb(new Error('Solo se permiten archivos PDF, DOC o DOCX.'));
  }
}).single('hv_archivo');

// Export the upload middleware
exports.uploadMiddleware = upload;

// POST create a new job application
exports.create = async (req, res) => {
  let uploadedFileRuta = req.file ? req.file.path : null;
  try {
    const { 
      vacante_id, 
      nombre_completo, 
      correo, 
      telefono, 
      perfil_profesional, 
      experiencias_json, 
      estudios_json, 
      idiomas_json,
      habilidades_json,
      preguntas_respondidas_json,
      acepto_tratamiento_datos,
      edad,
      eps,
      fondo_pension,
      direccion,
      barrio,
      ciudad,
      estado_civil,
      talla_camisa,
      talla_pantalon,
      talla_zapato,
      personas_a_cargo_json,
      tiene_familiares_empresa,
      detalle_familiares_empresa,
      funciones_desempenar
    } = req.body;

    if (!vacante_id || !nombre_completo || !correo || !telefono || !req.body.cedula || !req.body.fecha_nacimiento) {
      if (uploadedFileRuta && fs.existsSync(uploadedFileRuta)) {
        fs.unlinkSync(uploadedFileRuta);
      }
      return res.status(400).json({ error: 'Faltan campos obligatorios: vacante_id, nombre_completo, correo, telefono, cedula, fecha_nacimiento' });
    }

    const hv_archivo_nombre = req.file ? req.file.originalname : null;
    const hv_archivo_ruta = req.file ? req.file.filename : null;

    const pool = await poolPromise;
    // La cuenta del candidato sale del token de sesión, nunca de un id enviado en el body
    let finalCandidatoId = req.user && req.user.tipo === 'candidato' ? req.user.id : null;

    if (!finalCandidatoId) {
      // Find candidate by email
      const checkResult = await pool.request()
        .input('ACCION', sql.VarChar(50), 'SELECT_BY_EMAIL')
        .input('DATA_JSON', sql.VarChar, JSON.stringify({ email: correo }))
        .execute('spCandidatos');
      
      let parsedCandidate = null;
      try {
        parsedCandidate = checkResult.recordset[0]["DATOS"] ? JSON.parse(checkResult.recordset[0]["DATOS"]) : null;
      } catch (e) {
        parsedCandidate = checkResult.recordset[0]["DATOS"];
      }

      if (parsedCandidate) {
        // Una cuenta verificada tiene dueño: sin su sesión no se permite sobrescribir su perfil ni su hoja de vida
        if (parsedCandidate.verificado === true || parsedCandidate.verificado === 1) {
          if (uploadedFileRuta && fs.existsSync(uploadedFileRuta)) {
            fs.unlinkSync(uploadedFileRuta);
          }
          return res.status(401).json({
            error: 'Ya existe una cuenta registrada con este correo. Inicie sesión como candidato para postularse.',
            requiere_login: true
          });
        }
        finalCandidatoId = parsedCandidate.id;
      } else {
        // Create new candidate
        const newPassword = 'AutoRegister-' + Math.random().toString(36).substring(2, 10);
        const insertResult = await pool.request()
          .input('ACCION', sql.VarChar(50), 'INSERT')
          .input('DATA_JSON', sql.VarChar, JSON.stringify({ email: correo, password_hash: newPassword }))
          .execute('spCandidatos');
        
        let parsedNewCandidate = null;
        try {
          parsedNewCandidate = insertResult.recordset[0]["DATOS"] ? JSON.parse(insertResult.recordset[0]["DATOS"]) : null;
        } catch (e) {
          parsedNewCandidate = insertResult.recordset[0]["DATOS"];
        }

        if (parsedNewCandidate) {
          finalCandidatoId = parsedNewCandidate.id;
        } else {
          throw new Error('No se pudo crear el registro del candidato en la base de datos.');
        }
      }
    }

    // Check whether the candidate already accepted the data treatment authorization on a previous occasion
    const candidatoActualResult = await pool.request()
      .input('ACCION', sql.VarChar(50), 'SELECT_BY_ID')
      .input('DATA_JSON', sql.VarChar, JSON.stringify({ id: finalCandidatoId }))
      .execute('spCandidatos');

    let candidatoPrevio = null;
    try {
      candidatoPrevio = candidatoActualResult.recordset[0]["DATOS"] ? JSON.parse(candidatoActualResult.recordset[0]["DATOS"]) : null;
    } catch (e) {
      candidatoPrevio = candidatoActualResult.recordset[0]["DATOS"];
    }

    const yaAceptoTratamientoDatos = !!(candidatoPrevio && (candidatoPrevio.acepto_tratamiento_datos === true || candidatoPrevio.acepto_tratamiento_datos === 1));
    const aceptaTratamientoDatosAhora = acepto_tratamiento_datos === true || acepto_tratamiento_datos === 'true';

    if (!yaAceptoTratamientoDatos && !aceptaTratamientoDatosAhora) {
      if (uploadedFileRuta && fs.existsSync(uploadedFileRuta)) {
        fs.unlinkSync(uploadedFileRuta);
      }
      return res.status(400).json({ error: 'Debe aceptar el tratamiento de datos personales para postularse.' });
    }

    // Parse JSON fields
    const parsedExp = typeof experiencias_json === 'string' ? JSON.parse(experiencias_json) : experiencias_json;
    const parsedEst = typeof estudios_json === 'string' ? JSON.parse(estudios_json) : estudios_json;
    const parsedIdi = typeof idiomas_json === 'string' ? JSON.parse(idiomas_json) : idiomas_json;
    const parsedHab = typeof habilidades_json === 'string' ? JSON.parse(habilidades_json) : habilidades_json;
    const parsedPreguntas = preguntas_respondidas_json
      ? (typeof preguntas_respondidas_json === 'string' ? JSON.parse(preguntas_respondidas_json) : preguntas_respondidas_json)
      : [];
    const parsedPersonasACargo = personas_a_cargo_json
      ? (typeof personas_a_cargo_json === 'string' ? JSON.parse(personas_a_cargo_json) : personas_a_cargo_json)
      : [];

    const preguntaObligatoriaSinResponder = Array.isArray(parsedPreguntas) && parsedPreguntas.some(
      p => p.obligatoria && (p.respuesta === undefined || p.respuesta === null || String(p.respuesta).trim() === '')
    );
    if (preguntaObligatoriaSinResponder) {
      if (uploadedFileRuta && fs.existsSync(uploadedFileRuta)) {
        fs.unlinkSync(uploadedFileRuta);
      }
      return res.status(400).json({ error: 'Debe responder todas las preguntas obligatorias del cargo antes de postularse.' });
    }

    // Enforce profile completeness server-side (mirrors the frontend rules), so an
    // outdated frontend build or a direct API call cannot skip the requirement.
    const tieneFamiliaresVal = String(tiene_familiares_empresa || '').trim();
    const camposAdicionalesCompletos = !!(
      String(edad || '').trim() && String(estado_civil || '').trim() && String(eps || '').trim() &&
      String(fondo_pension || '').trim() && String(direccion || '').trim() && String(barrio || '').trim() &&
      String(ciudad || '').trim() && String(talla_camisa || '').trim() && String(talla_pantalon || '').trim() &&
      String(talla_zapato || '').trim() && tieneFamiliaresVal &&
      (tieneFamiliaresVal !== 'Si' || String(detalle_familiares_empresa || '').trim()) &&
      String(funciones_desempenar || '').trim()
    );
    if (!camposAdicionalesCompletos) {
      if (uploadedFileRuta && fs.existsSync(uploadedFileRuta)) {
        fs.unlinkSync(uploadedFileRuta);
      }
      return res.status(400).json({ error: 'Debe completar todos los datos personales adicionales obligatorios (edad, estado civil, EPS, fondo de pensión, dirección, barrio, ciudad, tallas, familiares en la empresa y funciones a desempeñar).' });
    }

    const tieneArchivoHv = !!req.file || !!(candidatoPrevio && candidatoPrevio.hv_archivo_nombre);
    if (!tieneArchivoHv) {
      if (uploadedFileRuta && fs.existsSync(uploadedFileRuta)) {
        fs.unlinkSync(uploadedFileRuta);
      }
      return res.status(400).json({ error: 'Debe adjuntar su archivo de Hoja de Vida (PDF) para completar la postulación.' });
    }

    const vacanteConfigResult = await pool.request()
      .input('ACCION', sql.VarChar(50), 'SELECT_BY_ID')
      .input('DATA_JSON', sql.VarChar, JSON.stringify({ id: vacante_id }))
      .execute('spVacantes');

    let vacanteParaValidar = null;
    try {
      vacanteParaValidar = vacanteConfigResult.recordset[0]["DATOS"] ? JSON.parse(vacanteConfigResult.recordset[0]["DATOS"]) : null;
    } catch (e) {
      vacanteParaValidar = vacanteConfigResult.recordset[0]["DATOS"];
    }

    let camposRequeridos = { nivel_educativo: true, experiencia_laboral: true, idiomas_habilidades: true };
    if (vacanteParaValidar && vacanteParaValidar.configuracion_json) {
      try {
        const parsedConfig = typeof vacanteParaValidar.configuracion_json === 'string'
          ? JSON.parse(vacanteParaValidar.configuracion_json)
          : vacanteParaValidar.configuracion_json;
        camposRequeridos = { ...camposRequeridos, ...parsedConfig };
      } catch (e) {
        // Keep defaults (all required) if the stored configuration is malformed
      }
    }

    if (camposRequeridos.nivel_educativo !== false && (!parsedEst || parsedEst.length === 0)) {
      if (uploadedFileRuta && fs.existsSync(uploadedFileRuta)) {
        fs.unlinkSync(uploadedFileRuta);
      }
      return res.status(400).json({ error: 'Debe registrar al menos un nivel educativo para completar la postulación.' });
    }

    if (camposRequeridos.experiencia_laboral !== false && (!parsedExp || parsedExp.length === 0)) {
      if (uploadedFileRuta && fs.existsSync(uploadedFileRuta)) {
        fs.unlinkSync(uploadedFileRuta);
      }
      return res.status(400).json({ error: 'Debe registrar al menos una experiencia laboral para completar la postulación.' });
    }

    if (camposRequeridos.idiomas_habilidades !== false) {
      const habilidadesLlenas = parsedHab && (
        (parsedHab.tecnicas && parsedHab.tecnicas.length > 0) ||
        (parsedHab.interpersonales && parsedHab.interpersonales.length > 0) ||
        (parsedHab.otros && parsedHab.otros.length > 0)
      );
      if (!habilidadesLlenas && (!parsedIdi || parsedIdi.length === 0)) {
        if (uploadedFileRuta && fs.existsSync(uploadedFileRuta)) {
          fs.unlinkSync(uploadedFileRuta);
        }
        return res.status(400).json({ error: 'Debe registrar al menos un idioma o una habilidad para completar la postulación.' });
      }
    }

    const cedulaVal = req.body.cedula || '';
    const fechaNacVal = req.body.fecha_nacimiento || '';

    // Construct unified profile payload for candidates table
    const perfilCompletoObj = {
      nombre_completo,
      telefono,
      cedula: cedulaVal,
      fecha_nacimiento: fechaNacVal,
      edad: edad || '',
      eps: eps || '',
      fondo_pension: fondo_pension || '',
      direccion: direccion || '',
      barrio: barrio || '',
      ciudad: ciudad || '',
      estado_civil: estado_civil || '',
      talla_camisa: talla_camisa || '',
      talla_pantalon: talla_pantalon || '',
      talla_zapato: talla_zapato || '',
      personas_a_cargo: parsedPersonasACargo,
      tiene_familiares_empresa: tiene_familiares_empresa || '',
      detalle_familiares_empresa: detalle_familiares_empresa || '',
      funciones_desempenar: funciones_desempenar || '',
      tieneEducacionFormal: parsedEst && parsedEst.length > 0 ? 'Si' : 'No',
      tieneEducacionInformal: parsedEst && parsedEst.some(e => e.nivel && e.nivel.includes('Cursos y Certificaciones')) ? 'Si' : 'No',
      estudios: parsedEst || [],
      experiencias: parsedExp || [],
      capacitaciones: [],
      idiomas: parsedIdi || [],
      habilidades: parsedHab || { tecnicas: [], interpersonales: [], otros: [] }
    };

    // Update unified profile in candidates table
    await pool.request()
      .input('ACCION', sql.VarChar(50), 'UPDATE_PERFIL')
      .input('DATA_JSON', sql.NVarChar, JSON.stringify({
        id: finalCandidatoId,
        perfil_completo_json: perfilCompletoObj, // objeto, no texto: el SP lee con JSON_QUERY (texto >4000 caracteres llegaría NULL)
        hv_archivo_nombre: hv_archivo_nombre,
        hv_archivo_ruta: hv_archivo_ruta,
        acepto_tratamiento_datos: aceptaTratamientoDatosAhora,
        version_tratamiento_datos: VERSION_TRATAMIENTO_DATOS
      }))
      .execute('spCandidatos');

    // Create postulation record referencing candidato_id
    const postulationResult = await pool.request()
      .input('ACCION', sql.VarChar(50), 'INSERT')
      .input('DATA_JSON', sql.NVarChar, JSON.stringify({
        vacante_id,
        candidato_id: finalCandidatoId,
        preguntas_respondidas_json: parsedPreguntas
      }))
      .execute('spPostulaciones');

    let parsedData = null;
    try {
      parsedData = postulationResult.recordset[0]["DATOS"] ? JSON.parse(postulationResult.recordset[0]["DATOS"]) : null;
    } catch (e) {
      parsedData = postulationResult.recordset[0]["DATOS"];
    }

    res.status(201).json({
      message: 'Postulación enviada exitosamente',
      data: parsedData
    });

    // Notify n8n with the candidate's profile and resume data (fire-and-forget, does not block the response)
    (async () => {
      try {
        const candidatoResult = await pool.request()
          .input('ACCION', sql.VarChar(50), 'SELECT_BY_ID')
          .input('DATA_JSON', sql.VarChar, JSON.stringify({ id: finalCandidatoId }))
          .execute('spCandidatos');

        let candidatoActual = null;
        try {
          candidatoActual = candidatoResult.recordset[0]["DATOS"] ? JSON.parse(candidatoResult.recordset[0]["DATOS"]) : null;
        } catch (e) {
          candidatoActual = candidatoResult.recordset[0]["DATOS"];
        }

        const vacanteResult = await pool.request()
          .input('ACCION', sql.VarChar(50), 'SELECT_BY_ID')
          .input('DATA_JSON', sql.VarChar, JSON.stringify({ id: vacante_id }))
          .execute('spVacantes');

        let vacanteActual = null;
        try {
          vacanteActual = vacanteResult.recordset[0]["DATOS"] ? JSON.parse(vacanteResult.recordset[0]["DATOS"]) : null;
        } catch (e) {
          vacanteActual = vacanteResult.recordset[0]["DATOS"];
        }

        const hvArchivoNombreFinal = candidatoActual ? candidatoActual.hv_archivo_nombre : hv_archivo_nombre;
        const hvArchivoRutaFinal = candidatoActual ? candidatoActual.hv_archivo_ruta : hv_archivo_ruta;
        const hvArchivoPath = hvArchivoRutaFinal ? path.join(__dirname, '../uploads', hvArchivoRutaFinal) : null;

        await notificarPostulacionN8N({
          evento: 'nueva_postulacion',
          postulacion_id: parsedData ? parsedData.id : null,
          vacante: {
            id: vacante_id,
            titulo: vacanteActual ? vacanteActual.titulo : null
          },
          candidato: {
            id: finalCandidatoId,
            email: correo,
            perfil_completo_json: candidatoActual ? candidatoActual.perfil_completo_json : perfilCompletoObj,
            hv_archivo_nombre: hvArchivoNombreFinal
          },
          preguntas_respondidas: parsedPreguntas
        }, hvArchivoPath, hvArchivoNombreFinal);
      } catch (notifyErr) {
        console.error('Error preparando notificación de postulación a n8n:', notifyErr);
      }
    })();

  } catch (err) {
    if (uploadedFileRuta && fs.existsSync(uploadedFileRuta)) {
      try { fs.unlinkSync(uploadedFileRuta); } catch (e) {}
    }
    res.status(400).json({ error: err.message });
  }
};

function parsePostulacionJSON(p) {
  if (!p || typeof p !== 'object') return p;
  if (p.respuesta_ia && typeof p.respuesta_ia === 'string') {
    try { p.respuesta_ia = JSON.parse(p.respuesta_ia); } catch (e) {}
  }
  if (p.json_analisis_ia && typeof p.json_analisis_ia === 'string') {
    try { p.json_analisis_ia = JSON.parse(p.json_analisis_ia); } catch (e) {}
  }
  if (p.cita_entrevista_json && typeof p.cita_entrevista_json === 'string') {
    try { p.cita_entrevista_json = JSON.parse(p.cita_entrevista_json); } catch (e) {}
  }
  if (p.evaluacion_entrevista_json && typeof p.evaluacion_entrevista_json === 'string') {
    try { p.evaluacion_entrevista_json = JSON.parse(p.evaluacion_entrevista_json); } catch (e) {}
  }
  if (p.prefiltro_json && typeof p.prefiltro_json === 'string') {
    try { p.prefiltro_json = JSON.parse(p.prefiltro_json); } catch (e) {}
  }
  if (p.experiencias_json && typeof p.experiencias_json === 'string') {
    try { p.experiencias_json = JSON.parse(p.experiencias_json); } catch (e) {}
  }
  if (p.estudios_json && typeof p.estudios_json === 'string') {
    try { p.estudios_json = JSON.parse(p.estudios_json); } catch (e) {}
  }
  if (p.idiomas_json && typeof p.idiomas_json === 'string') {
    try { p.idiomas_json = JSON.parse(p.idiomas_json); } catch (e) {}
  }
  if (p.habilidades_json && typeof p.habilidades_json === 'string') {
    try { p.habilidades_json = JSON.parse(p.habilidades_json); } catch (e) {}
  }
  if (p.preguntas_respondidas && typeof p.preguntas_respondidas === 'string') {
    try { p.preguntas_respondidas = JSON.parse(p.preguntas_respondidas); } catch (e) {}
  }
  if (p.perfil_profesional && typeof p.perfil_profesional === 'string') {
    try { p.perfil_profesional = JSON.parse(p.perfil_profesional); } catch (e) {}
  }
  return p;
}

// GET all job applications (Admin)
exports.getAll = async (req, res) => {
  try {
    const empresa_id = empresaDelUsuario(req);
    const payload = {};
    if (empresa_id) payload.empresa_id = empresa_id;
    // Un líder de área solo ve los candidatos de sus vacantes
    if (esLiderArea(req.user)) payload.lider_id = req.user.id;

    const pool = await poolPromise;
    pool.request()
      .input('ACCION', sql.VarChar(50), 'SELECT_ALL')
      .input('DATA_JSON', sql.VarChar, Object.keys(payload).length > 0 ? JSON.stringify(payload) : null)
      .execute('spPostulaciones')
      .then(function (recordSet) {
        let refresh = undefined;
        if (process.env.NEWTOKEN && process.env.NEWTOKEN !== '')
          refresh = process.env.NEWTOKEN;

        let parsedData = null;
        try {
          parsedData = recordSet.recordset[0]["DATOS"] ? JSON.parse(recordSet.recordset[0]["DATOS"]) : [];
        } catch (e) {
          parsedData = recordSet.recordset[0]["DATOS"];
        }

        if (Array.isArray(parsedData)) {
          parsedData = parsedData.map(parsePostulacionJSON);
        }

        res.json({
          data: parsedData,
          token: refresh,
        });
      })
      .catch((err) => {
        console.error(err);
        res.status(500).json({ error: err.message });
      });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// GET applications by vacancy ID (Admin)
exports.getByVacante = async (req, res) => {
  try {
    const { vacanteId } = req.params;
    const pool = await poolPromise;
    pool.request()
      .input('ACCION', sql.VarChar(50), 'SELECT_BY_VACANTE')
      .input('DATA_JSON', sql.VarChar, JSON.stringify({
        vacante_id: vacanteId,
        lider_id: esLiderArea(req.user) ? req.user.id : undefined
      }))
      .execute('spPostulaciones')
      .then(function (recordSet) {
        let refresh = undefined;
        if (process.env.NEWTOKEN && process.env.NEWTOKEN !== '')
          refresh = process.env.NEWTOKEN;

        let parsedData = null;
        try {
          parsedData = recordSet.recordset[0]["DATOS"] ? JSON.parse(recordSet.recordset[0]["DATOS"]) : [];
        } catch (e) {
          parsedData = recordSet.recordset[0]["DATOS"];
        }

        if (Array.isArray(parsedData)) {
          parsedData = parsedData.map(parsePostulacionJSON);
        }

        res.json({
          data: parsedData,
          token: refresh,
        });
      })
      .catch((err) => {
        console.error(err);
        res.status(500).json({ error: err.message });
      });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// POST trigger the n8n "segunda validación" workflow for all applicants of a vacancy
exports.ejecutarValidacion = async (req, res) => {
  try {
    const { vacanteId } = req.params;
    if (!vacanteId) {
      return res.status(400).json({ error: 'Falta el id de la vacante.' });
    }

    const webhookUrl = process.env.N8N_WEBHOOK_VALIDACION_URL;
    if (!webhookUrl) {
      return res.status(500).json({ error: 'N8N_WEBHOOK_VALIDACION_URL no está configurado en el servidor.' });
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vacante_id: vacanteId })
    });

    if (!response.ok) {
      throw new Error(`n8n response error: ${response.status} ${response.statusText}`);
    }

    let data = null;
    try {
      data = await response.json();
    } catch (e) {
      // El workflow puede no responder JSON; no es un error bloqueante.
    }

    res.json({ message: 'Validación ejecutada exitosamente', data });
  } catch (err) {
    console.error('Error al ejecutar el webhook de validación:', err);
    res.status(500).json({ error: 'No se pudo ejecutar la validación: ' + err.message });
  }
};

// GET export a candidate's profile as the FTO-GH-001 "Hoja de Vida Corporativa" DOCX
exports.exportHojaVidaCorporativaDocx = async (req, res) => {
  try {
    const { candidatoId } = req.params;
    const pool = await poolPromise;
    const result = await pool.request()
      .input('ACCION', sql.VarChar(50), 'SELECT_BY_ID')
      .input('DATA_JSON', sql.VarChar, JSON.stringify({ id: candidatoId }))
      .execute('spCandidatos');

    let candidato = null;
    try {
      candidato = result.recordset[0]["DATOS"] ? JSON.parse(result.recordset[0]["DATOS"]) : null;
    } catch (e) {
      candidato = result.recordset[0]["DATOS"];
    }

    if (!candidato) {
      return res.status(404).json({ error: 'Candidato no encontrado' });
    }

    let perfil = candidato.perfil_completo_json;
    if (typeof perfil === 'string') {
      try {
        perfil = JSON.parse(perfil);
      } catch (e) {
        perfil = {};
      }
    }
    perfil = perfil || {};
    perfil.correo = perfil.correo || candidato.email;

    const cargo = req.query.vacante || '';
    const fecha = req.query.fecha ? new Date(req.query.fecha).toLocaleDateString('es-CO') : '';

    let logoBuffer = null;
    if (fs.existsSync(LOGO_PATH)) {
      logoBuffer = fs.readFileSync(LOGO_PATH);
    }

    const doc = generateHojaVidaCorporativaDocx(perfil, cargo, fecha, logoBuffer);
    const buffer = await Packer.toBuffer(doc);

    const fileName = `HOJA_DE_VIDA_${(perfil.nombre_completo || candidato.email || 'CANDIDATO').toUpperCase().replace(/\s+/g, '_')}.docx`;

    setAttachmentHeader(res, fileName);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.send(buffer);
  } catch (err) {
    console.error('Error al exportar la hoja de vida corporativa:', err);
    res.status(500).json({ error: err.message });
  }
};

// GET download candidate resume file
exports.downloadFile = (req, res) => {
  const { filename } = req.params;
  const safeName = path.basename(filename);
  const filePath = path.join(__dirname, '../uploads', safeName);
  
  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).json({ error: 'Archivo no encontrado' });
  }
};

// PUT change applicant recruitment lifecycle status
exports.cambiarEstado = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado_postulante } = req.body;

    if (!estado_postulante || typeof estado_postulante !== 'string') {
      return res.status(400).json({ error: 'El estado es obligatorio.' });
    }

    const estado = await infoEstado(estado_postulante.trim());
    if (!estado.existe) {
      return res.status(400).json({
        error: `Estado inválido o inactivo en el catálogo de base de datos: "${estado_postulante}".`
      });
    }

    const pool = await poolPromise;
    const motivo = await resolverMotivo(pool, estado_postulante, estado.requiereMotivo, req.body);
    if (motivo.error) {
      return res.status(400).json({ error: motivo.error });
    }

    await pool.request()
      .input('ACCION', sql.VarChar(50), 'CAMBIAR_ESTADO_POSTULANTE')
      .input('DATA_JSON', sql.NVarChar, JSON.stringify({
        id,
        estado_postulante,
        motivo_no_aprobado: motivo.motivo,
        motivo_no_aprobado_detalle: motivo.detalle,
        usuario_id: req.user.id // queda en el historial de estados
      }))
      .execute('spPostulaciones');

    res.json({
      message: `Estado actualizado a "${estado_postulante}" exitosamente.`
    });
  } catch (err) {
    console.error('Error al cambiar estado de postulante:', err);
    res.status(500).json({ error: err.message });
  }
};

// POST schedule an interview with Google Calendar & WhatsApp integration
exports.agendarEntrevista = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      fecha, // 'YYYY-MM-DD'
      hora, // 'HH:mm'
      duracion_minutos = 60,
      modalidad = 'Presencial',
      ubicacion_o_enlace = '',
      entrevistador = '',
      notas = '',
      enviar_email = true,
      candidato_nombre = '',
      candidato_correo = '',
      candidato_telefono = '',
      vacante_titulo = ''
    } = req.body;

    if (!fecha || !hora) {
      return res.status(400).json({ error: 'La fecha y hora de la entrevista son obligatorias.' });
    }

    // Calculate start & end datetime in ISO formatted for Google Calendar
    const [year, month, day] = fecha.split('-').map(Number);
    const [hours, minutes] = hora.split(':').map(Number);
    const startDate = new Date(year, month - 1, day, hours, minutes);
    const endDate = new Date(startDate.getTime() + (duracion_minutos || 60) * 60000);

    const pad = (n) => String(n).padStart(2, '0');
    const formatGCalDate = (d) => {
      return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
    };

    const gcalStart = formatGCalDate(startDate);
    const gcalEnd = formatGCalDate(endDate);

    const gcalTitle = `Entrevista Laboral - ${vacante_titulo || 'Artdecon'}: ${candidato_nombre || 'Candidato'}`;
    const gcalDetails = `Entrevista para el cargo de ${vacante_titulo || 'la vacante'}.\nModalidad: ${modalidad}\nEntrevistador(a): ${entrevistador || 'Gestión Humana'}\nIndicaciones: ${notas || 'Presentar documento de identidad original.'}`;
    const gcalLocation = ubicacion_o_enlace || 'Sede Principal Artdecon';

    const googleCalendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(gcalTitle)}&dates=${gcalStart}/${gcalEnd}&details=${encodeURIComponent(gcalDetails)}&location=${encodeURIComponent(gcalLocation)}`;

    // Format WhatsApp message
    let cleanPhone = String(candidato_telefono || '').replace(/\D/g, '');
    if (cleanPhone.length === 10) {
      cleanPhone = `57${cleanPhone}`;
    }
    const whatsappMessage = `Hola ${candidato_nombre || ''}, te saludamos del departamento de Gestión y Talento Humano de Artdecon. Te confirmamos tu citación a entrevista para la vacante *${vacante_titulo || 'de empleo'}* el día *${fecha}* a las *${hora}* (Modalidad: *${modalidad}*). Lugar/Enlace: ${ubicacion_o_enlace || 'Sede Principal'}. Por favor confírmanos tu asistencia. ¡Muchos éxitos!`;
    const whatsappUrl = cleanPhone ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(whatsappMessage)}` : null;

    const appointmentPayload = {
      fecha,
      hora,
      duracion_minutos: duracion_minutos || 60,
      modalidad,
      ubicacion_o_enlace,
      entrevistador,
      notas,
      google_calendar_url: googleCalendarUrl,
      whatsapp_url: whatsappUrl,
      fecha_agendamiento: new Date().toISOString()
    };

    const pool = await poolPromise;
    await pool.request()
      .input('ACCION', sql.VarChar(50), 'AGENDAR_ENTREVISTA')
      .input('DATA_JSON', sql.VarChar, JSON.stringify({
        id,
        cita_entrevista_json: appointmentPayload
      }))
      .execute('spPostulaciones');

    let emailSent = false;
    if (enviar_email && candidato_correo) {
      try {
        await mailer.sendInterviewInvitationEmail(
          candidato_correo,
          candidato_nombre,
          vacante_titulo,
          appointmentPayload,
          googleCalendarUrl
        );
        emailSent = true;
      } catch (mailErr) {
        console.warn('No se pudo enviar el correo de citación:', mailErr.message);
      }
    }

    res.json({
      message: 'Entrevista agendada exitosamente.',
      data: {
        appointment: appointmentPayload,
        google_calendar_url: googleCalendarUrl,
        whatsapp_url: whatsappUrl,
        whatsapp_message: whatsappMessage,
        email_sent: emailSent
      }
    });
  } catch (err) {
    console.error('Error al agendar entrevista:', err);
    res.status(500).json({ error: err.message });
  }
};

// POST save psychological interview record & competency evaluation matrix (FOR-TH-001)
exports.guardarEvaluacion = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      impresion_general,
      concepto_psicologico,
      matriz_competencias,
      promedio_competencias,
      disponibilidad_ingreso,
      aspiracion_salarial,
      decision_final,
      evaluador_nombre,
      observaciones_adicionales,
      fortalezas_clave,
      oportunidades_mejora,
      ajuste_cultural,
      respuestas_star,
      formato,
      grupo_cargo,
      brechas
    } = req.body;

    const evaluationPayload = {
      // 'matriz_v1' = evaluada con la matriz de competencias del grupo de cargo (ponderada por peso)
      formato: formato || null,
      grupo_cargo: grupo_cargo || null,
      brechas: Number(brechas) || 0,
      fortalezas_clave: fortalezas_clave || '',
      oportunidades_mejora: oportunidades_mejora || '',
      ajuste_cultural: ajuste_cultural || '',
      respuestas_star: respuestas_star && typeof respuestas_star === 'object' ? respuestas_star : {},
      impresion_general: impresion_general || '',
      concepto_psicologico: concepto_psicologico || '',
      matriz_competencias: matriz_competencias || [],
      promedio_competencias: promedio_competencias || 0,
      disponibilidad_ingreso: disponibilidad_ingreso || '',
      aspiracion_salarial: aspiracion_salarial || '',
      decision_final: decision_final || 'Con observaciones',
      evaluador_nombre: evaluador_nombre || '',
      observaciones_adicionales: observaciones_adicionales || '',
      fecha_evaluacion: new Date().toISOString()
    };

    const pool = await poolPromise;
    // El concepto de la entrevista no mueve el estado del postulante: Talento Humano lo cambia a mano
    await pool.request()
      .input('ACCION', sql.VarChar(50), 'GUARDAR_EVALUACION_ENTREVISTA')
      .input('DATA_JSON', sql.NVarChar, JSON.stringify({
        id,
        evaluacion_entrevista_json: evaluationPayload // objeto: como texto, más de 4000 caracteres se guardaban NULL
      }))
      .execute('spPostulaciones');

    res.json({
      message: 'Evaluación y expediente de entrevista FOR-TH-001 guardados exitosamente.',
      data: evaluationPayload
    });
  } catch (err) {
    console.error('Error al guardar evaluación de entrevista:', err);
    res.status(500).json({ error: err.message });
  }
};

// Middleware de carga del resultado de la prueba psicotécnica (solo PDF); los errores de carga responden 400
const uploadPrueba = multer({
  storage: multer.diskStorage({
    destination: destinoUploads,
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, 'psico-' + uniqueSuffix + '.pdf');
    }
  }),
  defParamCharset: 'utf8',
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() === '.pdf') {
      return cb(null, true);
    }
    cb(new Error('La prueba psicotécnica debe adjuntarse en PDF.'));
  }
}).single('prueba_archivo');

exports.uploadPruebaPsicotecnica = (req, res, next) => {
  uploadPrueba(req, res, (err) => {
    if (err) {
      const mensaje = err.code === 'LIMIT_FILE_SIZE' ? 'El archivo supera el tamaño máximo de 10 MB.' : err.message;
      return res.status(400).json({ error: mensaje });
    }
    next();
  });
};

// POST adjuntar (o reemplazar) el resultado de la prueba psicotécnica de una postulación
exports.guardarPruebaPsicotecnica = async (req, res) => {
  const archivoSubido = req.file ? req.file.path : null;
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Debe adjuntar el archivo PDF de la prueba psicotécnica.' });
    }

    const pool = await poolPromise;
    const acceso = await obtenerPruebaPsicotecnica(pool, req.params.id);
    if (!acceso || !mismaEmpresa(req, acceso.empresa_id)) {
      fs.unlinkSync(archivoSubido);
      return res.status(404).json({ error: 'Postulación no encontrada.' });
    }

    const result = await pool.request()
      .input('ACCION', sql.VarChar(50), 'GUARDAR_PRUEBA_PSICOTECNICA')
      .input('DATA_JSON', sql.NVarChar, JSON.stringify({
        id: req.params.id,
        prueba_psicotecnica_nombre: req.file.originalname,
        prueba_psicotecnica_ruta: req.file.filename
      }))
      .execute('spPostulaciones');

    const raw = result.recordset[0] && result.recordset[0]["DATOS"];
    const datos = raw ? JSON.parse(raw) : {};
    // Borrar el archivo reemplazado para no dejar resultados huérfanos con datos personales
    if (datos.ruta_anterior) {
      const anterior = path.join(__dirname, '../uploads', path.basename(datos.ruta_anterior));
      if (fs.existsSync(anterior)) fs.unlinkSync(anterior);
    }

    res.json({
      message: 'Prueba psicotécnica adjuntada exitosamente.',
      data: { prueba_psicotecnica_nombre: req.file.originalname, tiene_prueba_psicotecnica: 1 }
    });
  } catch (err) {
    if (archivoSubido && fs.existsSync(archivoSubido)) {
      try { fs.unlinkSync(archivoSubido); } catch (e) {}
    }
    console.error('Error al adjuntar la prueba psicotécnica:', err);
    res.status(500).json({ error: err.message });
  }
};

// GET descargar el resultado de la prueba psicotécnica de una postulación
exports.descargarPruebaPsicotecnica = async (req, res) => {
  try {
    const pool = await poolPromise;
    const prueba = await obtenerPruebaPsicotecnica(pool, req.params.id);
    if (!prueba || !prueba.prueba_psicotecnica_ruta || !mismaEmpresa(req, prueba.empresa_id)) {
      return res.status(404).json({ error: 'La postulación no tiene prueba psicotécnica adjunta.' });
    }

    const filePath = path.join(__dirname, '../uploads', path.basename(prueba.prueba_psicotecnica_ruta));
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Archivo no encontrado' });
    }
    setAttachmentHeader(res, prueba.prueba_psicotecnica_nombre || 'prueba_psicotecnica.pdf');
    res.sendFile(filePath);
  } catch (err) {
    console.error('Error al descargar la prueba psicotécnica:', err);
    res.status(500).json({ error: err.message });
  }
};

