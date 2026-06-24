const { poolPromise } = require('../config/db');

async function test() {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('ACCION', 'SELECT_ALL')
      .input('DATA_JSON', null)
      .execute('spPerfilesCargo');
    
    console.log('DATOS RAW:', result.recordset[0]["DATOS"]);
  } catch (err) {
    console.error(err);
  }
  process.exit(0);
}

test();
