const { poolPromise, sql } = require('../config/db');
const { generateDocx } = require('../utils/docxGenerator');
const { Packer } = require('docx');

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
