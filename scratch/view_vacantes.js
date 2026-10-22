const sql = require('mssql');
require('dotenv').config({ path: '../.env' });

async function viewVacantes() {
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
    const res = await pool.request().query('SELECT id, perfil_id, titulo, estado, empresa_id, requiere_registro, fecha_creacion FROM vacantes ORDER BY fecha_creacion DESC');
    console.log(`Vacantes en PROD (${res.recordset.length}):`);
    console.table(res.recordset);
    await pool.close();
  } catch (err) {
    console.error(err);
  }
}

viewVacantes();
