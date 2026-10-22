const sql = require('mssql');
require('dotenv').config({ path: '../.env' });

async function syncPostulantes() {
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

    // 1. Copiar candidatos
    console.log('--- 1. Copiando Candidatos de TOP_TALENT a TOP_TALENT_DEV ---');
    const qCandidatos = `
      INSERT INTO [TOP_TALENT_DEV].[dbo].[candidatos] (
        id, email, password_hash, perfil_completo_json, hv_archivo_nombre, hv_archivo_ruta,
        codigo_verificacion, verificado, acepto_tratamiento_datos, 
        fecha_aceptacion_tratamiento_datos, version_tratamiento_datos, fecha_creacion, fecha_actualizacion
      )
      SELECT 
        src.id, src.email, src.password_hash, src.perfil_completo_json, src.hv_archivo_nombre, src.hv_archivo_ruta,
        src.codigo_verificacion, src.verificado, src.acepto_tratamiento_datos, 
        src.fecha_aceptacion_tratamiento_datos, src.version_tratamiento_datos, src.fecha_creacion, src.fecha_actualizacion
      FROM [TOP_TALENT].[dbo].[candidatos] src
      WHERE NOT EXISTS (
        SELECT 1 FROM [TOP_TALENT_DEV].[dbo].[candidatos] dest 
        WHERE dest.id = src.id OR dest.email = src.email
      );
    `;
    const resCand = await pool.request().query(qCandidatos);
    console.log(`✅ Candidatos copiados: ${resCand.rowsAffected[0]} registros insertados.`);

    // 2. Copiar postulaciones
    console.log('\n--- 2. Copiando Postulaciones de TOP_TALENT a TOP_TALENT_DEV ---');
    const qPostulaciones = `
      INSERT INTO [TOP_TALENT_DEV].[dbo].[postulaciones] (
        id, vacante_id, candidato_id, fecha_postulacion, respuesta_ia, estado_ia,
        preguntas_respondidas_json, puntuacion_ia, json_analisis_ia, posicion, segunda_validacion,
        estado_postulante
      )
      SELECT 
        src.id, src.vacante_id, src.candidato_id, src.fecha_postulacion, src.respuesta_ia, src.estado_ia,
        src.preguntas_respondidas_json, src.puntuacion_ia, src.json_analisis_ia, src.posicion, src.segunda_validacion,
        'Postulado'
      FROM [TOP_TALENT].[dbo].[postulaciones] src
      WHERE NOT EXISTS (
        SELECT 1 FROM [TOP_TALENT_DEV].[dbo].[postulaciones] dest 
        WHERE dest.id = src.id
      );
    `;
    const resPost = await pool.request().query(qPostulaciones);
    console.log(`✅ Postulaciones copiadas: ${resPost.rowsAffected[0]} registros insertados.`);

    // 3. Verificación final de datos en DEV
    console.log('\n--- 3. Verificación en TOP_TALENT_DEV ---');
    const devCands = await pool.request().query('SELECT COUNT(*) as t FROM [TOP_TALENT_DEV].[dbo].[candidatos]');
    const devPosts = await pool.request().query('SELECT COUNT(*) as t FROM [TOP_TALENT_DEV].[dbo].[postulaciones]');
    console.log(`Total Candidatos en DEV: ${devCands.recordset[0].t}`);
    console.log(`Total Postulaciones en DEV: ${devPosts.recordset[0].t}`);

    const sample = await pool.request().query(`
      SELECT 
        p.id,
        p.fecha_postulacion,
        v.titulo as vacante_titulo,
        c.email,
        JSON_VALUE(c.perfil_completo_json, '$.datos_personales.nombre_completo') as nombre_completo,
        p.puntuacion_ia,
        p.estado_postulante
      FROM [TOP_TALENT_DEV].[dbo].[postulaciones] p
      LEFT JOIN [TOP_TALENT_DEV].[dbo].[vacantes] v ON p.vacante_id = v.id
      LEFT JOIN [TOP_TALENT_DEV].[dbo].[candidatos] c ON p.candidato_id = c.id
      ORDER BY p.fecha_postulacion DESC
    `);
    console.log('\nLista de postulaciones en DEV:');
    console.table(sample.recordset.map(r => ({
      candidato: r.nombre_completo || r.email,
      vacante: r.vacante_titulo,
      ia: r.puntuacion_ia,
      estado: r.estado_postulante
    })));

    await pool.close();
  } catch (err) {
    console.error('Error durante la copia:', err.message);
  }
}

syncPostulantes();
