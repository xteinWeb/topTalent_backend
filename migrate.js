const { sql, poolPromise } = require('./config/db');

async function migrate() {
    try {
        console.log('Connecting to database...');
        const pool = await poolPromise;
        console.log('Checking database tables...');

        // 1. Create perfiles_cargo table if not exists
        const checkPerfilesQuery = `
      SELECT 1 FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_NAME = 'perfiles_cargo'
    `;
        const checkPerfilesResult = await pool.request().query(checkPerfilesQuery);
        if (checkPerfilesResult.recordset.length === 0) {
            console.log('Table "perfiles_cargo" does not exist. Creating...');
            const createPerfilesQuery = `
        CREATE TABLE perfiles_cargo (
          id UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
          area NVARCHAR(150) NOT NULL,
          cargo NVARCHAR(150) NOT NULL,
          perfil_json NVARCHAR(MAX) NOT NULL,
          fecha_creacion DATETIME2 DEFAULT GETDATE(),
          fecha_actualizacion DATETIME2 DEFAULT GETDATE()
        );
      `;
            await pool.request().query(createPerfilesQuery);
            console.log('Table "perfiles_cargo" created successfully.');
        } else {
            console.log('Table "perfiles_cargo" already exists.');
        }

        // 2. Create vacantes table if not exists
        const checkVacantesQuery = `
      SELECT 1 FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_NAME = 'vacantes'
    `;
        const checkVacantesResult = await pool.request().query(checkVacantesQuery);
        if (checkVacantesResult.recordset.length === 0) {
            console.log('Table "vacantes" does not exist. Creating...');
            const createVacantesQuery = `
        CREATE TABLE vacantes (
          id UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
          perfil_id UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES perfiles_cargo(id) ON DELETE CASCADE,
          titulo NVARCHAR(200) NOT NULL,
          descripcion NVARCHAR(MAX) NOT NULL,
          estado NVARCHAR(50) DEFAULT 'ACTIVA',
          fecha_creacion DATETIME2 DEFAULT GETDATE(),
          fecha_actualizacion DATETIME2 DEFAULT GETDATE()
        );
      `;
            await pool.request().query(createVacantesQuery);
            console.log('Table "vacantes" created successfully.');
        } else {
            console.log('Table "vacantes" already exists.');
        }

        // 3. Create postulaciones table if not exists
        const checkPostulacionesQuery = `
      SELECT 1 FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_NAME = 'postulaciones'
    `;
        const checkPostulacionesResult = await pool.request().query(checkPostulacionesQuery);
        if (checkPostulacionesResult.recordset.length === 0) {
            console.log('Table "postulaciones" does not exist. Creating...');
            const createPostulacionesQuery = `
        CREATE TABLE postulaciones (
          id UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
          vacante_id UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES vacantes(id) ON DELETE CASCADE,
          nombre_completo NVARCHAR(250) NOT NULL,
          correo NVARCHAR(250) NOT NULL,
          telefono NVARCHAR(50),
          perfil_profesional NVARCHAR(MAX) NOT NULL,
          experiencias_json NVARCHAR(MAX) NOT NULL,
          estudios_json NVARCHAR(MAX) NOT NULL,
          idiomas_json NVARCHAR(MAX) NOT NULL,
          habilidades_json NVARCHAR(MAX) NOT NULL,
          hv_archivo_nombre NVARCHAR(250),
          hv_archivo_ruta NVARCHAR(MAX),
          fecha_postulacion DATETIME2 DEFAULT GETDATE(),
          respuesta_ia NVARCHAR(MAX),
          estado_ia NVARCHAR(MAX)
        );
      `;
            await pool.request().query(createPostulacionesQuery);
            console.log('Table "postulaciones" created successfully.');
        } else {
            console.log('Table "postulaciones" already exists.');
        }

        // 4. Create/Update spPerfilesCargo
        console.log('Creating/Updating Stored Procedure spPerfilesCargo...');
        await pool.request().query(`
      CREATE OR ALTER PROCEDURE spPerfilesCargo
          @ACCION VARCHAR(50),
          @DATA_JSON NVARCHAR(MAX) = NULL
      AS
      BEGIN
          SET NOCOUNT ON;

          DECLARE @id UNIQUEIDENTIFIER = NULL;
          DECLARE @area NVARCHAR(150) = NULL;
          DECLARE @cargo NVARCHAR(150) = NULL;
          DECLARE @perfil_json NVARCHAR(MAX) = NULL;

          IF @DATA_JSON IS NOT NULL AND ISJSON(@DATA_JSON) > 0
          BEGIN
              SET @id = TRY_CAST(JSON_VALUE(@DATA_JSON, '$.id') AS UNIQUEIDENTIFIER);
              SET @area = JSON_VALUE(@DATA_JSON, '$.area');
              SET @cargo = JSON_VALUE(@DATA_JSON, '$.cargo');
              SET @perfil_json = JSON_QUERY(@DATA_JSON, '$.perfil_json');
              
              IF @perfil_json IS NULL
              BEGIN
                  SET @perfil_json = JSON_VALUE(@DATA_JSON, '$.perfil_json');
              END
          END

          IF @ACCION = 'SELECT_ALL'
          BEGIN
              SELECT (
                  SELECT 
                      id, 
                      area, 
                      cargo, 
                      JSON_QUERY(perfil_json) AS perfil_json, 
                      fecha_creacion AS fecha_creacion, 
                      fecha_actualizacion AS fecha_actualizacion 
                  FROM perfiles_cargo 
                  ORDER BY fecha_actualizacion DESC
                  FOR JSON PATH
              ) AS DATOS;
          END
          ELSE IF @ACCION = 'SELECT_BY_ID'
          BEGIN
              SELECT (
                  SELECT 
                      id, 
                      area, 
                      cargo, 
                      JSON_QUERY(perfil_json) AS perfil_json, 
                      fecha_creacion AS fecha_creacion, 
                      fecha_actualizacion AS fecha_actualizacion 
                  FROM perfiles_cargo 
                  WHERE id = @id
                  FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
              ) AS DATOS;
          END
          ELSE IF @ACCION = 'INSERT'
          BEGIN
              DECLARE @InsertedID UNIQUEIDENTIFIER = NEWID();

              INSERT INTO perfiles_cargo (id, area, cargo, perfil_json) 
              VALUES (@InsertedID, @area, @cargo, @perfil_json);

              SELECT (
                  SELECT 
                      id, 
                      area, 
                      cargo 
                  FROM perfiles_cargo 
                  WHERE id = @InsertedID
                  FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
              ) AS DATOS;
          END
          ELSE IF @ACCION = 'UPDATE'
          BEGIN
              UPDATE perfiles_cargo 
              SET area = @area, 
                  cargo = @cargo, 
                  perfil_json = @perfil_json, 
                  fecha_actualizacion = GETDATE() 
              WHERE id = @id;

              SELECT '{"message": "Perfil actualizado exitosamente"}' AS DATOS;
          END
          ELSE IF @ACCION = 'DELETE'
          BEGIN
              DELETE FROM perfiles_cargo 
              WHERE id = @id;

              SELECT '{"message": "Perfil eliminado exitosamente"}' AS DATOS;
          END
      END;
    `);
        console.log('Procedure "spPerfilesCargo" created/updated.');

        // 5. Create/Update spVacantes
        console.log('Creating/Updating Stored Procedure spVacantes...');
        await pool.request().query(`
      CREATE OR ALTER PROCEDURE spVacantes
          @ACCION VARCHAR(50),
          @DATA_JSON NVARCHAR(MAX) = NULL
      AS
      BEGIN
          SET NOCOUNT ON;

          DECLARE @id UNIQUEIDENTIFIER = NULL;
          DECLARE @perfil_id UNIQUEIDENTIFIER = NULL;
          DECLARE @titulo NVARCHAR(200) = NULL;
          DECLARE @descripcion NVARCHAR(MAX) = NULL;
          DECLARE @estado NVARCHAR(50) = NULL;

          IF @DATA_JSON IS NOT NULL AND ISJSON(@DATA_JSON) > 0
          BEGIN
              SET @id = TRY_CAST(JSON_VALUE(@DATA_JSON, '$.id') AS UNIQUEIDENTIFIER);
              SET @perfil_id = TRY_CAST(JSON_VALUE(@DATA_JSON, '$.perfil_id') AS UNIQUEIDENTIFIER);
              SET @titulo = JSON_VALUE(@DATA_JSON, '$.titulo');
              SET @descripcion = JSON_VALUE(@DATA_JSON, '$.descripcion');
              SET @estado = JSON_VALUE(@DATA_JSON, '$.estado');
          END

          IF @ACCION = 'SELECT_ALL'
          BEGIN
              SELECT (
                  SELECT 
                      v.id, 
                      v.perfil_id,
                      p.cargo AS perfil_cargo,
                      JSON_QUERY(p.perfil_json) AS perfil_completo_json,
                      v.titulo, 
                      v.descripcion, 
                      v.estado, 
                      v.fecha_creacion, 
                      v.fecha_actualizacion 
                  FROM vacantes v
                  INNER JOIN perfiles_cargo p ON v.perfil_id = p.id
                  ORDER BY v.fecha_actualizacion DESC
                  FOR JSON PATH
              ) AS DATOS;
          END
          ELSE IF @ACCION = 'SELECT_ACTIVE'
          BEGIN
              SELECT (
                  SELECT 
                      v.id, 
                      v.perfil_id,
                      p.cargo AS perfil_cargo,
                      JSON_QUERY(p.perfil_json) AS perfil_completo_json,
                      v.titulo, 
                      v.descripcion, 
                      v.estado, 
                      v.fecha_creacion, 
                      v.fecha_actualizacion 
                  FROM vacantes v
                  INNER JOIN perfiles_cargo p ON v.perfil_id = p.id
                  WHERE v.estado = 'ACTIVA'
                  ORDER BY v.fecha_actualizacion DESC
                  FOR JSON PATH
              ) AS DATOS;
          END
          ELSE IF @ACCION = 'SELECT_BY_ID'
          BEGIN
              SELECT (
                  SELECT 
                      v.id, 
                      v.perfil_id,
                      p.cargo AS perfil_cargo,
                      JSON_QUERY(p.perfil_json) AS perfil_completo_json,
                      v.titulo, 
                      v.descripcion, 
                      v.estado, 
                      v.fecha_creacion, 
                      v.fecha_actualizacion 
                  FROM vacantes v
                  INNER JOIN perfiles_cargo p ON v.perfil_id = p.id
                  WHERE v.id = @id
                  FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
              ) AS DATOS;
          END
          ELSE IF @ACCION = 'INSERT'
          BEGIN
              DECLARE @InsertedID UNIQUEIDENTIFIER = NEWID();

              INSERT INTO vacantes (id, perfil_id, titulo, descripcion, estado) 
              VALUES (@InsertedID, @perfil_id, @titulo, @descripcion, ISNULL(@estado, 'ACTIVA'));

              SELECT (
                  SELECT id, perfil_id, titulo, descripcion, estado 
                  FROM vacantes 
                  WHERE id = @InsertedID
                  FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
              ) AS DATOS;
          END
          ELSE IF @ACCION = 'UPDATE'
          BEGIN
              UPDATE vacantes 
              SET perfil_id = @perfil_id, 
                  titulo = @titulo, 
                  descripcion = @descripcion, 
                  estado = ISNULL(@estado, estado),
                  fecha_actualizacion = GETDATE() 
              WHERE id = @id;

              SELECT '{"message": "Vacante actualizada exitosamente"}' AS DATOS;
          END
          ELSE IF @ACCION = 'DELETE'
          BEGIN
              DELETE FROM vacantes WHERE id = @id;
              SELECT '{"message": "Vacante eliminada exitosamente"}' AS DATOS;
          END
      END;
    `);
        console.log('Procedure "spVacantes" created/updated.');

        // 6. Create/Update spPostulaciones
        console.log('Creating/Updating Stored Procedure spPostulaciones...');
        await pool.request().query(`
      CREATE OR ALTER PROCEDURE spPostulaciones
          @ACCION VARCHAR(50),
          @DATA_JSON NVARCHAR(MAX) = NULL
      AS
      BEGIN
          SET NOCOUNT ON;

          DECLARE @id UNIQUEIDENTIFIER = NULL;
          DECLARE @vacante_id UNIQUEIDENTIFIER = NULL;
          DECLARE @nombre_completo NVARCHAR(250) = NULL;
          DECLARE @correo NVARCHAR(250) = NULL;
          DECLARE @telefono NVARCHAR(50) = NULL;
          DECLARE @perfil_profesional NVARCHAR(MAX) = NULL;
          DECLARE @experiencias_json NVARCHAR(MAX) = NULL;
          DECLARE @estudios_json NVARCHAR(MAX) = NULL;
          DECLARE @idiomas_json NVARCHAR(MAX) = NULL;
          DECLARE @habilidades_json NVARCHAR(MAX) = NULL;
          DECLARE @hv_archivo_nombre NVARCHAR(250) = NULL;
          DECLARE @hv_archivo_ruta NVARCHAR(MAX) = NULL;

          IF @DATA_JSON IS NOT NULL AND ISJSON(@DATA_JSON) > 0
          BEGIN
              SET @id = TRY_CAST(JSON_VALUE(@DATA_JSON, '$.id') AS UNIQUEIDENTIFIER);
              SET @vacante_id = TRY_CAST(JSON_VALUE(@DATA_JSON, '$.vacante_id') AS UNIQUEIDENTIFIER);
              SET @nombre_completo = JSON_VALUE(@DATA_JSON, '$.nombre_completo');
              SET @correo = JSON_VALUE(@DATA_JSON, '$.correo');
              SET @telefono = JSON_VALUE(@DATA_JSON, '$.telefono');
              
              SET @perfil_profesional = JSON_QUERY(@DATA_JSON, '$.perfil_profesional');
              IF @perfil_profesional IS NULL SET @perfil_profesional = JSON_VALUE(@DATA_JSON, '$.perfil_profesional');
              
              SET @experiencias_json = JSON_QUERY(@DATA_JSON, '$.experiencias_json');
              IF @experiencias_json IS NULL SET @experiencias_json = JSON_VALUE(@DATA_JSON, '$.experiencias_json');

              SET @estudios_json = JSON_QUERY(@DATA_JSON, '$.estudios_json');
              IF @estudios_json IS NULL SET @estudios_json = JSON_VALUE(@DATA_JSON, '$.estudios_json');

              SET @idiomas_json = JSON_QUERY(@DATA_JSON, '$.idiomas_json');
              IF @idiomas_json IS NULL SET @idiomas_json = JSON_VALUE(@DATA_JSON, '$.idiomas_json');

              SET @habilidades_json = JSON_QUERY(@DATA_JSON, '$.habilidades_json');
              IF @habilidades_json IS NULL SET @habilidades_json = JSON_VALUE(@DATA_JSON, '$.habilidades_json');

              SET @hv_archivo_nombre = JSON_VALUE(@DATA_JSON, '$.hv_archivo_nombre');
              SET @hv_archivo_ruta = JSON_VALUE(@DATA_JSON, '$.hv_archivo_ruta');
          END

          IF @ACCION = 'SELECT_ALL'
          BEGIN
              SELECT (
                  SELECT 
                      p.id, 
                      p.vacante_id,
                      v.titulo AS vacante_titulo,
                      p.nombre_completo, 
                      p.correo, 
                      p.telefono, 
                      JSON_QUERY(p.perfil_profesional) AS perfil_profesional, 
                      JSON_QUERY(p.experiencias_json) AS experiencias_json, 
                      JSON_QUERY(p.estudios_json) AS estudios_json, 
                      JSON_QUERY(p.idiomas_json) AS idiomas_json, 
                      JSON_QUERY(p.habilidades_json) AS habilidades_json, 
                      p.hv_archivo_nombre, 
                      p.hv_archivo_ruta, 
                      p.fecha_postulacion,
                      JSON_QUERY(p.respuesta_ia) AS respuesta_ia,
                      p.estado_ia
                  FROM postulaciones p
                  INNER JOIN vacantes v ON p.vacante_id = v.id
                  ORDER BY p.fecha_postulacion DESC
                  FOR JSON PATH
              ) AS DATOS;
          END
          ELSE IF @ACCION = 'SELECT_BY_VACANTE'
          BEGIN
              SELECT (
                  SELECT 
                      p.id, 
                      p.vacante_id,
                      v.titulo AS vacante_titulo,
                      p.nombre_completo, 
                      p.correo, 
                      p.telefono, 
                      JSON_QUERY(p.perfil_profesional) AS perfil_profesional, 
                      JSON_QUERY(p.experiencias_json) AS experiencias_json, 
                      JSON_QUERY(p.estudios_json) AS estudios_json, 
                      JSON_QUERY(p.idiomas_json) AS idiomas_json, 
                      JSON_QUERY(p.habilidades_json) AS habilidades_json, 
                      p.hv_archivo_nombre, 
                      p.hv_archivo_ruta, 
                      p.fecha_postulacion,
                      JSON_QUERY(p.respuesta_ia) AS respuesta_ia,
                      p.estado_ia
                  FROM postulaciones p
                  INNER JOIN vacantes v ON p.vacante_id = v.id
                  WHERE p.vacante_id = @vacante_id
                  ORDER BY p.fecha_postulacion DESC
                  FOR JSON PATH
              ) AS DATOS;
          END
          ELSE IF @ACCION = 'INSERT'
          BEGIN
              IF EXISTS (SELECT 1 FROM postulaciones WHERE vacante_id = @vacante_id AND correo = @correo)
              BEGIN
                  THROW 50000, 'Ya te has postulado a esta vacante con este correo electrónico.', 1;
              END

              DECLARE @InsertedID UNIQUEIDENTIFIER = NEWID();

              INSERT INTO postulaciones (
                  id, vacante_id, nombre_completo, correo, telefono, 
                  perfil_profesional, experiencias_json, estudios_json, 
                  idiomas_json, habilidades_json, hv_archivo_nombre, hv_archivo_ruta
              ) 
              VALUES (
                  @InsertedID, @vacante_id, @nombre_completo, @correo, @telefono, 
                  @perfil_profesional, @experiencias_json, @estudios_json, 
                  @idiomas_json, @habilidades_json, @hv_archivo_nombre, @hv_archivo_ruta
              );

              SELECT (
                  SELECT id, vacante_id, nombre_completo, correo 
                  FROM postulaciones 
                  WHERE id = @InsertedID
                  FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
              ) AS DATOS;
          END
      END;
    `);
        console.log('Procedure "spPostulaciones" created/updated.');

        console.log('Migrations executed successfully.');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

migrate();
