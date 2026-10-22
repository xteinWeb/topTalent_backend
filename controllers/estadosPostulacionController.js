const { poolPromise, sql } = require('../config/db');

function parseDatos(recordSet, fallback) {
  try {
    const raw = recordSet.recordset[0]["DATOS"];
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

// GET /api/estados-postulacion           -> solo activos
// GET /api/estados-postulacion?todos=1   -> incluye inactivos (administración)
exports.getAll = async (req, res) => {
  try {
    const accion = req.query.todos === '1' || req.query.todos === 'true' ? 'SELECT_ALL' : 'SELECT_ACTIVOS';
    const pool = await poolPromise;
    const result = await pool.request()
      .input('ACCION', sql.VarChar(50), accion)
      .input('DATA_JSON', sql.NVarChar, null)
      .execute('spEstadosPostulacion');
    res.json({ data: parseDatos(result, []) });
  } catch (err) {
    console.error('Error al obtener estados de postulación:', err);
    res.status(500).json({ error: err.message });
  }
};

// POST /api/estados-postulacion
exports.create = async (req, res) => {
  try {
    const nombre = String(req.body.nombre || '').trim();
    if (!nombre) {
      return res.status(400).json({ error: 'El nombre del estado es obligatorio.' });
    }
    const pool = await poolPromise;
    const result = await pool.request()
      .input('ACCION', sql.VarChar(50), 'INSERT')
      .input('DATA_JSON', sql.NVarChar, JSON.stringify({ ...req.body, nombre }))
      .execute('spEstadosPostulacion');
    res.status(201).json({ message: 'Estado creado exitosamente.', data: parseDatos(result, null) });
  } catch (err) {
    console.error('Error al crear estado de postulación:', err);
    const duplicado = /UQ_estados_postulacion_nombre|duplicate/i.test(err.message);
    res.status(duplicado ? 409 : 500).json({ error: duplicado ? 'Ya existe un estado con ese nombre.' : err.message });
  }
};

// PUT /api/estados-postulacion/:id
exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const payload = { ...req.body, id };
    if (payload.nombre !== undefined) payload.nombre = String(payload.nombre).trim() || undefined;
    const pool = await poolPromise;
    const result = await pool.request()
      .input('ACCION', sql.VarChar(50), 'UPDATE')
      .input('DATA_JSON', sql.NVarChar, JSON.stringify(payload))
      .execute('spEstadosPostulacion');
    const data = parseDatos(result, null);
    if (!data) return res.status(404).json({ error: 'Estado no encontrado.' });
    res.json({ message: 'Estado actualizado exitosamente.', data });
  } catch (err) {
    console.error('Error al actualizar estado de postulación:', err);
    const duplicado = /UQ_estados_postulacion_nombre|duplicate/i.test(err.message);
    res.status(duplicado ? 409 : 500).json({ error: duplicado ? 'Ya existe un estado con ese nombre.' : err.message });
  }
};

// Helper reutilizable: valida que el estado exista y esté activo en BD
exports.esEstadoValido = async (nombre) => {
  if (!nombre) return false;
  const pool = await poolPromise;
  const result = await pool.request()
    .input('ACCION', sql.VarChar(50), 'EXISTE_ACTIVO')
    .input('DATA_JSON', sql.NVarChar, JSON.stringify({ nombre }))
    .execute('spEstadosPostulacion');
  return !!(result.recordset[0] && result.recordset[0].EXISTE);
};
