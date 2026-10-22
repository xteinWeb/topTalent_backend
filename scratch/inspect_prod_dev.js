const sql = require('mssql');
require('dotenv').config({ path: '../.env' });

async function inspect() {
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
    console.log(`Conectando a ${config.server}:${config.port}...`);
    const pool = await sql.connect(config);
    console.log('✅ Conexión establecida a master.');

    const dbs = await pool.request().query("SELECT name FROM sys.databases WHERE name LIKE '%TALENT%' OR name LIKE '%TOP%'");
    console.log('Bases de datos encontradas:', dbs.recordset.map(r => r.name));

    // Ver conteo de vacantes y perfiles en TOP_TALENT (Producción) vs TOP_TALENT_DEV
    for (const dbName of ['TOP_TALENT', 'TOP_TALENT_DEV']) {
      try {
        const checkTables = await pool.request().query(`
          SELECT 
            (SELECT COUNT(*) FROM [${dbName}].sys.tables WHERE name = 'vacantes') as has_vacantes,
            (SELECT COUNT(*) FROM [${dbName}].sys.tables WHERE name = 'perfiles_puesto') as has_perfiles
        `);
        console.log(`\n--- DB: ${dbName} ---`);
        if (checkTables.recordset[0].has_vacantes > 0) {
          const vCount = await pool.request().query(`SELECT COUNT(*) as total FROM [${dbName}].[dbo].[vacantes]`);
          console.log(`Vacantes en ${dbName}: ${vCount.recordset[0].total}`);
        } else {
          console.log(`Tabla 'vacantes' no existe en ${dbName}`);
        }

        if (checkTables.recordset[0].has_perfiles > 0) {
          const pCount = await pool.request().query(`SELECT COUNT(*) as total FROM [${dbName}].[dbo].[perfiles_puesto]`);
          console.log(`Perfiles en ${dbName}: ${pCount.recordset[0].total}`);
        } else {
          console.log(`Tabla 'perfiles_puesto' no existe en ${dbName}`);
        }
      } catch (errDb) {
        console.log(`No se pudo consultar ${dbName}:`, errDb.message);
      }
    }

    await pool.close();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

inspect();
