const { poolPromise, sql } = require('../config/db');
(async () => {
  const pool = await poolPromise;
  const res = await pool.request()
    .input('ACCION', sql.VarChar(50), 'SELECT_ALL')
    .execute('spPostulaciones');
  let data = JSON.parse(res.recordset[0]['DATOS']);
  for (const r of data) {
    if (r.respuesta_ia && (r.respuesta_ia.includes('Tecnoglass') || r.respuesta_ia.includes('Ternium'))) {
      console.log('Found:', r.nombre_completo);
      const ia = typeof r.respuesta_ia === 'string' ? JSON.parse(r.respuesta_ia) : r.respuesta_ia;
      console.log(JSON.stringify(ia, null, 2));
    }
  }
  process.exit(0);
})();
