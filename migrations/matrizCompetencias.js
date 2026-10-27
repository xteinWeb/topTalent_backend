const path = require('path');
const { sql } = require('../config/db');

// Matriz de competencias por grupo de cargo (tablas, semilla desde el Excel ARTDECON y spCompetencias)
// y grupo de cargo en perfiles_cargo. Debe ejecutarse antes de crear/actualizar spPerfilesCargo y spPostulaciones.
const SEMILLA = require(path.join(__dirname, 'data', 'matriz_competencias_artdecon.json'));

async function migrateMatrizCompetencias(pool) {
  // 1. Tablas
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'competencias')
    BEGIN
      CREATE TABLE competencias (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_competencias PRIMARY KEY DEFAULT NEWID(),
        empresa_id VARCHAR(20) NOT NULL DEFAULT '00' CONSTRAINT FK_competencias_empresas FOREIGN KEY REFERENCES empresas(id),
        categoria NVARCHAR(20) NOT NULL,
        nombre NVARCHAR(150) NOT NULL,
        definicion NVARCHAR(MAX) NULL,
        conductas_observables NVARCHAR(MAX) NULL,
        justificacion_peso NVARCHAR(MAX) NULL,
        riesgo_organizacional NVARCHAR(MAX) NULL,
        pregunta_seleccion NVARCHAR(MAX) NULL,
        criterio_evaluacion NVARCHAR(MAX) NULL,
        orden INT NOT NULL DEFAULT 0,
        activo BIT NOT NULL DEFAULT 1,
        fecha_creacion DATETIME2 NOT NULL DEFAULT GETDATE(),
        fecha_actualizacion DATETIME2 NOT NULL DEFAULT GETDATE()
      );
    END

    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'competencias_grupo')
    BEGIN
      CREATE TABLE competencias_grupo (
        competencia_id UNIQUEIDENTIFIER NOT NULL
          CONSTRAINT FK_competencias_grupo_competencia FOREIGN KEY REFERENCES competencias(id) ON DELETE CASCADE,
        grupo NVARCHAR(20) NOT NULL,
        nivel_requerido DECIMAL(3,1) NOT NULL,
        peso DECIMAL(6,4) NOT NULL,
        CONSTRAINT PK_competencias_grupo PRIMARY KEY (competencia_id, grupo)
      );
    END

    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'perfiles_cargo' AND COLUMN_NAME = 'grupo_cargo')
    BEGIN
      ALTER TABLE perfiles_cargo ADD grupo_cargo NVARCHAR(20) NULL;
    END
  `);

  // 2. Semilla (solo si la empresa 00 aún no tiene competencias)
  const existentes = (await pool.request()
    .query("SELECT COUNT(*) AS total FROM competencias WHERE empresa_id = '00'")).recordset[0].total;
  if (existentes === 0) {
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      for (let i = 0; i < SEMILLA.length; i++) {
        const c = SEMILLA[i];
        const inserted = await new sql.Request(tx)
          .input('categoria', sql.NVarChar(20), c.categoria)
          .input('nombre', sql.NVarChar(150), c.nombre)
          .input('definicion', sql.NVarChar(sql.MAX), c.definicion)
          .input('conductas', sql.NVarChar(sql.MAX), c.conductas_observables)
          .input('justificacion', sql.NVarChar(sql.MAX), c.justificacion_peso)
          .input('riesgo', sql.NVarChar(sql.MAX), c.riesgo_organizacional)
          .input('pregunta', sql.NVarChar(sql.MAX), c.pregunta_seleccion)
          .input('criterio', sql.NVarChar(sql.MAX), c.criterio_evaluacion)
          .input('orden', sql.Int, i + 1)
          .query(`
            INSERT INTO competencias (empresa_id, categoria, nombre, definicion, conductas_observables, justificacion_peso,
                                      riesgo_organizacional, pregunta_seleccion, criterio_evaluacion, orden)
            OUTPUT INSERTED.id
            VALUES ('00', @categoria, @nombre, @definicion, @conductas, @justificacion, @riesgo, @pregunta, @criterio, @orden)
          `);
        const id = inserted.recordset[0].id;
        for (const [grupo, valores] of Object.entries(c.grupos)) {
          await new sql.Request(tx)
            .input('id', sql.UniqueIdentifier, id)
            .input('grupo', sql.NVarChar(20), grupo)
            .input('nivel', sql.Decimal(3, 1), valores.nivel_requerido)
            .input('peso', sql.Decimal(6, 4), valores.peso)
            .query('INSERT INTO competencias_grupo (competencia_id, grupo, nivel_requerido, peso) VALUES (@id, @grupo, @nivel, @peso)');
        }
      }
      await tx.commit();
      console.log(`Matriz de competencias sembrada con ${SEMILLA.length} competencias.`);
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  } else {
    console.log('Matriz de competencias ya tenía datos. Se omite la semilla.');
  }

  // 3. Stored procedure
  await pool.request().query(`
    CREATE OR ALTER PROCEDURE spCompetencias
        @ACCION VARCHAR(50),
        @DATA_JSON NVARCHAR(MAX) = NULL
    AS
    BEGIN
        SET NOCOUNT ON;

        DECLARE @id UNIQUEIDENTIFIER = NULL;
        DECLARE @empresa_id VARCHAR(20) = NULL;
        DECLARE @incluir_inactivas BIT = 0;

        IF @DATA_JSON IS NOT NULL AND ISJSON(@DATA_JSON) > 0
        BEGIN
            SET @id = TRY_CAST(JSON_VALUE(@DATA_JSON, '$.id') AS UNIQUEIDENTIFIER);
            SET @empresa_id = JSON_VALUE(@DATA_JSON, '$.empresa_id');
            SET @incluir_inactivas = ISNULL(TRY_CAST(JSON_VALUE(@DATA_JSON, '$.incluir_inactivas') AS BIT), 0);
        END

        IF @ACCION = 'SELECT_ALL'
        BEGIN
            SELECT (
                SELECT c.id, c.empresa_id, c.categoria, c.nombre, c.definicion, c.conductas_observables,
                       c.justificacion_peso, c.riesgo_organizacional, c.pregunta_seleccion, c.criterio_evaluacion,
                       c.orden, c.activo, c.fecha_actualizacion,
                       (SELECT g.grupo, g.nivel_requerido, g.peso
                        FROM competencias_grupo g
                        WHERE g.competencia_id = c.id
                        FOR JSON PATH) AS grupos
                FROM competencias c
                WHERE c.empresa_id = ISNULL(@empresa_id, '00')
                  AND (@incluir_inactivas = 1 OR c.activo = 1)
                ORDER BY c.orden, c.nombre
                FOR JSON PATH
            ) AS DATOS;
        END
        ELSE IF @ACCION = 'GUARDAR'
        BEGIN
            -- Inserta o actualiza una competencia y reemplaza sus niveles/pesos por grupo
            IF @id IS NULL OR NOT EXISTS (SELECT 1 FROM competencias WHERE id = @id)
            BEGIN
                SET @id = ISNULL(@id, NEWID());
                INSERT INTO competencias (id, empresa_id, categoria, nombre, definicion, conductas_observables, justificacion_peso,
                                          riesgo_organizacional, pregunta_seleccion, criterio_evaluacion, orden, activo)
                SELECT @id, ISNULL(@empresa_id, '00'), j.categoria, j.nombre, j.definicion, j.conductas_observables, j.justificacion_peso,
                       j.riesgo_organizacional, j.pregunta_seleccion, j.criterio_evaluacion, ISNULL(j.orden, 0), ISNULL(j.activo, 1)
                FROM OPENJSON(@DATA_JSON) WITH (
                    categoria NVARCHAR(20), nombre NVARCHAR(150), definicion NVARCHAR(MAX), conductas_observables NVARCHAR(MAX),
                    justificacion_peso NVARCHAR(MAX), riesgo_organizacional NVARCHAR(MAX), pregunta_seleccion NVARCHAR(MAX),
                    criterio_evaluacion NVARCHAR(MAX), orden INT, activo BIT
                ) j;
            END
            ELSE
            BEGIN
                UPDATE c
                SET categoria = j.categoria, nombre = j.nombre, definicion = j.definicion,
                    conductas_observables = j.conductas_observables, justificacion_peso = j.justificacion_peso,
                    riesgo_organizacional = j.riesgo_organizacional, pregunta_seleccion = j.pregunta_seleccion,
                    criterio_evaluacion = j.criterio_evaluacion, orden = ISNULL(j.orden, c.orden),
                    activo = ISNULL(j.activo, c.activo), fecha_actualizacion = GETDATE()
                FROM competencias c
                CROSS APPLY OPENJSON(@DATA_JSON) WITH (
                    categoria NVARCHAR(20), nombre NVARCHAR(150), definicion NVARCHAR(MAX), conductas_observables NVARCHAR(MAX),
                    justificacion_peso NVARCHAR(MAX), riesgo_organizacional NVARCHAR(MAX), pregunta_seleccion NVARCHAR(MAX),
                    criterio_evaluacion NVARCHAR(MAX), orden INT, activo BIT
                ) j
                WHERE c.id = @id;
            END

            DELETE FROM competencias_grupo WHERE competencia_id = @id;
            INSERT INTO competencias_grupo (competencia_id, grupo, nivel_requerido, peso)
            SELECT @id, g.grupo, g.nivel_requerido, g.peso
            FROM OPENJSON(@DATA_JSON, '$.grupos') WITH (grupo NVARCHAR(20), nivel_requerido DECIMAL(3,1), peso DECIMAL(6,4)) g;

            SELECT (SELECT @id AS id FOR JSON PATH, WITHOUT_ARRAY_WRAPPER) AS DATOS;
        END
    END;
  `);
  console.log('Procedure "spCompetencias" created/updated.');
}

module.exports = { migrateMatrizCompetencias };
