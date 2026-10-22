const sql = require('mssql');
require('dotenv').config({ path: '../.env' });

async function inspectSchema() {
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

    const tables = ['perfiles_cargo', 'vacantes'];

    for (const t of tables) {
      console.log(`\n================= TABLA: ${t} =================`);
      const prodCols = await pool.request().query(`
        SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
        FROM [TOP_TALENT].INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = '${t}'
        ORDER BY ORDINAL_POSITION
      `);
      console.log(`Columnas en PROD (${prodCols.recordset.length}):`, prodCols.recordset.map(c => c.COLUMN_NAME).join(', '));

      const devCols = await pool.request().query(`
        SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
        FROM [TOP_TALENT_DEV].INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = '${t}'
        ORDER BY ORDINAL_POSITION
      `);
      console.log(`Columnas en DEV (${devCols.recordset.length}):`, devCols.recordset.map(c => c.COLUMN_NAME).join(', '));

      const pNames = prodCols.recordset.map(c => c.COLUMN_NAME);
      const dNames = devCols.recordset.map(c => c.COLUMN_NAME);

      const diff1 = pNames.filter(x => !dNames.includes(x));
      const diff2 = dNames.filter(x => !pNames.includes(x));
      if (diff1.length) console.log(`En PROD pero NO en DEV:`, diff1);
      if (diff2.length) console.log(`En DEV pero NO en PROD:`, diff2);

      const prodData = await pool.request().query(`SELECT * FROM [TOP_TALENT].[dbo].[${t}]`);
      console.log(`Registros en PROD (${prodData.recordset.length}):`);
      prodData.recordset.forEach(r => {
        console.log(` - ID: ${r.id} | Titulo/Nombre: ${r.titulo_cargo || r.titulo}`);
      });

      const devData = await pool.request().query(`SELECT * FROM [TOP_TALENT_DEV].[dbo].[${t}]`);
      console.log(`Registros en DEV (${devData.recordset.length}):`);
      devData.recordset.forEach(r => {
        console.log(` - ID: ${r.id} | Titulo/Nombre: ${r.titulo_cargo || r.titulo}`);
      });
    }

    await pool.close();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

inspectSchema();
