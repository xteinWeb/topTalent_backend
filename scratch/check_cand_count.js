const sql = require('mssql');
require('dotenv').config({ path: '../.env' });

async function checkCandCount() {
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
    const c = await pool.request().query('SELECT COUNT(*) as total FROM candidatos');
    const p = await pool.request().query('SELECT COUNT(*) as total FROM postulaciones');
    console.log(`En PROD hay ${c.recordset[0].total} candidatos y ${p.recordset[0].total} postulaciones.`);
    await pool.close();
  } catch (err) {
    console.error(err);
  }
}

checkCandCount();
