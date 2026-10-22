const sql = require('mssql');
require('dotenv').config({ path: '../.env' });

async function inspectIAData() {
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
    const res = await pool.request().query(`
      SELECT TOP 5 
        id, 
        candidato_id, 
        puntuacion_ia, 
        estado_ia, 
        json_analisis_ia, 
        respuesta_ia 
      FROM postulaciones 
      WHERE json_analisis_ia IS NOT NULL OR respuesta_ia IS NOT NULL
    `);

    console.log(`Encontradas ${res.recordset.length} postulaciones con datos IA:`);
    res.recordset.forEach((r, i) => {
      console.log(`\n--- [${i+1}] ID: ${r.id} | Score: ${r.puntuacion_ia} ---`);
      console.log('json_analisis_ia (tipo):', typeof r.json_analisis_ia);
      if (r.json_analisis_ia) {
        try {
          const parsed = JSON.parse(r.json_analisis_ia);
          console.log('Keys en json_analisis_ia:', Object.keys(parsed));
          console.log('Contenido json_analisis_ia:', JSON.stringify(parsed, null, 2).slice(0, 500));
        } catch (e) {
          console.log('json_analisis_ia raw:', String(r.json_analisis_ia).slice(0, 300));
        }
      }
      if (r.respuesta_ia) {
        console.log('respuesta_ia (tipo):', typeof r.respuesta_ia);
        try {
          const parsedRes = JSON.parse(r.respuesta_ia);
          console.log('Keys en respuesta_ia:', Object.keys(parsedRes));
          console.log('Contenido respuesta_ia:', JSON.stringify(parsedRes, null, 2).slice(0, 500));
        } catch (e) {
          console.log('respuesta_ia raw:', String(r.respuesta_ia).slice(0, 300));
        }
      }
    });

    await pool.close();
  } catch (err) {
    console.error(err);
  }
}

inspectIAData();
