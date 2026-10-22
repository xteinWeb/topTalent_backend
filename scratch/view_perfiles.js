const sql = require('mssql');
require('dotenv').config({ path: '../.env' });

async function viewPerfiles() {
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
    const res = await pool.request().query('SELECT id, area, cargo, empresa_id, fecha_creacion FROM perfiles_cargo ORDER BY cargo');
    console.log(`Perfiles en PROD (${res.recordset.length}):`);
    console.table(res.recordset);
    await pool.close();
  } catch (err) {
    console.error(err);
  }
}

viewPerfiles();
