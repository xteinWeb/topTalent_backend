const { sql } = require('../config/db');

// Estados iniciales (los mismos que antes estaban quemados en código).
// El campo "nombre" es el valor que se guarda en postulaciones.estado_postulante.
const ESTADOS_INICIALES = [
  { nombre: 'Postulado',             descripcion: 'Candidato que envió su hoja de vida.',                         icono: '📥', color_texto: '#1d4ed8', color_fondo: '#eff6ff', color_borde: '#bfdbfe', pipeline: 1, decision: 0 },
  { nombre: 'Preseleccionado',       descripcion: 'Candidato que pasó el filtro inicial.',                        icono: '⭐', color_texto: '#7e22ce', color_fondo: '#faf5ff', color_borde: '#e9d5ff', pipeline: 1, decision: 0 },
  { nombre: 'Citado a Entrevista',   descripcion: 'Candidato con entrevista agendada.',                           icono: '📅', color_texto: '#b45309', color_fondo: '#fffbeb', color_borde: '#fde68a', pipeline: 1, decision: 0 },
  { nombre: 'Aprobado',              descripcion: 'Apto para contratación.',                                      icono: '🟢', color_texto: '#15803d', color_fondo: '#f0fdf4', color_borde: '#bbf7d0', pipeline: 1, decision: 1 },
  { nombre: 'Aprobado con reservas', descripcion: 'Apto con plan de inducción específico.',                       icono: '🟡', color_texto: '#0f766e', color_fondo: '#f0fdfa', color_borde: '#99f6e4', pipeline: 0, decision: 1 },
  { nombre: 'Con observaciones',     descripcion: 'Pendiente validación de referencias o pruebas.',               icono: '🟠', color_texto: '#c2410c', color_fondo: '#fff7ed', color_borde: '#fed7aa', pipeline: 0, decision: 1 },
  { nombre: 'No aprobado',           descripcion: 'No se ajusta al perfil requerido.',                            icono: '🔴', color_texto: '#b91c1c', color_fondo: '#fef2f2', color_borde: '#fecaca', pipeline: 0, decision: 1 }
];

