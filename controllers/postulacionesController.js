const { poolPromise, sql } = require('../config/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { VERSION_TRATAMIENTO_DATOS } = require('../config/legal');

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

// Configure Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'cv-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
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
      candidato_id,
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
      personas_a_cargo_json
    } = req.body;

    if (!vacante_id || !nombre_completo || !correo) {
      if (uploadedFileRuta && fs.existsSync(uploadedFileRuta)) {
        fs.unlinkSync(uploadedFileRuta);
      }
      return res.status(400).json({ error: 'Faltan campos obligatorios: vacante_id, nombre_completo, correo' });
    }

    const hv_archivo_nombre = req.file ? req.file.originalname : null;
    const hv_archivo_ruta = req.file ? req.file.filename : null;

    const pool = await poolPromise;
    let finalCandidatoId = candidato_id;
    if (finalCandidatoId === 'null' || finalCandidatoId === 'undefined' || !finalCandidatoId) {
      finalCandidatoId = null;
    }

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
        perfil_completo_json: JSON.stringify(perfilCompletoObj),
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
        preguntas_respondidas_json: JSON.stringify(parsedPreguntas)
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

// GET all job applications (Admin)
exports.getAll = async (req, res) => {
  try {
    const pool = await poolPromise;
    pool.request()
      .input('ACCION', sql.VarChar(50), 'SELECT_ALL')
      .input('DATA_JSON', sql.VarChar, null)
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
      .input('DATA_JSON', sql.VarChar, JSON.stringify({ vacante_id: vacanteId }))
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
