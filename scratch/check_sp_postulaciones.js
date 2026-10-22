const sql = require('mssql');
require('dotenv').config({ path: '../.env' });

async function checkSpPostulaciones() {
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
    const res = await pool.request()
      .input('ACCION', sql.VarChar(50), 'SELECT_ALL')
      .input('DATA_JSON', sql.VarChar, null)
      .execute('spPostulaciones');

    const data = JSON.parse(res.recordset[0]["DATOS"]);
    console.log(`spPostulaciones SELECT_ALL devolvió ${data.length} filas.`);
    const sample = data.find(d => d.respuesta_ia || d.json_analisis_ia);
    if (sample) {
      console.log('Keys en postulación con IA:', Object.keys(sample));
      console.log('Tipo de respuesta_ia:', typeof sample.respuesta_ia);
      console.log('Tipo de json_analisis_ia:', typeof sample.json_analisis_ia);
      if (typeof sample.respuesta_ia === 'string') {
        try {
          const parsedRes = JSON.parse(sample.respuesta_ia);
          console.log('Keys en respuesta_ia parseada:', Object.keys(parsedRes));
          console.log('Sample respuesta_ia:', parsedRes);
        } catch (e) {
          console.log('Error parseando respuesta_ia:', e.message);
        }
      }
    }
    await pool.close();
  } catch (err) {
    console.error(err);
  }
}

checkSpPostulaciones();
