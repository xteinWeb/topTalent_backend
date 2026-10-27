// Mejoras del proceso de selección (oct. 2026):
// - Líder de área responsable de cada perfil de cargo (filtra lo que ve el líder).
// - Motivo obligatorio cuando un postulante queda "No aprobado".
// - Resultado de la prueba psicotécnica adjunto a la postulación.
// Debe ejecutarse después de crear las tablas y antes de crear/actualizar los SP que usan estas columnas.
async function migrateMejorasSeleccion(pool) {
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'perfiles_cargo' AND COLUMN_NAME = 'lider_id')
    BEGIN
        ALTER TABLE perfiles_cargo ADD lider_id UNIQUEIDENTIFIER NULL
            CONSTRAINT FK_perfiles_cargo_lider FOREIGN KEY REFERENCES usuarios_admin(id);
    END

    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'postulaciones' AND COLUMN_NAME = 'motivo_no_aprobado')
    BEGIN
        ALTER TABLE postulaciones ADD motivo_no_aprobado NVARCHAR(150) NULL;
    END
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'postulaciones' AND COLUMN_NAME = 'motivo_no_aprobado_detalle')
    BEGIN
        ALTER TABLE postulaciones ADD motivo_no_aprobado_detalle NVARCHAR(MAX) NULL;
    END

    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'postulaciones' AND COLUMN_NAME = 'prueba_psicotecnica_nombre')
    BEGIN
        ALTER TABLE postulaciones ADD prueba_psicotecnica_nombre NVARCHAR(250) NULL;
    END
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'postulaciones' AND COLUMN_NAME = 'prueba_psicotecnica_ruta')
    BEGIN
        ALTER TABLE postulaciones ADD prueba_psicotecnica_ruta NVARCHAR(500) NULL;
    END
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'postulaciones' AND COLUMN_NAME = 'prueba_psicotecnica_fecha')
    BEGIN
        ALTER TABLE postulaciones ADD prueba_psicotecnica_fecha DATETIME2 NULL;
    END
  `);
  console.log('Columnas de mejoras de selección verificadas (lider_id, motivo_no_aprobado, prueba_psicotecnica).');
}

module.exports = { migrateMejorasSeleccion };
