const sql = require('mssql');
require('dotenv').config({ path: '../.env' });

async function dryRunSync() {
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

    console.log('Verificando perfiles que se copiarían de PROD a DEV:');
    const perfilesToCopy = await pool.request().query(`
      SELECT src.id, src.cargo, src.area
      FROM [TOP_TALENT].[dbo].[perfiles_cargo] src
      WHERE NOT EXISTS (
        SELECT 1 FROM [TOP_TALENT_DEV].[dbo].[perfiles_cargo] dest WHERE dest.id = src.id
      )
    `);
    console.log(`Perfiles nuevos a insertar en DEV (${perfilesToCopy.recordset.length}):`);
    console.table(perfilesToCopy.recordset);

    console.log('\nVerificando vacantes que se copiarían de PROD a DEV:');
    const vacantesToCopy = await pool.request().query(`
      SELECT src.id, src.titulo, src.estado, src.perfil_id
      FROM [TOP_TALENT].[dbo].[vacantes] src
      WHERE NOT EXISTS (
        SELECT 1 FROM [TOP_TALENT_DEV].[dbo].[vacantes] dest WHERE dest.id = src.id
      )
    `);
    console.log(`Vacantes nuevas a insertar en DEV (${vacantesToCopy.recordset.length}):`);
    console.table(vacantesToCopy.recordset);

    await pool.close();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

dryRunSync();
