// Reporte de indicadores de selección.
// - postulaciones_historial_estado: cada cambio de estado del postulante (permite medir tiempos del proceso).
// - vacantes.fecha_activacion: cuándo Talento Humano publicó la vacante.
// Ambos empiezan a llenarse desde que se aplica esta migración (no hay datos hacia atrás).
// Debe ejecutarse antes de crear/actualizar spPostulaciones y spVacantes, que los usan.
async function migrateReportes(pool) {
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'postulaciones_historial_estado')
    BEGIN
      CREATE TABLE postulaciones_historial_estado (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_postulaciones_historial_estado PRIMARY KEY,
        postulacion_id UNIQUEIDENTIFIER NOT NULL
          CONSTRAINT FK_historial_estado_postulacion FOREIGN KEY REFERENCES postulaciones(id) ON DELETE CASCADE,
        estado_anterior NVARCHAR(50) NULL,
        estado_nuevo NVARCHAR(50) NOT NULL,
        usuario_id UNIQUEIDENTIFIER NULL,
        fecha DATETIME2 NOT NULL CONSTRAINT DF_historial_estado_fecha DEFAULT GETDATE()
      );
      CREATE INDEX IX_historial_estado_postulacion ON postulaciones_historial_estado (postulacion_id, fecha);
    END

    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'vacantes' AND COLUMN_NAME = 'fecha_activacion')
    BEGIN
      ALTER TABLE vacantes ADD fecha_activacion DATETIME2 NULL;
    END
  `);

  await pool.request().query(`
    CREATE OR ALTER PROCEDURE spReportes
        @ACCION VARCHAR(50),
        @DATA_JSON NVARCHAR(MAX) = NULL
    AS
    BEGIN
        SET NOCOUNT ON;

        DECLARE @empresa_id VARCHAR(20) = NULL;
        DECLARE @desde DATETIME2 = NULL;
        DECLARE @hasta DATETIME2 = NULL;

        IF @DATA_JSON IS NOT NULL AND ISJSON(@DATA_JSON) > 0
        BEGIN
            SET @empresa_id = JSON_VALUE(@DATA_JSON, '$.empresa_id');
            SET @desde = TRY_CAST(JSON_VALUE(@DATA_JSON, '$.desde') AS DATETIME2);
            -- "hasta" es inclusivo: se toma hasta el final de ese día
            SET @hasta = DATEADD(DAY, 1, TRY_CAST(JSON_VALUE(@DATA_JSON, '$.hasta') AS DATE));
        END

        IF @ACCION = 'INDICADORES'
        BEGIN
            -- Datos crudos del período; las métricas se calculan en la aplicación
            SELECT
              (SELECT p.id, p.vacante_id, v.titulo AS vacante_titulo,
                      COALESCE(NULLIF(pc.area, ''), NULLIF(v.seccion_area, ''), 'Sin área') AS area,
                      COALESCE(pc.lider_id, v.solicitado_por_id) AS lider_id,
                      COALESCE(l.nombre, 'Sin líder asignado') AS lider_nombre,
                      ISNULL(p.estado_postulante, 'Postulado') AS estado,
                      p.motivo_no_aprobado, p.motivo_no_aprobado_detalle,
                      p.fecha_postulacion,
                      (SELECT MIN(h.fecha) FROM postulaciones_historial_estado h
                       WHERE h.postulacion_id = p.id AND h.estado_nuevo = 'Contratado') AS fecha_contratado
               FROM postulaciones p
               INNER JOIN vacantes v ON p.vacante_id = v.id
               INNER JOIN perfiles_cargo pc ON v.perfil_id = pc.id
               LEFT JOIN usuarios_admin l ON l.id = COALESCE(pc.lider_id, v.solicitado_por_id)
               WHERE (@empresa_id IS NULL OR v.empresa_id = @empresa_id)
                 AND (@desde IS NULL OR p.fecha_postulacion >= @desde)
                 AND (@hasta IS NULL OR p.fecha_postulacion < @hasta)
               FOR JSON PATH, INCLUDE_NULL_VALUES) AS postulaciones,
              (SELECT v.id, v.titulo, v.estado, v.estado_aprobacion,
                      COALESCE(NULLIF(pc.area, ''), NULLIF(v.seccion_area, ''), 'Sin área') AS area,
                      COALESCE(pc.lider_id, v.solicitado_por_id) AS lider_id,
                      COALESCE(l.nombre, 'Sin líder asignado') AS lider_nombre,
                      COALESCE(v.fecha_solicitud, v.fecha_creacion) AS fecha_solicitud,
                      v.fecha_autorizacion, v.fecha_activacion
               FROM vacantes v
               INNER JOIN perfiles_cargo pc ON v.perfil_id = pc.id
               LEFT JOIN usuarios_admin l ON l.id = COALESCE(pc.lider_id, v.solicitado_por_id)
               WHERE v.estado <> 'ELIMINADA'
                 AND (@empresa_id IS NULL OR v.empresa_id = @empresa_id)
                 AND (@desde IS NULL OR COALESCE(v.fecha_solicitud, v.fecha_creacion) >= @desde)
                 AND (@hasta IS NULL OR COALESCE(v.fecha_solicitud, v.fecha_creacion) < @hasta)
               FOR JSON PATH, INCLUDE_NULL_VALUES) AS vacantes;
        END
    END;
  `);
  console.log('Reportes: historial de estados, fecha de activación y spReportes verificados.');
}

module.exports = { migrateReportes };
