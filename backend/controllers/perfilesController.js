const { poolPromise } = require('../config/db');
const { generateDocx } = require('../utils/docxGenerator');
const { Packer } = require('docx');

// GET all profiles
exports.getAll = async (req, res) => {
  try {
    const pool = await poolPromise;
    let result = await pool.query(
      'SELECT a.id AS id, a.area AS area, a.cargo AS cargo, a.perfil_json AS perfilJson, a.fecha_creacion AS fechaCreacion, a.fecha_actualizacion AS fechaActualizacion FROM perfiles_cargo AS a ORDER BY a.fecha_actualizacion DESC'
    );

    const parsedData = result.recordset.map(row => {
      let parsedJson = {};
      try {
        parsedJson = JSON.parse(row.perfilJson);
      } catch (e) {
        parsedJson = row.perfilJson;
      }
      return {
        id: row.id,
        area: row.area,
        cargo: row.cargo,
        perfil_json: parsedJson,
        perfilJson: parsedJson,
        fecha_creacion: row.fechaCreacion,
        fechaCreacion: row.fechaCreacion,
        fecha_actualizacion: row.fechaActualizacion,
        fechaActualizacion: row.fechaActualizacion
      };
    });

    res.json(parsedData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET a single profile by ID
exports.getById = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await poolPromise;
    let result = await pool.query(
      'SELECT a.id AS id, a.area AS area, a.cargo AS cargo, a.perfil_json AS perfilJson, a.fecha_creacion AS fechaCreacion, a.fecha_actualizacion AS fechaActualizacion FROM perfiles_cargo AS a WHERE a.id = ?',
      [id]
    );

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Perfil no encontrado' });
    }

    const row = result.recordset[0];
    let parsedJson = {};
    try {
      parsedJson = JSON.parse(row.perfilJson);
    } catch (e) {
      parsedJson = row.perfilJson;
    }

    res.json({
      id: row.id,
      area: row.area,
      cargo: row.cargo,
      perfil_json: parsedJson,
      perfilJson: parsedJson,
      fecha_creacion: row.fechaCreacion,
      fechaCreacion: row.fechaCreacion,
      fecha_actualizacion: row.fechaActualizacion,
      fechaActualizacion: row.fechaActualizacion
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET export profile as DOCX
exports.exportDocx = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await poolPromise;
    let result = await pool.query(
      'SELECT a.id AS id, a.area AS area, a.cargo AS cargo, a.perfil_json AS perfilJson FROM perfiles_cargo AS a WHERE a.id = ?',
      [id]
    );

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Perfil no encontrado' });
    }

    const row = result.recordset[0];
    try {
      row.perfil_json = JSON.parse(row.perfilJson);
    } catch (e) {
      row.perfil_json = row.perfilJson;
    }

    const doc = generateDocx(row);
    const b64string = await Packer.toBuffer(doc);

    const fileName = `20260122_ART_ROL_${row.cargo.toUpperCase().replace(/\s+/g, '_')}.docx`;

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

    const jsonString = typeof perfil_json === 'string' ? perfil_json : JSON.stringify(perfil_json);

    const pool = await poolPromise;
    let result = await pool.query(
      'INSERT INTO perfiles_cargo (area, cargo, perfil_json) OUTPUT INSERTED.id AS id, INSERTED.area AS area, INSERTED.cargo AS cargo VALUES (?, ?, ?)',
      [area, cargo, jsonString]
    );

    res.status(201).json({
      message: 'Perfil creado exitosamente',
      perfil: result.recordset[0]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
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

    const jsonString = typeof perfil_json === 'string' ? perfil_json : JSON.stringify(perfil_json);

    const pool = await poolPromise;
    let result = await pool.query(
      'UPDATE perfiles_cargo SET area = ?, cargo = ?, perfil_json = ?, fecha_actualizacion = GETDATE() WHERE id = ?',
      [area, cargo, jsonString, id]
    );

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Perfil no encontrado' });
    }

    res.json({ message: 'Perfil actualizado exitosamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE a profile
exports.delete = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await poolPromise;
    let result = await pool.query(
      'DELETE FROM perfiles_cargo WHERE id = ?',
      [id]
    );

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Perfil no encontrado' });
    }

    res.json({ message: 'Perfil eliminado exitosamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
