const sql = require('mssql');
require('dotenv').config({ path: '../.env' });

async function checkHVRutas() {
  const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    port: parseInt(process.env.DB_PORT || '9788', 10),
    database: 'TOP_TALENT',
    options: {
      encrypt: false,
      trustServerCertificate: true
    }
  };

  try {
    const pool = await sql.connect(config);
    const res = await pool.request().query('SELECT id, email, hv_archivo_nombre, hv_archivo_ruta FROM candidatos WHERE hv_archivo_nombre IS NOT NULL');
    console.log(`Candidatos con HV en PROD (${res.recordset.length}):`);
    console.table(res.recordset.map(r => ({ email: r.email, nombre: r.hv_archivo_nombre, ruta: r.hv_archivo_ruta })));
    await pool.close();
  } catch (err) {
    console.error(err);
  }
}

checkHVRutas();
