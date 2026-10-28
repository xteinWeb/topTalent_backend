// Prefiltro de candidatos (llamada telefónica o formulario enviado por WhatsApp con enlace de un solo uso).
// - prefiltro_json: intentos de llamada, respuestas, canal y resultado (Pasa / No pasa) decidido por Talento Humano.
// - prefiltro_token_hash: SHA-256 del token del enlace (el token en claro solo existe en el enlace enviado).
// Debe ejecutarse antes de crear/actualizar spPostulaciones.
async function migratePrefiltro(pool) {
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'postulaciones' AND COLUMN_NAME = 'prefiltro_json')
    BEGIN
        ALTER TABLE postulaciones ADD prefiltro_json NVARCHAR(MAX) NULL;
    END
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'postulaciones' AND COLUMN_NAME = 'prefiltro_token_hash')
    BEGIN
        ALTER TABLE postulaciones ADD prefiltro_token_hash CHAR(64) NULL;
    END
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'postulaciones' AND COLUMN_NAME = 'prefiltro_token_expira')
    BEGIN
        ALTER TABLE postulaciones ADD prefiltro_token_expira DATETIME2 NULL;
    END
  `);
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_postulaciones_prefiltro_token' AND object_id = OBJECT_ID('postulaciones'))
    BEGIN
        CREATE INDEX IX_postulaciones_prefiltro_token ON postulaciones (prefiltro_token_hash) WHERE prefiltro_token_hash IS NOT NULL;
    END
  `);
  console.log('Columnas del prefiltro verificadas (prefiltro_json, prefiltro_token_hash, prefiltro_token_expira).');
}

module.exports = { migratePrefiltro };
