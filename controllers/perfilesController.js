const { poolPromise, sql } = require('../config/db');
const { generateDocx } = require('../utils/docxGenerator');
const { Packer } = require('docx');
const { empresaDelUsuario, esLiderArea, mismoId } = require('../middleware/auth');
const { setAttachmentHeader } = require('../utils/http');
const { ES_GRUPO_VALIDO } = require('../config/competencias');

// Helper function to call n8n Webhook
async function obtenerPreguntasN8N(id, area, cargo, perfil_json) {
  const webhookUrl = process.env.N8N_WEBHOOK_PREGUNTAS_URL;
  if (!webhookUrl) {
    console.warn('N8N_WEBHOOK_PREGUNTAS_URL not configured. Skipping questions generation.');
    return null;
  }
  try {
    if (!perfil_json.prompt) {
      perfil_json.prompt = `A partir del siguiente perfil del cargo genera un banco de preguntas para ser utilizado durante la postulación.

      Reglas:
      - Genera entre 8 y 12 preguntas.
      - Debe existir:
        * 2 preguntas técnicas
        * 2 preguntas sobre experiencia
        * 2 preguntas sobre competencias
        * 1 caso práctico
        * 1 pregunta de motivación
        * 1 pregunta de disponibilidad
        * Preguntas adicionales solo si son realmente necesarias.
      - Cada pregunta debe tener: id, categoria, tipo, titulo, pregunta, descripcion, peso, obligatoria, tiempo_estimado_segundos.
      - Si la pregunta es cerrada genera las opciones.
      - Si la pregunta es abierta genera una rúbrica de evaluación.
      - Las preguntas deben derivarse automáticamente del perfil del cargo.
      - Si el perfil exige conocimientos específicos (NIIF, Inventarios, SQL, Flutter, etc.) genera preguntas relacionadas con esos conocimientos.
      - Si una función del cargo es crítica, genera un caso práctico basado en ella.
      - Devuelve únicamente un JSON.`;
    }

    console.log(`Calling n8n webhook: ${webhookUrl}`);
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        id,
        area,
        cargo,
        perfil_json
      })
    });

    if (!response.ok) {
      throw new Error(`n8n response error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error calling n8n webhook:', error);
    return null;
  }
}


// GET all profiles
exports.getAll = async (req, res) => {
  try {
    const empresa_id = empresaDelUsuario(req);
    const payload = {};
    if (empresa_id) payload.empresa_id = empresa_id;
    // Un líder de área solo ve los perfiles de cargo que tiene a cargo
    if (esLiderArea(req.user)) payload.lider_id = req.user.id;

    const pool = await poolPromise;
    pool.request()
      .input('ACCION', sql.VarChar(50), 'SELECT_ALL')
      .input('DATA_JSON', sql.VarChar, Object.keys(payload).length > 0 ? JSON.stringify(payload) : null)
      .execute('spPerfilesCargo')
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
          parsedData = parsedData.map(p => {
            if (p.perfil_json && typeof p.perfil_json === 'string') {
              try { p.perfil_json = JSON.parse(p.perfil_json); } catch (e) {}
            }
            if (p.matriz_competencias_json && typeof p.matriz_competencias_json === 'string') {
              try { p.matriz_competencias_json = JSON.parse(p.matriz_competencias_json); } catch (e) {}
            }
            return p;
          });
        }

        res.json({
          data: parsedData,
          token: refresh,
        });
      })
      .catch((err) => {
        console.error(err);
        res.json(JSON.stringify([{ ErrMensaje: err.originalError ? err.originalError.info.message : err.message }]));
      });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// GET a single profile by ID
exports.getById = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await poolPromise;
    pool.request()
      .input('ACCION', sql.VarChar(50), 'SELECT_BY_ID')
      .input('DATA_JSON', sql.VarChar, JSON.stringify({ id }))
      .execute('spPerfilesCargo')
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

        if (!parsedData || (esLiderArea(req.user) && !mismoId(parsedData.lider_id, req.user.id))) {
          return res.status(404).json({ error: 'Perfil no encontrado' });
        }

        if (parsedData.perfil_json && typeof parsedData.perfil_json === 'string') {
          try { parsedData.perfil_json = JSON.parse(parsedData.perfil_json); } catch (e) {}
        }
        if (parsedData.matriz_competencias_json && typeof parsedData.matriz_competencias_json === 'string') {
          try { parsedData.matriz_competencias_json = JSON.parse(parsedData.matriz_competencias_json); } catch (e) {}
        }

        res.json({
          data: parsedData,
          token: refresh,
        });
      })
      .catch((err) => {
        console.error(err);
        res.json(JSON.stringify([{ ErrMensaje: err.originalError ? err.originalError.info.message : err.message }]));
      });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// GET export profile as DOCX
exports.exportDocx = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await poolPromise;
    const result = await pool.request()
      .input('ACCION', sql.VarChar(50), 'SELECT_BY_ID')
      .input('DATA_JSON', sql.VarChar, JSON.stringify({ id }))
      .execute('spPerfilesCargo');

    let parsedData = null;
    try {
      parsedData = result.recordset[0]["DATOS"] ? JSON.parse(result.recordset[0]["DATOS"]) : null;
    } catch (e) {
      parsedData = result.recordset[0]["DATOS"];
    }

    if (!parsedData) {
      return res.status(404).json({ error: 'Perfil no encontrado' });
    }

    if (parsedData.perfil_json && typeof parsedData.perfil_json === 'string') {
      try { parsedData.perfil_json = JSON.parse(parsedData.perfil_json); } catch (e) {}
    }
    if (parsedData.matriz_competencias_json && typeof parsedData.matriz_competencias_json === 'string') {
      try { parsedData.matriz_competencias_json = JSON.parse(parsedData.matriz_competencias_json); } catch (e) {}
    }

    const doc = generateDocx(parsedData);
    const b64string = await Packer.toBuffer(doc);

    const fileName = `20260122_ART_ROL_${parsedData.cargo.toUpperCase().replace(/\s+/g, '_')}.docx`;

    setAttachmentHeader(res, fileName);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.send(b64string);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST create a new profile
exports.create = async (req, res) => {
  try {
    const { area, cargo, perfil_json, matriz_competencias_json, empresa_id, lider_id, grupo_cargo } = req.body;

    if (!area || !cargo || !perfil_json) {
      return res.status(400).json({ error: 'Faltan campos obligatorios: area, cargo, perfil_json' });
    }
    if (grupo_cargo && !ES_GRUPO_VALIDO(grupo_cargo)) {
      return res.status(400).json({ error: `Grupo de cargo no válido: "${grupo_cargo}".` });
    }

    const pool = await poolPromise;
    pool.request()
      .input('ACCION', sql.VarChar(50), 'INSERT')
      .input('DATA_JSON', sql.VarChar, JSON.stringify({
        empresa_id: empresa_id || '00',
        area,
        cargo,
        perfil_json,
        matriz_competencias_json,
        lider_id: lider_id || null,
        grupo_cargo: grupo_cargo || null
      }))
      .execute('spPerfilesCargo')
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
        res.json(JSON.stringify([{ ErrMensaje: err.originalError ? err.originalError.info.message : err.message }]));
      });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// PUT update a profile
exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { area, cargo, perfil_json, matriz_competencias_json, empresa_id } = req.body;

    if (!area || !cargo || !perfil_json) {
      return res.status(400).json({ error: 'Faltan campos obligatorios: area, cargo, perfil_json' });
    }

    const datos = { id, empresa_id, area, cargo, perfil_json, matriz_competencias_json };
    // Solo se cambia el líder si la petición lo trae (null lo desasigna); si no viene, el SP lo conserva
    if (Object.prototype.hasOwnProperty.call(req.body, 'lider_id')) {
      datos.lider_id = req.body.lider_id || null;
    }
    // Igual con el grupo de cargo de la matriz de competencias
    if (Object.prototype.hasOwnProperty.call(req.body, 'grupo_cargo')) {
      if (req.body.grupo_cargo && !ES_GRUPO_VALIDO(req.body.grupo_cargo)) {
        return res.status(400).json({ error: `Grupo de cargo no válido: "${req.body.grupo_cargo}".` });
      }
      datos.grupo_cargo = req.body.grupo_cargo || null;
    }

    const pool = await poolPromise;
    pool.request()
      .input('ACCION', sql.VarChar(50), 'UPDATE')
      .input('DATA_JSON', sql.VarChar, JSON.stringify(datos))
      .execute('spPerfilesCargo')
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

        res.json({
          data: parsedData,
          token: refresh,
        });
      })
      .catch((err) => {
        console.error(err);
        res.json(JSON.stringify([{ ErrMensaje: err.originalError ? err.originalError.info.message : err.message }]));
      });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// DELETE a profile
exports.delete = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await poolPromise;
    pool.request()
      .input('ACCION', sql.VarChar(50), 'DELETE')
      .input('DATA_JSON', sql.VarChar, JSON.stringify({ id }))
      .execute('spPerfilesCargo')
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

        res.json({
          data: parsedData,
          token: refresh,
        });
      })
      .catch((err) => {
        console.error(err);
        res.json(JSON.stringify([{ ErrMensaje: err.originalError ? err.originalError.info.message : err.message }]));
      });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// POST generate questions using n8n (on-demand)
exports.generateQuestions = async (req, res) => {
  try {
    const { id, area, cargo, perfil_json } = req.body;

    if (!area || !cargo || !perfil_json) {
      return res.status(400).json({ error: 'Faltan campos obligatorios: area, cargo, perfil_json' });
    }

    const preguntas = await obtenerPreguntasN8N(id, area, cargo, perfil_json);
    if (!preguntas) {
      return res.status(500).json({ error: 'No se pudieron generar las preguntas del cargo. Verifique la configuración del webhook.' });
    }

    res.json({ data: preguntas });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

