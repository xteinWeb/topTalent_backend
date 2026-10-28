// Columnas para la recuperación de contraseña (código temporal enviado por correo) de candidatos y usuarios internos.
// Debe ejecutarse antes de crear/actualizar spCandidatos y spUsuariosAdmin, que las referencian.
async function migrateRecuperacionPassword(pool) {
  for (const tabla of ['candidatos', 'usuarios_admin']) {
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${tabla}' AND COLUMN_NAME = 'codigo_recuperacion')
      BEGIN
          ALTER TABLE ${tabla} ADD codigo_recuperacion NVARCHAR(10) NULL;
      END
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${tabla}' AND COLUMN_NAME = 'codigo_recuperacion_expira')
      BEGIN
          ALTER TABLE ${tabla} ADD codigo_recuperacion_expira DATETIME2 NULL;
      END
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${tabla}' AND COLUMN_NAME = 'intentos_recuperacion')
      BEGIN
          ALTER TABLE ${tabla} ADD intentos_recuperacion INT NOT NULL CONSTRAINT DF_${tabla}_intentos_recuperacion DEFAULT 0;
      END
    `);
    console.log(`Columnas de recuperación de contraseña verificadas en "${tabla}".`);
  }
}

module.exports = { migrateRecuperacionPassword };
