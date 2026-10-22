const sql = require('mssql');
require('dotenv').config({ path: '../.env' });

async function inspectCandidatosPostulaciones() {
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

    for (const t of ['candidatos', 'postulaciones']) {
      console.log(`\n================= TABLA: ${t} =================`);
      const prodCols = await pool.request().query(`
        SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
        FROM [TOP_TALENT].INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = '${t}'
        ORDER BY ORDINAL_POSITION
      `);
      const devCols = await pool.request().query(`
        SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
        FROM [TOP_TALENT_DEV].INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = '${t}'
        ORDER BY ORDINAL_POSITION
      `);

      const pNames = prodCols.recordset.map(c => c.COLUMN_NAME);
      const dNames = devCols.recordset.map(c => c.COLUMN_NAME);

      console.log(`Columnas en PROD (${pNames.length}):`, pNames.join(', '));
      console.log(`Columnas en DEV (${dNames.length}):`, dNames.join(', '));

      const diff1 = pNames.filter(x => !dNames.includes(x));
      const diff2 = dNames.filter(x => !pNames.includes(x));
      if (diff1.length) console.log(`En PROD pero NO en DEV:`, diff1);
      if (diff2.length) console.log(`En DEV pero NO en PROD:`, diff2);

      const prodCount = await pool.request().query(`SELECT COUNT(*) as total FROM [TOP_TALENT].[dbo].[${t}]`);
      const devCount = await pool.request().query(`SELECT COUNT(*) as total FROM [TOP_TALENT_DEV].[dbo].[${t}]`);
      console.log(`Conteo - PROD: ${prodCount.recordset[0].total} | DEV: ${devCount.recordset[0].total}`);
    }

    await pool.close();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

inspectCandidatosPostulaciones();
