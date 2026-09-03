const { poolPromise, sql } = require('../config/db');

// GET all active companies
exports.getAll = async (req, res) => {
  try {
    const pool = await poolPromise;
    pool.request()
      .input('ACCION', sql.VarChar(50), 'SELECT_ALL')
      .input('DATA_JSON', sql.VarChar, null)
      .execute('spEmpresas')
      .then(function (recordSet) {
        let parsedData = [];
        try {
          const raw = recordSet.recordset[0]["DATOS"];
          parsedData = raw ? JSON.parse(raw) : [];
        } catch (e) {
          parsedData = [];
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

// GET company by ID
exports.getById = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await poolPromise;
    pool.request()
      .input('ACCION', sql.VarChar(50), 'SELECT_BY_ID')
      .input('DATA_JSON', sql.VarChar, JSON.stringify({ id }))
      .execute('spEmpresas')
      .then(function (recordSet) {
        let parsedData = null;
        try {
          const raw = recordSet.recordset[0]["DATOS"];
          parsedData = raw ? JSON.parse(raw) : null;
        } catch (e) {
          parsedData = null;
        }

        if (!parsedData) {
          return res.status(404).json({ error: 'Empresa no encontrada' });
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
