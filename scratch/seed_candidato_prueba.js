// Crea (si no existe) un candidato de PRUEBA ya verificado en la BD de desarrollo, sin enviar correos.
// Uso: node scratch/seed_candidato_prueba.js   (desde recepcion_hojas_de_vida_backend)
// Credenciales de prueba (solo DEV; el dominio example.com no recibe correo real):
const EMAIL = 'candidato.prueba@example.com';
// (Si alguien la cambia con "¿Olvidaste tu contraseña?", actualizar esta constante)
const PASSWORD = 'Prueba-Nueva-7Hq2';

process.chdir(require('path').join(__dirname, '..'));
const bcrypt = require('bcryptjs');
const { poolPromise, sql } = require('../config/db');
const { VERSION_TRATAMIENTO_DATOS } = require('../config/legal');

(async () => {
  if (!/_DEV$/i.test(process.env.DB_NAME || '')) {
    throw new Error(`Este script solo corre contra una BD *_DEV (DB_NAME actual: ${process.env.DB_NAME}).`);
  }
  const pool = await poolPromise;

  const existe = await pool.request()
    .input('ACCION', sql.VarChar(50), 'SELECT_BY_EMAIL')
    .input('DATA_JSON', sql.VarChar, JSON.stringify({ email: EMAIL }))
    .execute('spCandidatos');
  if (existe.recordset[0]['DATOS']) {
    console.log(`El candidato de prueba ${EMAIL} ya existe.`);
    process.exit(0);
  }

  await pool.request()
    .input('ACCION', sql.VarChar(50), 'INSERT')
    .input('DATA_JSON', sql.VarChar, JSON.stringify({
      email: EMAIL,
      password_hash: await bcrypt.hash(PASSWORD, 10),
      verificado: 1,
      acepto_tratamiento_datos: true,
      version_tratamiento_datos: VERSION_TRATAMIENTO_DATOS
    }))
    .execute('spCandidatos');
  console.log(`Candidato de prueba creado: ${EMAIL} (contraseña en este archivo).`);
  process.exit(0);
})().catch(err => {
  console.error(err.message);
  process.exit(1);
});
