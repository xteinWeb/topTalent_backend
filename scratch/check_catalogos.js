const sql = require('mssql');
require('dotenv').config({ path: '../.env' });

async function checkCatalogos() {
  const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    port: parseInt(process.env.DB_PORT || '9788', 10),
    database: 'master',
    options: {
      encrypt: false,
      trustServerCertificate: true
    }
  };

  try {
    const pool = await sql.connect(config);
    const prod = await pool.request().query('SELECT COUNT(*) as t FROM [TOP_TALENT].[dbo].[catalogos]');
    const dev = await pool.request().query('SELECT COUNT(*) as t FROM [TOP_TALENT_DEV].[dbo].[catalogos]');
    console.log(`Catalogos - PROD: ${prod.recordset[0].t} | DEV: ${dev.recordset[0].t}`);
    await pool.close();
  } catch (err) {
    console.error(err);
  }
}

checkCatalogos();
