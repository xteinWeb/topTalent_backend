const sql = require('mssql');
require('dotenv').config({ path: '../.env' });

async function checkDetails() {
  const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    port: parseInt(process.env.DB_PORT || '9788', 10),
    database: 'master',
    options: {
      encrypt: false,
      trustServerCertificate: true,
      connectTimeout: 5000
    }
  };

  try {
    const pool = await sql.connect(config);

    console.log('--- CONTEOS EN TOP_TALENT (PRODUCCIÓN) ---');
    const pEmpresas = await pool.request().query('SELECT * FROM [TOP_TALENT].[dbo].[empresas]');
    console.log('Empresas (PROD):', pEmpresas.recordset);

    const pPerfiles = await pool.request().query('SELECT id, titulo_cargo, area_departamento, estado FROM [TOP_TALENT].[dbo].[perfiles_cargo]');
    console.log(`Perfiles (PROD) [Total ${pPerfiles.recordset.length}]:`, pPerfiles.recordset);

    const pVacantes = await pool.request().query('SELECT id, titulo, empresa_id, perfil_cargo_id, estado FROM [TOP_TALENT].[dbo].[vacantes]');
    console.log(`Vacantes (PROD) [Total ${pVacantes.recordset.length}]:`, pVacantes.recordset);

    console.log('\n--- CONTEOS EN TOP_TALENT_DEV (DESARROLLO) ---');
    const dEmpresas = await pool.request().query('SELECT * FROM [TOP_TALENT_DEV].[dbo].[empresas]');
    console.log('Empresas (DEV):', dEmpresas.recordset);

    const dPerfiles = await pool.request().query('SELECT id, titulo_cargo, area_departamento, estado FROM [TOP_TALENT_DEV].[dbo].[perfiles_cargo]');
    console.log(`Perfiles (DEV) [Total ${dPerfiles.recordset.length}]:`, dPerfiles.recordset);

    const dVacantes = await pool.request().query('SELECT id, titulo, empresa_id, perfil_cargo_id, estado FROM [TOP_TALENT_DEV].[dbo].[vacantes]');
    console.log(`Vacantes (DEV) [Total ${dVacantes.recordset.length}]:`, dVacantes.recordset);

    await pool.close();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

checkDetails();
