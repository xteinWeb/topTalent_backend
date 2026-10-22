const sql = require('mssql');
require('dotenv').config({ path: '../.env' });

async function viewDevData() {
  const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    port: parseInt(process.env.DB_PORT || '9788', 10),
    database: 'TOP_TALENT_DEV',
    options: {
      encrypt: false,
      trustServerCertificate: true
    }
  };

  try {
    const pool = await sql.connect(config);
    const p = await pool.request().query('SELECT id, area, cargo, empresa_id FROM perfiles_cargo');
    console.log('Perfiles en DEV:');
    console.table(p.recordset);

    const v = await pool.request().query('SELECT id, perfil_id, titulo, estado, empresa_id FROM vacantes');
    console.log('Vacantes en DEV:');
    console.table(v.recordset);

    const pos = await pool.request().query('SELECT id, vacante_id, candidato_id FROM postulaciones');
    console.log(`Postulaciones en DEV: ${pos.recordset.length}`);

    await pool.close();
  } catch (err) {
    console.error(err);
  }
}

viewDevData();
