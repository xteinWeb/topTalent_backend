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
          requiere_registro BIT DEFAULT 1 NOT NULL,
          configuracion_json NVARCHAR(MAX) NULL,
          fecha_creacion DATETIME2 DEFAULT GETDATE(),
          fecha_actualizacion DATETIME2 DEFAULT GETDATE()
        );
      `;
            await pool.request().query(createVacantesQuery);
            console.log('Table "vacantes" created successfully.');
        } else {
            console.log('Table "vacantes" already exists. Verifying columns...');
            // Check and add requiere_registro and configuracion_json if they don't exist
            const addColsQuery = `
                IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'vacantes' AND COLUMN_NAME = 'requiere_registro')
                BEGIN
                    ALTER TABLE vacantes ADD requiere_registro BIT DEFAULT 1 NOT NULL;
                END
                IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'vacantes' AND COLUMN_NAME = 'configuracion_json')
                BEGIN
                    ALTER TABLE vacantes ADD configuracion_json NVARCHAR(MAX) NULL;
                END
            `;
            await pool.request().query(addColsQuery);
        }

        // 2.5 Create candidatos table if not exists
        const checkCandidatosQuery = `
      SELECT 1 FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_NAME = 'candidatos'
    `;
        const checkCandidatosResult = await pool.request().query(checkCandidatosQuery);
        if (checkCandidatosResult.recordset.length === 0) {
            console.log('Table "candidatos" does not exist. Creating...');
            const createCandidatosQuery = `
        CREATE TABLE candidatos (
          id UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
          email NVARCHAR(250) UNIQUE NOT NULL,
          password_hash NVARCHAR(MAX) NOT NULL,
          perfil_completo_json NVARCHAR(MAX) NULL,
          hv_archivo_nombre NVARCHAR(250) NULL,
          hv_archivo_ruta NVARCHAR(MAX) NULL,
          codigo_verificacion NVARCHAR(10) NULL,
          verificado BIT DEFAULT 0 NOT NULL,
          fecha_creacion DATETIME2 DEFAULT GETDATE(),
          fecha_actualizacion DATETIME2 DEFAULT GETDATE()
        );
      `;
            await pool.request().query(createCandidatosQuery);
            console.log('Table "candidatos" created successfully.');
        } else {
            console.log('Table "candidatos" already exists. Verifying columns...');
            const alterCandidatosColsQuery = `
                IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'candidatos' AND COLUMN_NAME = 'codigo_verificacion')
                BEGIN
                    ALTER TABLE candidatos ADD codigo_verificacion NVARCHAR(10) NULL;
                END
                IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'candidatos' AND COLUMN_NAME = 'verificado')
                BEGIN
                    ALTER TABLE candidatos ADD verificado BIT DEFAULT 0 NOT NULL;
                END
            `;
            await pool.request().query(alterCandidatosColsQuery);
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
          candidato_id UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES candidatos(id) ON DELETE CASCADE,
          fecha_postulacion DATETIME2 DEFAULT GETDATE(),
          respuesta_ia NVARCHAR(MAX),
          estado_ia NVARCHAR(MAX)
        );
      `;
            await pool.request().query(createPostulacionesQuery);
            console.log('Table "postulaciones" created successfully.');
        } else {
            console.log('Table "postulaciones" already exists. Verifying columns and constraints...');
            const alterPostulacionesQuery = `
                -- Drop redundant columns if they exist
                IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'postulaciones' AND COLUMN_NAME = 'nombre_completo')
                BEGIN
                    ALTER TABLE postulaciones DROP COLUMN nombre_completo;
                END
                IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'postulaciones' AND COLUMN_NAME = 'correo')
                BEGIN
                    ALTER TABLE postulaciones DROP COLUMN correo;
                END
                IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'postulaciones' AND COLUMN_NAME = 'telefono')
                BEGIN
                    ALTER TABLE postulaciones DROP COLUMN telefono;
                END
                IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'postulaciones' AND COLUMN_NAME = 'perfil_profesional')
                BEGIN
                    ALTER TABLE postulaciones DROP COLUMN perfil_profesional;
                END
                IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'postulaciones' AND COLUMN_NAME = 'experiencias_json')
                BEGIN
                    ALTER TABLE postulaciones DROP COLUMN experiencias_json;
                END
                IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'postulaciones' AND COLUMN_NAME = 'estudios_json')
                BEGIN
                    ALTER TABLE postulaciones DROP COLUMN estudios_json;
                END
                IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'postulaciones' AND COLUMN_NAME = 'idiomas_json')
                BEGIN
                    ALTER TABLE postulaciones DROP COLUMN idiomas_json;
                END
                IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'postulaciones' AND COLUMN_NAME = 'habilidades_json')
                BEGIN
                    ALTER TABLE postulaciones DROP COLUMN habilidades_json;
                END
                IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'postulaciones' AND COLUMN_NAME = 'hv_archivo_nombre')
                BEGIN
                    ALTER TABLE postulaciones DROP COLUMN hv_archivo_nombre;
                END
                IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'postulaciones' AND COLUMN_NAME = 'hv_archivo_ruta')
                BEGIN
                    ALTER TABLE postulaciones DROP COLUMN hv_archivo_ruta;
                END

                -- Ensure candidato_id exists, drop old constraint, add new NOT NULL with CASCADE
                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'postulaciones' AND COLUMN_NAME = 'candidato_id')
                BEGIN
                    ALTER TABLE postulaciones ADD candidato_id UNIQUEIDENTIFIER NULL;
                END

                -- Delete orphan records if any
                DELETE FROM postulaciones WHERE candidato_id IS NULL;

                -- Find and drop existing foreign key on candidato_id if it exists
                DECLARE @ConstraintName NVARCHAR(200) = NULL;
                SELECT @ConstraintName = f.name
                FROM sys.foreign_keys AS f
                INNER JOIN sys.foreign_key_columns AS fc ON f.object_id = fc.constraint_object_id
                INNER JOIN sys.columns AS c ON fc.parent_object_id = c.object_id AND fc.parent_column_id = c.column_id
                WHERE f.parent_object_id = OBJECT_ID('postulaciones') AND c.name = 'candidato_id';

                IF @ConstraintName IS NOT NULL
                BEGIN
                    DECLARE @DropSql NVARCHAR(MAX) = 'ALTER TABLE postulaciones DROP CONSTRAINT ' + @ConstraintName;
                    EXEC sp_executesql @DropSql;
                END

                -- Alter column to NOT NULL
                ALTER TABLE postulaciones ALTER COLUMN candidato_id UNIQUEIDENTIFIER NOT NULL;

                -- Add new Foreign Key with CASCADE
                ALTER TABLE postulaciones ADD CONSTRAINT FK_postulaciones_candidatos FOREIGN KEY (candidato_id) REFERENCES candidatos(id) ON DELETE CASCADE;
            `;
            await pool.request().query(alterPostulacionesQuery);
        }

        // 3.5 Create catalogos table if not exists
        const checkCatalogosQuery = `
      SELECT 1 FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_NAME = 'catalogos'
    `;
        const checkCatalogosResult = await pool.request().query(checkCatalogosQuery);
        if (checkCatalogosResult.recordset.length === 0) {
            console.log('Table "catalogos" does not exist. Creating...');
            const createCatalogosQuery = `
        CREATE TABLE catalogos (
          id UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
          tipo NVARCHAR(50) NOT NULL,
          valor NVARCHAR(200) NOT NULL,
          orden INT DEFAULT 0 NOT NULL,
          activo BIT DEFAULT 1 NOT NULL
        );
      `;
            await pool.request().query(createCatalogosQuery);
            console.log('Table "catalogos" created successfully.');
        } else {
            console.log('Table "catalogos" already exists.');
        }

        // Seed catalogos with initial values (only if empty for each tipo)
        console.log('Seeding catalogos...');
        const seedCatalogos = [
            { tipo: 'NIVEL_EDUCATIVO', valores: [
                'Bachillerato / Educación Media',
                'Técnico Profesional',
                'Tecnólogo',
                'Universitario / Profesional',
                'Especialización',
                'Maestría',
                'Doctorado'
            ]},
            { tipo: 'TIPO_CAPACITACION', valores: [
                'Curso',
                'Diplomado',
                'Seminario',
                'Congreso',
                'Certificación',
                'Otro'
            ]},
            { tipo: 'INSTITUCION_EDUCATIVA', valores: [
                'SENA (Servicio Nacional de Aprendizaje)',
                'Universidad Nacional de Colombia',
                'Universidad de Antioquia',
                'Universidad del Valle',
                'Universidad de los Andes',
                'Pontificia Universidad Javeriana',
                'Universidad EAFIT',
                'Universidad Industrial de Santander (UIS)',
                'Universidad del Norte',
                'Universidad de Caldas',
                'Universidad Tecnológica de Pereira',
                'Universidad de Medellín',
                'Universidad de la Sabana',
                'Universidad Externado de Colombia',
                'Universidad del Rosario',
                'Politécnico Grancolombiano',
                'Corporación Universitaria Minuto de Dios (UNIMINUTO)',
                'Universidad Cooperativa de Colombia',
                'Universidad Pedagógica y Tecnológica de Colombia (UPTC)',
                'Universidad Distrital Francisco José de Caldas',
                'Universidad Pontificia Bolivariana (UPB)',
                'Universidad Santo Tomás',
                'Universidad Libre',
                'Universidad de Pamplona',
                'Universidad de Córdoba'
            ]}
        ];

        for (const grupo of seedCatalogos) {
            const existsResult = await pool.request()
                .input('tipo', sql.NVarChar(50), grupo.tipo)
                .query('SELECT COUNT(*) AS total FROM catalogos WHERE tipo = @tipo');

            if (existsResult.recordset[0].total === 0) {
                for (let i = 0; i < grupo.valores.length; i++) {
                    await pool.request()
                        .input('tipo', sql.NVarChar(50), grupo.tipo)
                        .input('valor', sql.NVarChar(200), grupo.valores[i])
                        .input('orden', sql.Int, i)
                        .query('INSERT INTO catalogos (tipo, valor, orden) VALUES (@tipo, @valor, @orden)');
                }
                console.log(`Catalogo "${grupo.tipo}" sembrado con ${grupo.valores.length} valores.`);
            } else {
                console.log(`Catalogo "${grupo.tipo}" ya tiene datos. Se omite siembra.`);
            }
        }

        // Create/Update spCatalogos
        console.log('Creating/Updating Stored Procedure spCatalogos...');
        await pool.request().query(`
      CREATE OR ALTER PROCEDURE spCatalogos
          @ACCION VARCHAR(50),
          @DATA_JSON NVARCHAR(MAX) = NULL
      AS
      BEGIN
          SET NOCOUNT ON;

          DECLARE @tipo NVARCHAR(50) = NULL;

          IF @DATA_JSON IS NOT NULL AND ISJSON(@DATA_JSON) > 0
          BEGIN
              SET @tipo = JSON_VALUE(@DATA_JSON, '$.tipo');
          END

          IF @ACCION = 'SELECT_BY_TIPO'
          BEGIN
              SELECT (
                  SELECT valor
                  FROM catalogos
                  WHERE tipo = @tipo AND activo = 1
                  ORDER BY orden ASC, valor ASC
                  FOR JSON PATH
              ) AS DATOS;
          END
      END;
    `);
        console.log('Procedure "spCatalogos" created/updated.');

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
          DECLARE @requiere_registro BIT = NULL;
          DECLARE @configuracion_json NVARCHAR(MAX) = NULL;

          IF @DATA_JSON IS NOT NULL AND ISJSON(@DATA_JSON) > 0
          BEGIN
              SET @id = TRY_CAST(JSON_VALUE(@DATA_JSON, '$.id') AS UNIQUEIDENTIFIER);
              SET @perfil_id = TRY_CAST(JSON_VALUE(@DATA_JSON, '$.perfil_id') AS UNIQUEIDENTIFIER);
              SET @titulo = JSON_VALUE(@DATA_JSON, '$.titulo');
              SET @descripcion = JSON_VALUE(@DATA_JSON, '$.descripcion');
              SET @estado = JSON_VALUE(@DATA_JSON, '$.estado');
              SET @requiere_registro = TRY_CAST(JSON_VALUE(@DATA_JSON, '$.requiere_registro') AS BIT);
              SET @configuracion_json = JSON_QUERY(@DATA_JSON, '$.configuracion_json');
              IF @configuracion_json IS NULL SET @configuracion_json = JSON_VALUE(@DATA_JSON, '$.configuracion_json');
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
                      v.requiere_registro,
                      CASE WHEN ISJSON(v.configuracion_json) = 1 THEN JSON_QUERY(v.configuracion_json) ELSE NULL END AS configuracion_json,
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
                      v.requiere_registro,
                      CASE WHEN ISJSON(v.configuracion_json) = 1 THEN JSON_QUERY(v.configuracion_json) ELSE NULL END AS configuracion_json,
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
                      v.requiere_registro,
                      CASE WHEN ISJSON(v.configuracion_json) = 1 THEN JSON_QUERY(v.configuracion_json) ELSE NULL END AS configuracion_json,
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

              INSERT INTO vacantes (id, perfil_id, titulo, descripcion, estado, requiere_registro, configuracion_json) 
              VALUES (@InsertedID, @perfil_id, @titulo, @descripcion, ISNULL(@estado, 'ACTIVA'), ISNULL(@requiere_registro, 1), @configuracion_json);

              SELECT (
                  SELECT id, perfil_id, titulo, descripcion, estado, requiere_registro 
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
                  requiere_registro = ISNULL(@requiere_registro, requiere_registro),
                  configuracion_json = ISNULL(@configuracion_json, configuracion_json),
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
          DECLARE @candidato_id UNIQUEIDENTIFIER = NULL;

          IF @DATA_JSON IS NOT NULL AND ISJSON(@DATA_JSON) > 0
          BEGIN
              SET @id = TRY_CAST(JSON_VALUE(@DATA_JSON, '$.id') AS UNIQUEIDENTIFIER);
              SET @vacante_id = TRY_CAST(JSON_VALUE(@DATA_JSON, '$.vacante_id') AS UNIQUEIDENTIFIER);
              SET @candidato_id = TRY_CAST(JSON_VALUE(@DATA_JSON, '$.candidato_id') AS UNIQUEIDENTIFIER);
          END

          IF @ACCION = 'SELECT_ALL'
          BEGIN
              SELECT (
                  SELECT 
                      p.id, 
                      p.vacante_id,
                      p.candidato_id,
                      v.titulo AS vacante_titulo,
                      COALESCE(JSON_VALUE(c.perfil_completo_json, '$.nombre_completo'), '') AS nombre_completo, 
                      c.email AS correo, 
                      COALESCE(JSON_VALUE(c.perfil_completo_json, '$.telefono'), '') AS telefono, 
                      JSON_QUERY('{"titulo":"Postulación Detallada","resumen":"Perfil en base de datos"}') AS perfil_profesional, 
                      JSON_QUERY(COALESCE(JSON_QUERY(c.perfil_completo_json, '$.experiencias'), '[]')) AS experiencias_json, 
                      JSON_QUERY(COALESCE(JSON_QUERY(c.perfil_completo_json, '$.estudios'), '[]')) AS estudios_json, 
                      JSON_QUERY(COALESCE(JSON_QUERY(c.perfil_completo_json, '$.idiomas'), '[]')) AS idiomas_json, 
                      JSON_QUERY(COALESCE(JSON_QUERY(c.perfil_completo_json, '$.habilidades'), '{}')) AS habilidades_json, 
                      c.hv_archivo_nombre AS hv_archivo_nombre, 
                      c.hv_archivo_ruta AS hv_archivo_ruta, 
                      p.fecha_postulacion,
                      CASE WHEN ISJSON(p.respuesta_ia) = 1 THEN JSON_QUERY(p.respuesta_ia) ELSE NULL END AS respuesta_ia,
                      p.estado_ia
                  FROM postulaciones p
                  INNER JOIN vacantes v ON p.vacante_id = v.id
                  INNER JOIN candidatos c ON p.candidato_id = c.id
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
                      p.candidato_id,
                      v.titulo AS vacante_titulo,
                      COALESCE(JSON_VALUE(c.perfil_completo_json, '$.nombre_completo'), '') AS nombre_completo, 
                      c.email AS correo, 
                      COALESCE(JSON_VALUE(c.perfil_completo_json, '$.telefono'), '') AS telefono, 
                      JSON_QUERY('{"titulo":"Postulación Detallada","resumen":"Perfil en base de datos"}') AS perfil_profesional, 
                      JSON_QUERY(COALESCE(JSON_QUERY(c.perfil_completo_json, '$.experiencias'), '[]')) AS experiencias_json, 
                      JSON_QUERY(COALESCE(JSON_QUERY(c.perfil_completo_json, '$.estudios'), '[]')) AS estudios_json, 
                      JSON_QUERY(COALESCE(JSON_QUERY(c.perfil_completo_json, '$.idiomas'), '[]')) AS idiomas_json, 
                      JSON_QUERY(COALESCE(JSON_QUERY(c.perfil_completo_json, '$.habilidades'), '{}')) AS habilidades_json, 
                      c.hv_archivo_nombre AS hv_archivo_nombre, 
                      c.hv_archivo_ruta AS hv_archivo_ruta, 
                      p.fecha_postulacion,
                      CASE WHEN ISJSON(p.respuesta_ia) = 1 THEN JSON_QUERY(p.respuesta_ia) ELSE NULL END AS respuesta_ia,
                      p.estado_ia
                  FROM postulaciones p
                  INNER JOIN vacantes v ON p.vacante_id = v.id
                  INNER JOIN candidatos c ON p.candidato_id = c.id
                  WHERE p.vacante_id = @vacante_id
                  ORDER BY p.fecha_postulacion DESC
                  FOR JSON PATH
              ) AS DATOS;
          END
          ELSE IF @ACCION = 'INSERT'
          BEGIN
              IF EXISTS (SELECT 1 FROM postulaciones WHERE vacante_id = @vacante_id AND candidato_id = @candidato_id)
              BEGIN
                  THROW 50000, 'Ya te has postulado a esta vacante.', 1;
              END

              DECLARE @InsertedID UNIQUEIDENTIFIER = NEWID();

              INSERT INTO postulaciones (
                  id, vacante_id, candidato_id
              ) 
              VALUES (
                  @InsertedID, @vacante_id, @candidato_id
              );

              SELECT (
                  SELECT p.id, p.vacante_id, p.candidato_id, c.email AS correo
                  FROM postulaciones p
                  INNER JOIN candidatos c ON p.candidato_id = c.id
                  WHERE p.id = @InsertedID
                  FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
              ) AS DATOS;
          END
      END;
    `);
        console.log('Procedure "spPostulaciones" created/updated.');

        // 7. Create/Update spCandidatos
        console.log('Creating/Updating Stored Procedure spCandidatos...');
        await pool.request().query(`
      CREATE OR ALTER PROCEDURE spCandidatos
          @ACCION VARCHAR(50),
          @DATA_JSON NVARCHAR(MAX) = NULL
      AS
      BEGIN
          SET NOCOUNT ON;

          DECLARE @id UNIQUEIDENTIFIER = NULL;
          DECLARE @email NVARCHAR(250) = NULL;
          DECLARE @password_hash NVARCHAR(MAX) = NULL;
          DECLARE @perfil_completo_json NVARCHAR(MAX) = NULL;
          DECLARE @hv_archivo_nombre NVARCHAR(250) = NULL;
          DECLARE @hv_archivo_ruta NVARCHAR(MAX) = NULL;
          DECLARE @codigo_verificacion NVARCHAR(10) = NULL;
          DECLARE @verificado BIT = NULL;

          IF @DATA_JSON IS NOT NULL AND ISJSON(@DATA_JSON) > 0
          BEGIN
              SET @id = TRY_CAST(JSON_VALUE(@DATA_JSON, '$.id') AS UNIQUEIDENTIFIER);
              SET @email = JSON_VALUE(@DATA_JSON, '$.email');
              SET @password_hash = JSON_VALUE(@DATA_JSON, '$.password_hash');
              SET @perfil_completo_json = JSON_QUERY(@DATA_JSON, '$.perfil_completo_json');
              IF @perfil_completo_json IS NULL SET @perfil_completo_json = JSON_VALUE(@DATA_JSON, '$.perfil_completo_json');
              SET @hv_archivo_nombre = JSON_VALUE(@DATA_JSON, '$.hv_archivo_nombre');
              SET @hv_archivo_ruta = JSON_VALUE(@DATA_JSON, '$.hv_archivo_ruta');
              SET @codigo_verificacion = JSON_VALUE(@DATA_JSON, '$.codigo_verificacion');
              SET @verificado = TRY_CAST(JSON_VALUE(@DATA_JSON, '$.verificado') AS BIT);
          END

          IF @ACCION = 'SELECT_BY_EMAIL'
          BEGIN
              SELECT (
                  SELECT id, email, password_hash, verificado, codigo_verificacion,
                         CASE WHEN ISJSON(perfil_completo_json) = 1 THEN JSON_QUERY(perfil_completo_json) ELSE NULL END AS perfil_completo_json,
                         hv_archivo_nombre, hv_archivo_ruta
                  FROM candidatos
                  WHERE email = @email
                  FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
              ) AS DATOS;
          END
          ELSE IF @ACCION = 'SELECT_BY_ID'
          BEGIN
              SELECT (
                  SELECT id, email, verificado, codigo_verificacion,
                         CASE WHEN ISJSON(perfil_completo_json) = 1 THEN JSON_QUERY(perfil_completo_json) ELSE NULL END AS perfil_completo_json,
                         hv_archivo_nombre, hv_archivo_ruta
                  FROM candidatos
                  WHERE id = @id
                  FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
              ) AS DATOS;
          END
          ELSE IF @ACCION = 'INSERT'
          BEGIN
              IF EXISTS (SELECT 1 FROM candidatos WHERE email = @email)
              BEGIN
                  THROW 50000, 'El correo electrónico ya se encuentra registrado.', 1;
              END

              DECLARE @InsertedID UNIQUEIDENTIFIER = NEWID();

              INSERT INTO candidatos (id, email, password_hash, codigo_verificacion, verificado)
              VALUES (@InsertedID, @email, @password_hash, @codigo_verificacion, ISNULL(@verificado, 0));

              SELECT (
                  SELECT id, email, codigo_verificacion, verificado
                  FROM candidatos
                  WHERE id = @InsertedID
                  FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
              ) AS DATOS;
          END
          ELSE IF @ACCION = 'UPDATE_PERFIL'
          BEGIN
              UPDATE candidatos
              SET perfil_completo_json = @perfil_completo_json,
                  hv_archivo_nombre = ISNULL(@hv_archivo_nombre, hv_archivo_nombre),
                  hv_archivo_ruta = ISNULL(@hv_archivo_ruta, hv_archivo_ruta),
                  fecha_actualizacion = GETDATE()
              WHERE id = @id;

              SELECT '{"message": "Perfil actualizado exitosamente"}' AS DATOS;
          END
          ELSE IF @ACCION = 'VERIFICAR_CORREO'
          BEGIN
              IF EXISTS (SELECT 1 FROM candidatos WHERE email = @email AND codigo_verificacion = @codigo_verificacion)
              BEGIN
                  UPDATE candidatos
                  SET verificado = 1,
                      codigo_verificacion = NULL,
                      fecha_actualizacion = GETDATE()
                  WHERE email = @email;

                  SELECT (
                      SELECT id, email, verificado
                      FROM candidatos
                      WHERE email = @email
                      FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
                  ) AS DATOS;
              END
              ELSE
              BEGIN
                  THROW 50000, 'Código de verificación inválido.', 1;
              END
          END
      END;
    `);
        console.log('Procedure "spCandidatos" created/updated.');

        console.log('Migrations executed successfully.');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

migrate();
