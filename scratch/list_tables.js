const sql = require('mssql');
require('dotenv').config({ path: '../.env' });

async function listTables() {
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

    for (const dbName of ['TOP_TALENT', 'TOP_TALENT_DEV']) {
      console.log(`\n=== Tablas en ${dbName} ===`);
      const res = await pool.request().query(`
        SELECT TABLE_NAME 
        FROM [${dbName}].INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_TYPE = 'BASE TABLE'
        ORDER BY TABLE_NAME
      `);
      console.log(res.recordset.map(r => r.TABLE_NAME));
    }

    await pool.close();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

listTables();
