const { poolPromise, sql } = require('../config/db');

// GET catalog values by tipo (e.g. NIVEL_EDUCATIVO, TIPO_CAPACITACION)
exports.getByTipo = async (req, res) => {
  try {
    const { tipo } = req.params;
    const pool = await poolPromise;
    pool.request()
      .input('ACCION', sql.VarChar(50), 'SELECT_BY_TIPO')
      .input('DATA_JSON', sql.VarChar, JSON.stringify({ tipo }))
      .execute('spCatalogos')
      .then(function (recordSet) {
        let parsedData = [];
        try {
          const raw = recordSet.recordset[0]["DATOS"];
          parsedData = raw ? JSON.parse(raw).map((item) => item.valor) : [];
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
