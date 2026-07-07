const { poolPromise, sql } = require('../config/db');
const { generateDocx } = require('../utils/docxGenerator');
const { Packer } = require('docx');

// Helper function to call n8n Webhook
async function obtenerPreguntasN8N(area, cargo, perfil_json) {
  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn('N8N_WEBHOOK_URL not configured. Skipping questions generation.');
    return null;
  }
  try {
    const prompt = perfil_json.prompt || `A partir del siguiente perfil del cargo genera un banco de preguntas para ser utilizado durante la postulación.

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

    console.log(`Calling n8n webhook: ${webhookUrl}`);
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt,
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
    const pool = await poolPromise;
    pool.request()
      .input('ACCION', sql.VarChar(50), 'SELECT_ALL')
      .input('DATA_JSON', sql.VarChar, null)
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

        if (!parsedData) {
          return res.status(404).json({ error: 'Perfil no encontrado' });
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

    const doc = generateDocx(parsedData);
    const b64string = await Packer.toBuffer(doc);

    const fileName = `20260122_ART_ROL_${parsedData.cargo.toUpperCase().replace(/\s+/g, '_')}.docx`;

    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.send(b64string);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST create a new profile
exports.create = async (req, res) => {
  try {
    const { area, cargo, perfil_json } = req.body;

    if (!area || !cargo || !perfil_json) {
      return res.status(400).json({ error: 'Faltan campos obligatorios: area, cargo, perfil_json' });
    }

    const pool = await poolPromise;
    pool.request()
      .input('ACCION', sql.VarChar(50), 'INSERT')
      .input('DATA_JSON', sql.VarChar, JSON.stringify({ area, cargo, perfil_json }))
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
    const { area, cargo, perfil_json } = req.body;

    if (!area || !cargo || !perfil_json) {
      return res.status(400).json({ error: 'Faltan campos obligatorios: area, cargo, perfil_json' });
    }

    const pool = await poolPromise;
    pool.request()
      .input('ACCION', sql.VarChar(50), 'UPDATE')
      .input('DATA_JSON', sql.VarChar, JSON.stringify({ id, area, cargo, perfil_json }))
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
    const { area, cargo, perfil_json } = req.body;

    if (!area || !cargo || !perfil_json) {
      return res.status(400).json({ error: 'Faltan campos obligatorios: area, cargo, perfil_json' });
    }

    const preguntas = await obtenerPreguntasN8N(area, cargo, perfil_json);
    if (!preguntas) {
      return res.status(500).json({ error: 'No se pudieron generar las preguntas del cargo. Verifique la configuración del webhook.' });
    }

    res.json({ data: preguntas });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

