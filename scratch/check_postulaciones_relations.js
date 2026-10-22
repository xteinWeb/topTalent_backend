const sql = require('mssql');
require('dotenv').config({ path: '../.env' });

async function checkPostulacionesRelations() {
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

    const res = await pool.request().query(`
      SELECT 
        p.id,
        p.fecha_postulacion,
        p.vacante_id,
        v.titulo as vacante_titulo,
        p.candidato_id,
        c.email as candidato_email,
        JSON_VALUE(c.perfil_completo_json, '$.datos_personales.nombre_completo') as nombre_completo,
        p.estado_ia,
        p.puntuacion_ia
      FROM [TOP_TALENT].[dbo].[postulaciones] p
      LEFT JOIN [TOP_TALENT].[dbo].[vacantes] v ON p.vacante_id = v.id
      LEFT JOIN [TOP_TALENT].[dbo].[candidatos] c ON p.candidato_id = c.id
      ORDER BY p.fecha_postulacion DESC
    `);

    console.log(`Postulaciones en PROD (${res.recordset.length}):`);
    console.table(res.recordset.map(r => ({
      id: r.id,
      candidato: r.nombre_completo || r.candidato_email,
      vacante: r.vacante_titulo,
      fecha: r.fecha_postulacion,
      ia_score: r.puntuacion_ia,
      estado_ia: r.estado_ia
    })));

    await pool.close();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

checkPostulacionesRelations();
