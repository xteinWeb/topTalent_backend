const { poolPromise, sql } = require('../config/db');

// GET all vacancies (Admin)
exports.getAll = async (req, res) => {
  try {
    const pool = await poolPromise;
    pool.request()
      .input('ACCION', sql.VarChar(50), 'SELECT_ALL')
      .input('DATA_JSON', sql.VarChar, null)
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

        res.json({
          data: parsedData,
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
    const pool = await poolPromise;
    pool.request()
      .input('ACCION', sql.VarChar(50), 'SELECT_ACTIVE')
      .input('DATA_JSON', sql.VarChar, null)
      .execute('spVacantes')
      .then(function (recordSet) {
        let parsedData = null;
        try {
          parsedData = recordSet.recordset[0]["DATOS"] ? JSON.parse(recordSet.recordset[0]["DATOS"]) : [];
        } catch (e) {
          parsedData = recordSet.recordset[0]["DATOS"];
        }

        res.json({
          data: parsedData
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

// POST create a new vacancy
exports.create = async (req, res) => {
  try {
    const { perfil_id, titulo, descripcion, estado } = req.body;

    if (!perfil_id || !titulo || !descripcion) {
      return res.status(400).json({ error: 'Faltan campos obligatorios: perfil_id, titulo, descripcion' });
    }

    const pool = await poolPromise;
    pool.request()
      .input('ACCION', sql.VarChar(50), 'INSERT')
      .input('DATA_JSON', sql.VarChar, JSON.stringify({ perfil_id, titulo, descripcion, estado }))
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
    const { perfil_id, titulo, descripcion, estado } = req.body;

    if (!perfil_id || !titulo || !descripcion) {
      return res.status(400).json({ error: 'Faltan campos obligatorios: perfil_id, titulo, descripcion' });
    }

    const pool = await poolPromise;
    pool.request()
      .input('ACCION', sql.VarChar(50), 'UPDATE')
      .input('DATA_JSON', sql.VarChar, JSON.stringify({ id, perfil_id, titulo, descripcion, estado }))
      .execute('spVacantes')
      .then(function (recordSet) {
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
      .then(function (recordSet) {
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
