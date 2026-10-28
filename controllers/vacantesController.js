const { poolPromise, sql } = require('../config/db');
const { empresaDelUsuario, esSuperAdmin, esLiderArea, mismoId, ROLES } = require('../middleware/auth');
const { sendSolicitudVacanteEmail } = require('../utils/mailer');

// Mismo criterio que spVacantes SELECT_ACTIVE para decidir qué ve el público
const ESTADOS_APROBACION_PUBLICOS = ['APROBADA', 'Aprobado', 'Aprobado con reservas'];
const CAMPOS_INTERNOS_VACANTE = [
  'perfil_oculto_json', 'matriz_competencias_json', 'solicitado_por_id', 'solicitado_por_nombre',
  'autorizado_por_id', 'autorizado_por_nombre', 'observaciones_aprobacion', 'nombre_reemplaza',
  'estado_aprobacion', 'fecha_solicitud', 'fecha_autorizacion', 'perfil_lider_id'
];

// Gerencia autoriza y Talento Humano activa: ambos reciben el aviso de una solicitud nueva
const ROLES_NOTIFICADOS_SOLICITUD = [...ROLES.GERENCIA, ...ROLES.TALENTO_HUMANO];

async function notificarSolicitudVacante(pool, empresaId, datos) {
  const result = await pool.request()
    .input('ACCION', sql.VarChar(50), 'SELECT_ALL')
    .input('DATA_JSON', sql.VarChar, JSON.stringify({ empresa_id: empresaId }))
    .execute('spUsuariosAdmin');
  const raw = result.recordset[0] && result.recordset[0]["DATOS"];
  const usuarios = raw ? JSON.parse(raw) : [];

  const solicitante = usuarios.find(u => mismoId(u.id, datos.solicitante));
  const destinatarios = [...new Set(usuarios
    .filter(u => (u.activo === true || u.activo === 1) && u.email &&
      ROLES_NOTIFICADOS_SOLICITUD.includes(String(u.rol || '').toUpperCase()))
    .map(u => u.email.trim().toLowerCase()))];

  if (destinatarios.length === 0) {
    console.warn('Solicitud de vacante sin destinatarios de correo (no hay usuarios de Gerencia/Talento Humano con email).');
    return;
  }

  await sendSolicitudVacanteEmail(destinatarios, {
    ...datos,
    solicitante_nombre: solicitante ? solicitante.nombre : 'Líder de área',
    enlace: process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL.replace(/\/$/, '')}/solicitudes-vacantes` : null
  });
  console.log(`Aviso de solicitud de vacante enviado a ${destinatarios.length} destinatario(s).`);
}

function parseVacanteJSON(v) {
  if (!v || typeof v !== 'object') return v;
  if (v.perfil_completo_json && typeof v.perfil_completo_json === 'string') {
    try { v.perfil_completo_json = JSON.parse(v.perfil_completo_json); } catch (e) {}
  }
  if (v.matriz_competencias_json && typeof v.matriz_competencias_json === 'string') {
    try { v.matriz_competencias_json = JSON.parse(v.matriz_competencias_json); } catch (e) {}
  }
  if (v.perfil_oculto_json && typeof v.perfil_oculto_json === 'string') {
    try { v.perfil_oculto_json = JSON.parse(v.perfil_oculto_json); } catch (e) {}
  }
  if (v.configuracion_json && typeof v.configuracion_json === 'string') {
    try { v.configuracion_json = JSON.parse(v.configuracion_json); } catch (e) {}
  }
  return v;
}

// GET all vacancies (Admin)
exports.getAll = async (req, res) => {
  try {
    const empresa_id = empresaDelUsuario(req);
    const payload = {};
    if (empresa_id) payload.empresa_id = empresa_id;
    if (esLiderArea(req.user)) {
      // Un líder de área ve las vacantes que solicitó y las de los perfiles que tiene a cargo
      payload.lider_id = req.user.id;
    } else if (req.query.solicitado_por_id) {
      payload.solicitado_por_id = req.query.solicitado_por_id;
    }

    const pool = await poolPromise;
    pool.request()
      .input('ACCION', sql.VarChar(50), 'SELECT_ALL')
      .input('DATA_JSON', sql.VarChar, Object.keys(payload).length > 0 ? JSON.stringify(payload) : null)
      .execute('spVacantes')
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
          parsedData = parsedData.map(parseVacanteJSON);
        }

        res.json({
          data: parsedData || [],
          token: refresh,
        });
      })
      .catch((err) => {
        console.error(err);
        res.status(500).json({ error: err.originalError ? err.originalError.info.message : err.message });
      });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// GET active vacancies (Public)
exports.getActive = async (req, res) => {
  try {
    const empresa_id = req.query.empresa_id || req.headers['x-empresa-id'] || null;
    const pool = await poolPromise;
    pool.request()
      .input('ACCION', sql.VarChar(50), 'SELECT_ACTIVE')
      .input('DATA_JSON', sql.VarChar, empresa_id ? JSON.stringify({ empresa_id }) : null)
      .execute('spVacantes')
      .then(function (recordSet) {
        let parsedData = null;
        try {
          parsedData = recordSet.recordset[0]["DATOS"] ? JSON.parse(recordSet.recordset[0]["DATOS"]) : [];
        } catch (e) {
          parsedData = recordSet.recordset[0]["DATOS"];
        }

        if (Array.isArray(parsedData)) {
          parsedData = parsedData.map(parseVacanteJSON);
        }

        res.json({
          data: parsedData || []
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

// GET vacancies pending approval (Gerencia / Superadmin inbox)
exports.getPendientesAutorizacion = async (req, res) => {
  try {
    const empresa_id = empresaDelUsuario(req);
    const pool = await poolPromise;
    pool.request()
      .input('ACCION', sql.VarChar(50), 'SELECT_SOLICITUDES_PENDIENTES')
      .input('DATA_JSON', sql.VarChar, empresa_id ? JSON.stringify({ empresa_id }) : null)
      .execute('spVacantes')
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
          parsedData = parsedData.map(parseVacanteJSON);
        }

        res.json({
          data: parsedData || [],
          token: refresh
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

// GET a single vacancy by ID
exports.getById = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await poolPromise;
    pool.request()
      .input('ACCION', sql.VarChar(50), 'SELECT_BY_ID')
      .input('DATA_JSON', sql.VarChar, JSON.stringify({ id }))
      .execute('spVacantes')
      .then(function (recordSet) {
        let refresh = undefined;
        if (process.env.NEWTOKEN && process.env.NEWTOKEN !== '')
          refresh = process.env.NEWTOKEN;

        let parsedData = null;
        try {
          parsedData = recordSet.recordset[0]["DATOS"] ? JSON.parse(recordSet.recordset[0]["DATOS"]) : null;
        } catch (e) {
          parsedData = recordSet.recordset[0]["DATOS"];
        }

        if (!parsedData) {
          return res.status(404).json({ error: 'Vacante no encontrada' });
        }

        parsedData = parseVacanteJSON(parsedData);

        // Sin sesión administrativa (portal público / candidatos): solo vacantes publicadas y sin datos internos
        const esAdmin = req.user && req.user.tipo === 'admin';
        if (!esAdmin) {
          const publicada = parsedData.estado === 'ACTIVA' &&
            (!parsedData.estado_aprobacion || ESTADOS_APROBACION_PUBLICOS.includes(parsedData.estado_aprobacion));
          if (!publicada) {
            return res.status(404).json({ error: 'Vacante no encontrada' });
          }
          CAMPOS_INTERNOS_VACANTE.forEach(campo => delete parsedData[campo]);
        } else if (!esSuperAdmin(req.user) && req.user.empresa_id && parsedData.empresa_id !== req.user.empresa_id) {
          return res.status(404).json({ error: 'Vacante no encontrada' });
        } else if (esLiderArea(req.user) &&
          !mismoId(parsedData.solicitado_por_id, req.user.id) && !mismoId(parsedData.perfil_lider_id, req.user.id)) {
          return res.status(404).json({ error: 'Vacante no encontrada' });
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

// POST Area Leader vacancy request (Status INACTIVA / PENDIENTE)
exports.solicitar = async (req, res) => {
  try {
    const {
      empresa_id,
      perfil_id,
      titulo,
      descripcion,
      requiere_registro,
      configuracion_json,
      tipo_requerimiento,
      nombre_reemplaza,
      seccion_area,
      salario_min,
      salario_max,
      perfil_oculto_json
    } = req.body;

    if (!perfil_id || !titulo || !descripcion) {
      return res.status(400).json({ error: 'Faltan campos obligatorios: perfil_id, titulo, descripcion' });
    }

    const pool = await poolPromise;

    const perfilResult = await pool.request()
      .input('ACCION', sql.VarChar(50), 'SELECT_BY_ID')
      .input('DATA_JSON', sql.VarChar, JSON.stringify({ id: perfil_id }))
      .execute('spPerfilesCargo');
    const perfilRaw = perfilResult.recordset[0] && perfilResult.recordset[0]["DATOS"];
    const perfil = perfilRaw ? JSON.parse(perfilRaw) : null;
    if (!perfil) {
      return res.status(400).json({ error: 'El perfil de cargo seleccionado no existe.' });
    }
    // El líder solo puede solicitar vacantes de los perfiles de cargo que tiene a cargo
    if (esLiderArea(req.user) && !mismoId(perfil.lider_id, req.user.id)) {
      return res.status(403).json({ error: 'Solo puede solicitar vacantes de los perfiles de cargo que tiene asignados.' });
    }

    const empresaSolicitud = (esSuperAdmin(req.user) ? empresa_id : req.user.empresa_id) || '00';

    pool.request()
      .input('ACCION', sql.VarChar(50), 'SOLICITAR')
      .input('DATA_JSON', sql.VarChar, JSON.stringify({
        empresa_id: empresaSolicitud,
        perfil_id,
        titulo,
        descripcion,
        requiere_registro: requiere_registro === undefined ? 1 : (requiere_registro ? 1 : 0),
        configuracion_json: typeof configuracion_json === 'object' ? JSON.stringify(configuracion_json) : configuracion_json,
        solicitado_por_id: req.user.id,
        tipo_requerimiento: tipo_requerimiento || 'NUEVO_CARGO',
        nombre_reemplaza: nombre_reemplaza || null,
        seccion_area: seccion_area || null,
        salario_min: salario_min ? parseFloat(salario_min) : null,
        salario_max: salario_max ? parseFloat(salario_max) : null,
        perfil_oculto_json: typeof perfil_oculto_json === 'object' ? JSON.stringify(perfil_oculto_json) : perfil_oculto_json
      }))
      .execute('spVacantes')
      .then(function (recordSet) {
        let parsedData = null;
        try {
          parsedData = recordSet.recordset[0]["DATOS"] ? JSON.parse(recordSet.recordset[0]["DATOS"]) : null;
        } catch (e) {
          parsedData = recordSet.recordset[0]["DATOS"];
        }

        res.status(201).json({
          message: 'Solicitud de vacante creada exitosamente y remitida a Gerencia para autorización.',
          data: parsedData
        });

        // Aviso por correo a Gerencia y Talento Humano (no bloquea la respuesta)
        notificarSolicitudVacante(pool, empresaSolicitud, {
          titulo,
          cargo: perfil.cargo,
          area: seccion_area || perfil.area,
          tipo_requerimiento: tipo_requerimiento || 'NUEVO_CARGO',
          nombre_reemplaza,
          salario_min,
          salario_max,
          descripcion,
          solicitante: req.user.id
        }).catch(err => console.error('Error notificando la solicitud de vacante por correo:', err));
      })
      .catch((err) => {
        console.error(err);
        res.status(500).json({ error: err.message });
      });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// PUT Gerencia approves/rejects/observes vacancy request
exports.autorizar = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado_aprobacion, observaciones_aprobacion } = req.body;
    const autorizado_por_id = req.user.id;

    const validStates = ['Aprobado', 'Aprobado con reservas', 'No aprobado', 'Con observaciones'];
    if (!estado_aprobacion || !validStates.includes(estado_aprobacion)) {
      return res.status(400).json({ 
        error: `El estado de aprobación debe ser uno de los siguientes: ${validStates.join(', ')}` 
      });
    }

    const pool = await poolPromise;
    pool.request()
      .input('ACCION', sql.VarChar(50), 'AUTORIZAR')
      .input('DATA_JSON', sql.VarChar, JSON.stringify({
        id,
        estado_aprobacion,
        observaciones_aprobacion: observaciones_aprobacion || '',
        autorizado_por_id
      }))
      .execute('spVacantes')
      .then(function () {
        res.json({
          message: `Solicitud de vacante resuelta como: ${estado_aprobacion}`
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

// PUT Talento Humano activates an approved vacancy
exports.activar = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await poolPromise;
    pool.request()
      .input('ACCION', sql.VarChar(50), 'ACTIVAR')
      .input('DATA_JSON', sql.VarChar, JSON.stringify({ id }))
      .execute('spVacantes')
      .then(function () {
        res.json({
          message: 'Vacante activada y publicada exitosamente para postulaciones'
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

// PUT Talento Humano deactivates a vacancy
exports.desactivar = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await poolPromise;
    pool.request()
      .input('ACCION', sql.VarChar(50), 'DESACTIVAR')
      .input('DATA_JSON', sql.VarChar, JSON.stringify({ id }))
      .execute('spVacantes')
      .then(function () {
        res.json({
          message: 'Vacante pausada/desactivada exitosamente'
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

// POST create a new vacancy (Direct / HR)
exports.create = async (req, res) => {
  try {
    const { 
      perfil_id, 
      titulo, 
      descripcion, 
      estado, 
      requiere_registro, 
      configuracion_json,
      empresa_id,
      solicitado_por_id,
      autorizado_por_id,
      estado_aprobacion,
      observaciones_aprobacion,
      tipo_requerimiento,
      nombre_reemplaza,
      seccion_area,
      salario_min,
      salario_max,
      perfil_oculto_json
    } = req.body;

    if (!perfil_id || !titulo || !descripcion) {
      return res.status(400).json({ error: 'Faltan campos obligatorios: perfil_id, titulo, descripcion' });
    }

    const pool = await poolPromise;
    pool.request()
      .input('ACCION', sql.VarChar(50), 'INSERT')
      .input('DATA_JSON', sql.VarChar, JSON.stringify({
        empresa_id: empresa_id || '00',
        perfil_id,
        titulo,
        descripcion,
        estado: estado || 'ACTIVA',
        requiere_registro: requiere_registro === undefined ? 1 : (requiere_registro ? 1 : 0),
        configuracion_json: typeof configuracion_json === 'object' ? JSON.stringify(configuracion_json) : configuracion_json,
        solicitado_por_id,
        autorizado_por_id,
        estado_aprobacion: estado_aprobacion || 'APROBADA',
        observaciones_aprobacion,
        tipo_requerimiento,
        nombre_reemplaza,
        seccion_area,
        salario_min: salario_min ? parseFloat(salario_min) : null,
        salario_max: salario_max ? parseFloat(salario_max) : null,
        perfil_oculto_json: typeof perfil_oculto_json === 'object' ? JSON.stringify(perfil_oculto_json) : perfil_oculto_json
      }))
      .execute('spVacantes')
      .then(function (recordSet) {
        let refresh = undefined;
        if (process.env.NEWTOKEN && process.env.NEWTOKEN !== '')
          refresh = process.env.NEWTOKEN;

        let parsedData = null;
        try {
          parsedData = recordSet.recordset[0]["DATOS"] ? JSON.parse(recordSet.recordset[0]["DATOS"]) : null;
        } catch (e) {
          parsedData = recordSet.recordset[0]["DATOS"];
        }

        res.status(201).json({
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

// PUT update a vacancy
exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      perfil_id, 
      titulo, 
      descripcion, 
      estado, 
      requiere_registro, 
      configuracion_json,
      empresa_id,
      tipo_requerimiento,
      nombre_reemplaza,
      seccion_area,
      salario_min,
      salario_max,
      perfil_oculto_json,
      estado_aprobacion,
      observaciones_aprobacion
    } = req.body;

    if (!perfil_id || !titulo || !descripcion) {
      return res.status(400).json({ error: 'Faltan campos obligatorios: perfil_id, titulo, descripcion' });
    }

    const pool = await poolPromise;
    pool.request()
      .input('ACCION', sql.VarChar(50), 'UPDATE')
      .input('DATA_JSON', sql.VarChar, JSON.stringify({
        id,
        empresa_id,
        perfil_id,
        titulo,
        descripcion,
        estado,
        requiere_registro: requiere_registro === undefined ? 1 : (requiere_registro ? 1 : 0),
        configuracion_json: typeof configuracion_json === 'object' ? JSON.stringify(configuracion_json) : configuracion_json,
        tipo_requerimiento,
        nombre_reemplaza,
        seccion_area,
        salario_min: salario_min ? parseFloat(salario_min) : null,
        salario_max: salario_max ? parseFloat(salario_max) : null,
        perfil_oculto_json: typeof perfil_oculto_json === 'object' ? JSON.stringify(perfil_oculto_json) : perfil_oculto_json,
        estado_aprobacion,
        observaciones_aprobacion
      }))
      .execute('spVacantes')
      .then(function () {
        let refresh = undefined;
        if (process.env.NEWTOKEN && process.env.NEWTOKEN !== '')
          refresh = process.env.NEWTOKEN;

        res.json({
          message: 'Vacante actualizada exitosamente',
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

// DELETE a vacancy
exports.delete = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await poolPromise;
    pool.request()
      .input('ACCION', sql.VarChar(50), 'DELETE')
      .input('DATA_JSON', sql.VarChar, JSON.stringify({ id }))
      .execute('spVacantes')
      .then(function () {
        let refresh = undefined;
        if (process.env.NEWTOKEN && process.env.NEWTOKEN !== '')
          refresh = process.env.NEWTOKEN;

        res.json({
          message: 'Vacante eliminada exitosamente',
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
