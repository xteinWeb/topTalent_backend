const sql = require('mssql');

async function testConnection(server, port) {
  const config = {
    user: 'sa',
    password: 'sql2025SEadmin',
    server: server,
    port: port,
    database: 'TOP_TALENT',
    options: {
      encrypt: false,
      trustServerCertificate: true,
      connectTimeout: 4000
    }
  };

  try {
    console.log(`Intentando conectar a ${server}:${port}...`);
    const pool = await sql.connect(config);
    console.log(`✅ CONEXIÓN EXITOSA a ${server}:${port}!`);
    const result = await pool.request().query('SELECT @@SERVERNAME as srv, DB_NAME() as db');
    console.log('Servidor:', result.recordset[0]);
    await pool.close();
    return true;
  } catch (err) {
    console.log(`❌ Falló ${server}:${port}:`, err.message);
    return false;
  }
}

async function run() {
  await testConnection('localhost', 1433);
  await testConnection('127.0.0.1', 1433);
  await testConnection('190.109.9.70', 1433);
  await testConnection('190.109.9.70', 9788);
}

run();