async function migrateEstadosPostulacion(pool) {
  // 1. Tabla
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'estados_postulacion')
    BEGIN
      CREATE TABLE estados_postulacion (
        id UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
        nombre NVARCHAR(50) NOT NULL CONSTRAINT UQ_estados_postulacion_nombre UNIQUE,
        descripcion NVARCHAR(250) NULL,
        icono NVARCHAR(10) NULL,
        color_texto NVARCHAR(20) NOT NULL DEFAULT '#334155',
        color_fondo NVARCHAR(20) NOT NULL DEFAULT '#f8fafc',
        color_borde NVARCHAR(20) NOT NULL DEFAULT '#e2e8f0',
        orden INT NOT NULL DEFAULT 0,
        mostrar_en_pipeline BIT NOT NULL DEFAULT 0,
        es_decision_final BIT NOT NULL DEFAULT 0,
        activo BIT NOT NULL DEFAULT 1,
        fecha_creacion DATETIME2 DEFAULT GETDATE(),
        fecha_actualizacion DATETIME2 DEFAULT GETDATE()
      );
    END
  `);

  // 2. Semilla (solo inserta los que no existan; no sobreescribe cambios hechos en BD)
  for (let i = 0; i < ESTADOS_INICIALES.length; i++) {
    const e = ESTADOS_INICIALES[i];
    await pool.request()
      .input('nombre', sql.NVarChar(50), e.nombre)
      .input('descripcion', sql.NVarChar(250), e.descripcion)
      .input('icono', sql.NVarChar(10), e.icono)
      .input('color_texto', sql.NVarChar(20), e.color_texto)
      .input('color_fondo', sql.NVarChar(20), e.color_fondo)
      .input('color_borde', sql.NVarChar(20), e.color_borde)
      .input('orden', sql.Int, i + 1)
      .input('pipeline', sql.Bit, e.pipeline)
      .input('decision', sql.Bit, e.decision)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM estados_postulacion WHERE nombre = @nombre)
          INSERT INTO estados_postulacion
            (nombre, descripcion, icono, color_texto, color_fondo, color_borde, orden, mostrar_en_pipeline, es_decision_final)
          VALUES
            (@nombre, @descripcion, @icono, @color_texto, @color_fondo, @color_borde, @orden, @pipeline, @decision);
      `);
  }

  // 3. Normalizar el DEFAULT antiguo ('POSTULADO') al nombre del catálogo
  await pool.request().query(`
    UPDATE postulaciones SET estado_postulante = 'Postulado'
    WHERE estado_postulante COLLATE Latin1_General_CS_AS = 'POSTULADO';

    DECLARE @df NVARCHAR(200), @defVal NVARCHAR(MAX);
    SELECT @df = dc.name, @defVal = dc.definition
    FROM sys.default_constraints dc
    JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
    WHERE dc.parent_object_id = OBJECT_ID('postulaciones') AND c.name = 'estado_postulante';

    IF @df IS NOT NULL AND @defVal COLLATE Latin1_General_CS_AS <> '(''Postulado'')'
    BEGIN
      EXEC('ALTER TABLE postulaciones DROP CONSTRAINT ' + @df);
      ALTER TABLE postulaciones ADD CONSTRAINT DF_postulaciones_estado_postulante DEFAULT 'Postulado' FOR estado_postulante;
    END
  `);

  // 4. Stored procedure
  await pool.request().query(`
    CREATE OR ALTER PROCEDURE spEstadosPostulacion
        @ACCION VARCHAR(50),
        @DATA_JSON NVARCHAR(MAX) = NULL
    AS
    BEGIN
        SET NOCOUNT ON;

        DECLARE @id UNIQUEIDENTIFIER = NULL,
                @nombre NVARCHAR(50) = NULL,
                @descripcion NVARCHAR(250) = NULL,
                @icono NVARCHAR(10) = NULL,
                @color_texto NVARCHAR(20) = NULL,
                @color_fondo NVARCHAR(20) = NULL,
                @color_borde NVARCHAR(20) = NULL,
                @orden INT = NULL,
                @mostrar_en_pipeline BIT = NULL,
                @es_decision_final BIT = NULL,
                @activo BIT = NULL;

        IF @DATA_JSON IS NOT NULL AND ISJSON(@DATA_JSON) > 0
        BEGIN
            SET @id = TRY_CAST(JSON_VALUE(@DATA_JSON, '$.id') AS UNIQUEIDENTIFIER);
            SET @nombre = JSON_VALUE(@DATA_JSON, '$.nombre');
            SET @descripcion = JSON_VALUE(@DATA_JSON, '$.descripcion');
            SET @icono = JSON_VALUE(@DATA_JSON, '$.icono');
            SET @color_texto = JSON_VALUE(@DATA_JSON, '$.color_texto');
            SET @color_fondo = JSON_VALUE(@DATA_JSON, '$.color_fondo');
            SET @color_borde = JSON_VALUE(@DATA_JSON, '$.color_borde');
            SET @orden = TRY_CAST(JSON_VALUE(@DATA_JSON, '$.orden') AS INT);
            SET @mostrar_en_pipeline = TRY_CAST(JSON_VALUE(@DATA_JSON, '$.mostrar_en_pipeline') AS BIT);
            SET @es_decision_final = TRY_CAST(JSON_VALUE(@DATA_JSON, '$.es_decision_final') AS BIT);
            SET @activo = TRY_CAST(JSON_VALUE(@DATA_JSON, '$.activo') AS BIT);
        END

        IF @ACCION = 'SELECT_ACTIVOS'
        BEGIN
            SELECT (
                SELECT id, nombre, descripcion, icono, color_texto, color_fondo, color_borde,
                       orden, mostrar_en_pipeline, es_decision_final, activo
                FROM estados_postulacion
                WHERE activo = 1
                ORDER BY orden ASC, nombre ASC
                FOR JSON PATH, INCLUDE_NULL_VALUES
            ) AS DATOS;
        END
        ELSE IF @ACCION = 'SELECT_ALL'
        BEGIN
            SELECT (
                SELECT id, nombre, descripcion, icono, color_texto, color_fondo, color_borde,
                       orden, mostrar_en_pipeline, es_decision_final, activo
                FROM estados_postulacion
                ORDER BY orden ASC, nombre ASC
                FOR JSON PATH, INCLUDE_NULL_VALUES
            ) AS DATOS;
        END
        ELSE IF @ACCION = 'EXISTE_ACTIVO'
        BEGIN
            SELECT CASE WHEN EXISTS (
                SELECT 1 FROM estados_postulacion WHERE nombre = @nombre AND activo = 1
            ) THEN 1 ELSE 0 END AS EXISTE;
        END
        ELSE IF @ACCION = 'INSERT'
        BEGIN
            DECLARE @nuevo TABLE (id UNIQUEIDENTIFIER);
            INSERT INTO estados_postulacion
                (nombre, descripcion, icono, color_texto, color_fondo, color_borde,
                 orden, mostrar_en_pipeline, es_decision_final, activo)
            OUTPUT INSERTED.id INTO @nuevo
            VALUES
                (@nombre, @descripcion, @icono,
                 ISNULL(@color_texto, '#334155'), ISNULL(@color_fondo, '#f8fafc'), ISNULL(@color_borde, '#e2e8f0'),
                 ISNULL(@orden, (SELECT ISNULL(MAX(orden), 0) + 1 FROM estados_postulacion)),
                 ISNULL(@mostrar_en_pipeline, 0), ISNULL(@es_decision_final, 0), ISNULL(@activo, 1));

            SELECT (
                SELECT e.* FROM estados_postulacion e JOIN @nuevo n ON n.id = e.id
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
            ) AS DATOS;
        END
        ELSE IF @ACCION = 'UPDATE'
        BEGIN
            DECLARE @nombre_anterior NVARCHAR(50) = (SELECT nombre FROM estados_postulacion WHERE id = @id);

            UPDATE estados_postulacion SET
                nombre = ISNULL(@nombre, nombre),
                descripcion = ISNULL(@descripcion, descripcion),
                icono = ISNULL(@icono, icono),
                color_texto = ISNULL(@color_texto, color_texto),
                color_fondo = ISNULL(@color_fondo, color_fondo),
                color_borde = ISNULL(@color_borde, color_borde),
                orden = ISNULL(@orden, orden),
                mostrar_en_pipeline = ISNULL(@mostrar_en_pipeline, mostrar_en_pipeline),
                es_decision_final = ISNULL(@es_decision_final, es_decision_final),
                activo = ISNULL(@activo, activo),
                fecha_actualizacion = GETDATE()
            WHERE id = @id;

            -- Si se renombra el estado, se propaga a las postulaciones existentes
            IF @nombre IS NOT NULL AND @nombre_anterior IS NOT NULL AND @nombre <> @nombre_anterior
                UPDATE postulaciones SET estado_postulante = @nombre WHERE estado_postulante = @nombre_anterior;

            SELECT (
                SELECT * FROM estados_postulacion WHERE id = @id
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
            ) AS DATOS;
        END
    END;
  `);
}

module.exports = { migrateEstadosPostulacion, ESTADOS_INICIALES };

// Permite ejecutarla de forma aislada: node migrations/estadosPostulacion.js
if (require.main === module) {
  const { poolPromise } = require('../config/db');
  (async () => {
    try {
      const pool = await poolPromise;
      console.log(`Base de datos destino: ${process.env.DB_NAME}`);
      await migrateEstadosPostulacion(pool);
      const r = await pool.request().query('SELECT nombre, orden, mostrar_en_pipeline, es_decision_final, activo FROM estados_postulacion ORDER BY orden');
      console.table(r.recordset);
      console.log('Migración de estados_postulacion completada.');
      process.exit(0);
    } catch (err) {
      console.error(err);
      process.exit(1);
    }
  })();
}
