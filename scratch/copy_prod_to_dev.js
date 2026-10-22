const sql = require('mssql');
require('dotenv').config({ path: '../.env' });

async function executeSync() {
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

    // 1. Copiar perfiles de cargo
    console.log('Copiando perfiles de cargo de PROD a DEV...');
    const qPerfiles = `
      INSERT INTO [TOP_TALENT_DEV].[dbo].[perfiles_cargo] (
        id, empresa_id, area, cargo, perfil_json, fecha_creacion, fecha_actualizacion
      )
      SELECT 
        id, empresa_id, area, cargo, perfil_json, fecha_creacion, fecha_actualizacion
      FROM [TOP_TALENT].[dbo].[perfiles_cargo] src
      WHERE NOT EXISTS (
        SELECT 1 FROM [TOP_TALENT_DEV].[dbo].[perfiles_cargo] dest WHERE dest.id = src.id
      );
    `;
    const resPerfiles = await pool.request().query(qPerfiles);
    console.log(`✅ Perfiles copiados: ${resPerfiles.rowsAffected[0]} filas insertadas.`);

    // 2. Copiar vacantes
    console.log('Copiando vacantes de PROD a DEV...');
    const qVacantes = `
      INSERT INTO [TOP_TALENT_DEV].[dbo].[vacantes] (
        id, empresa_id, perfil_id, titulo, descripcion, estado, 
        requiere_registro, configuracion_json, fecha_creacion, fecha_actualizacion,
        estado_aprobacion
      )
      SELECT 
        id, empresa_id, perfil_id, titulo, descripcion, estado, 
        requiere_registro, configuracion_json, fecha_creacion, fecha_actualizacion,
        'APROBADA'
      FROM [TOP_TALENT].[dbo].[vacantes] src
      WHERE NOT EXISTS (
        SELECT 1 FROM [TOP_TALENT_DEV].[dbo].[vacantes] dest WHERE dest.id = src.id
      );
    `;
    const resVacantes = await pool.request().query(qVacantes);
    console.log(`✅ Vacantes copiadas: ${resVacantes.rowsAffected[0]} filas insertadas.`);

    // 3. Verificación final en DEV
    const totalP = await pool.request().query('SELECT COUNT(*) as t FROM [TOP_TALENT_DEV].[dbo].[perfiles_cargo]');
    const totalV = await pool.request().query('SELECT COUNT(*) as t FROM [TOP_TALENT_DEV].[dbo].[vacantes]');
    console.log(`\n🎉 Total actual en DEV: ${totalP.recordset[0].t} perfiles de cargo, ${totalV.recordset[0].t} vacantes.`);

    await pool.close();
  } catch (err) {
    console.error('Error durante la copia:', err.message);
  }
}

executeSync();
