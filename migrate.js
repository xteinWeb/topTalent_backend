const { sql, poolPromise } = require('./config/db');
const bcrypt = require('bcryptjs');

async function migrate() {
    try {
        console.log('Connecting to database...');
        const pool = await poolPromise;
        console.log('Checking database tables...');

        // 0. Create empresas table if not exists
        const checkEmpresasQuery = `
      SELECT 1 FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_NAME = 'empresas'
    `;
        const checkEmpresasResult = await pool.request().query(checkEmpresasQuery);
        if (checkEmpresasResult.recordset.length === 0) {
            console.log('Table "empresas" does not exist. Creating...');
            const createEmpresasQuery = `
        CREATE TABLE empresas (
          id VARCHAR(20) PRIMARY KEY,
          nombre NVARCHAR(250) NOT NULL,
          activo BIT DEFAULT 1 NOT NULL,
          fecha_creacion DATETIME2 DEFAULT GETDATE(),
          fecha_actualizacion DATETIME2 DEFAULT GETDATE()
        );
      `;
            await pool.request().query(createEmpresasQuery);
            console.log('Table "empresas" created successfully.');
        } else {
            console.log('Table "empresas" already exists.');
        }

        // Seed initial empresa '00'
        const seedEmpresaQuery = `
            IF NOT EXISTS (SELECT 1 FROM empresas WHERE id = '00')
            BEGIN
                INSERT INTO empresas (id, nombre, activo) 
                VALUES ('00', 'ARTDECON DE COLOMBIA S.A.S', 1);
                PRINT 'Empresa 00 (ARTDECON DE COLOMBIA S.A.S) creada.';
            END
        `;
        await pool.request().query(seedEmpresaQuery);

        // 0.5 Create usuarios_admin table if not exists
        const checkUsuariosAdminQuery = `
      SELECT 1 FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_NAME = 'usuarios_admin'
    `;
        const checkUsuariosAdminResult = await pool.request().query(checkUsuariosAdminQuery);
        if (checkUsuariosAdminResult.recordset.length === 0) {
            console.log('Table "usuarios_admin" does not exist. Creating...');
            const createUsuariosAdminQuery = `
        CREATE TABLE usuarios_admin (
          id UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
          empresa_id VARCHAR(20) NOT NULL FOREIGN KEY REFERENCES empresas(id),
          nombre NVARCHAR(150) NOT NULL,
          username NVARCHAR(100) UNIQUE NOT NULL,
          email NVARCHAR(250) NULL,
          password_hash NVARCHAR(MAX) NOT NULL,
          rol NVARCHAR(50) DEFAULT 'ADMIN' NOT NULL,
          activo BIT DEFAULT 1 NOT NULL,
          fecha_creacion DATETIME2 DEFAULT GETDATE(),
          fecha_actualizacion DATETIME2 DEFAULT GETDATE()
        );
      `;
            await pool.request().query(createUsuariosAdminQuery);
            console.log('Table "usuarios_admin" created successfully.');
        } else {
            console.log('Table "usuarios_admin" already exists.');
        }

        // Seed initial admin user for company '00'
        const checkAdminUser = await pool.request().query("SELECT COUNT(*) AS total FROM usuarios_admin WHERE username = 'admin'");
        if (checkAdminUser.recordset[0].total === 0) {
            const defaultPasswordHash = await bcrypt.hash('admin123', 10);
            await pool.request()
                .input('empresa_id', sql.VarChar(20), '00')
                .input('nombre', sql.NVarChar(150), 'Administrador Artdecon')
                .input('username', sql.NVarChar(100), 'admin')
                .input('email', sql.NVarChar(250), 'admin@artdecon.com')
                .input('password_hash', sql.NVarChar(sql.MAX), defaultPasswordHash)
                .input('rol', sql.NVarChar(50), 'ADMIN')
                .query(`
                    INSERT INTO usuarios_admin (empresa_id, nombre, username, email, password_hash, rol, activo)
                    VALUES (@empresa_id, @nombre, @username, @email, @password_hash, @rol, 1)
                `);
            console.log('Usuario admin inicial (username: admin / pass: admin123) creado para empresa 00.');
        }

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
          empresa_id VARCHAR(20) DEFAULT '00' NOT NULL FOREIGN KEY REFERENCES empresas(id),
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
            console.log('Table "perfiles_cargo" already exists. Verifying columns...');
            const alterPerfilesColsQuery = `
                IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'perfiles_cargo' AND COLUMN_NAME = 'empresa_id')
                BEGIN
                    ALTER TABLE perfiles_cargo ADD empresa_id VARCHAR(20) DEFAULT '00' NOT NULL;
                END
                EXEC('UPDATE perfiles_cargo SET empresa_id = ''00'' WHERE empresa_id IS NULL');
                IF NOT EXISTS (
                    SELECT 1 FROM sys.foreign_keys 
                    WHERE parent_object_id = OBJECT_ID('perfiles_cargo') 
                    AND name = 'FK_perfiles_cargo_empresas'
                )
                BEGIN
                    ALTER TABLE perfiles_cargo ADD CONSTRAINT FK_perfiles_cargo_empresas FOREIGN KEY (empresa_id) REFERENCES empresas(id);
                END
            `;
            await pool.request().query(alterPerfilesColsQuery);
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
          empresa_id VARCHAR(20) DEFAULT '00' NOT NULL FOREIGN KEY REFERENCES empresas(id),
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
            // Check and add columns if they don't exist
            const addColsQuery = `
                IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'vacantes' AND COLUMN_NAME = 'empresa_id')
                BEGIN
                    ALTER TABLE vacantes ADD empresa_id VARCHAR(20) DEFAULT '00' NOT NULL;
                END
                EXEC('UPDATE vacantes SET empresa_id = ''00'' WHERE empresa_id IS NULL');
                IF NOT EXISTS (
                    SELECT 1 FROM sys.foreign_keys 
                    WHERE parent_object_id = OBJECT_ID('vacantes') 
                    AND name = 'FK_vacantes_empresas'
                )
                BEGIN
                    ALTER TABLE vacantes ADD CONSTRAINT FK_vacantes_empresas FOREIGN KEY (empresa_id) REFERENCES empresas(id);
                END
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
          acepto_tratamiento_datos BIT DEFAULT 0 NOT NULL,
          fecha_aceptacion_tratamiento_datos DATETIME2 NULL,
          version_tratamiento_datos NVARCHAR(50) NULL,
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
                IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'candidatos' AND COLUMN_NAME = 'acepto_tratamiento_datos')
                BEGIN
                    ALTER TABLE candidatos ADD acepto_tratamiento_datos BIT DEFAULT 0 NOT NULL;
                END
                IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'candidatos' AND COLUMN_NAME = 'fecha_aceptacion_tratamiento_datos')
                BEGIN
                    ALTER TABLE candidatos ADD fecha_aceptacion_tratamiento_datos DATETIME2 NULL;
                END
                IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'candidatos' AND COLUMN_NAME = 'version_tratamiento_datos')
                BEGIN
                    ALTER TABLE candidatos ADD version_tratamiento_datos NVARCHAR(50) NULL;
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
          estado_ia NVARCHAR(MAX),
          preguntas_respondidas_json NVARCHAR(MAX),
          puntuacion_ia INT NULL,
          json_analisis_ia NVARCHAR(MAX) NULL,
          posicion INT NULL,
          segunda_validacion BIT NULL
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

                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'postulaciones' AND COLUMN_NAME = 'preguntas_respondidas_json')
                BEGIN
                    ALTER TABLE postulaciones ADD preguntas_respondidas_json NVARCHAR(MAX) NULL;
                END

                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'postulaciones' AND COLUMN_NAME = 'puntuacion_ia')
                BEGIN
                    ALTER TABLE postulaciones ADD puntuacion_ia INT NULL;
                END
                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'postulaciones' AND COLUMN_NAME = 'json_analisis_ia')
                BEGIN
                    ALTER TABLE postulaciones ADD json_analisis_ia NVARCHAR(MAX) NULL;
                END
                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'postulaciones' AND COLUMN_NAME = 'posicion')
                BEGIN
                    ALTER TABLE postulaciones ADD posicion INT NULL;
                END
                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'postulaciones' AND COLUMN_NAME = 'segunda_validacion')
                BEGIN
                    ALTER TABLE postulaciones ADD segunda_validacion BIT NULL;
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

        // Create/Update spEmpresas
        console.log('Creating/Updating Stored Procedure spEmpresas...');
        await pool.request().query(`
      CREATE OR ALTER PROCEDURE spEmpresas
          @ACCION VARCHAR(50),
          @DATA_JSON NVARCHAR(MAX) = NULL
      AS
      BEGIN
          SET NOCOUNT ON;

          DECLARE @id VARCHAR(20) = NULL;
          DECLARE @nombre NVARCHAR(250) = NULL;
          DECLARE @activo BIT = NULL;

          IF @DATA_JSON IS NOT NULL AND ISJSON(@DATA_JSON) > 0
          BEGIN
              SET @id = JSON_VALUE(@DATA_JSON, '$.id');
              SET @nombre = JSON_VALUE(@DATA_JSON, '$.nombre');
              SET @activo = TRY_CAST(JSON_VALUE(@DATA_JSON, '$.activo') AS BIT);
          END

          IF @ACCION = 'SELECT_ALL'
          BEGIN
              SELECT (
                  SELECT id, nombre, activo, fecha_creacion, fecha_actualizacion
                  FROM empresas
                  WHERE activo = 1
                  ORDER BY id ASC
                  FOR JSON PATH
              ) AS DATOS;
          END
          ELSE IF @ACCION = 'SELECT_BY_ID'
          BEGIN
              SELECT (
                  SELECT id, nombre, activo, fecha_creacion, fecha_actualizacion
                  FROM empresas
                  WHERE id = @id
                  FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
              ) AS DATOS;
          END
          ELSE IF @ACCION = 'INSERT'
          BEGIN
              IF EXISTS (SELECT 1 FROM empresas WHERE id = @id)
              BEGIN
                  THROW 50000, 'Ya existe una empresa con ese identificador.', 1;
              END

              INSERT INTO empresas (id, nombre, activo)
              VALUES (@id, @nombre, ISNULL(@activo, 1));

              SELECT (
                  SELECT id, nombre, activo, fecha_creacion, fecha_actualizacion
                  FROM empresas
                  WHERE id = @id
                  FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
              ) AS DATOS;
          END
          ELSE IF @ACCION = 'UPDATE'
          BEGIN
              UPDATE empresas
              SET nombre = ISNULL(@nombre, nombre),
                  activo = ISNULL(@activo, activo),
                  fecha_actualizacion = GETDATE()
              WHERE id = @id;

              SELECT '{"message": "Empresa actualizada exitosamente"}' AS DATOS;
          END
      END;
    `);
        console.log('Procedure "spEmpresas" created/updated.');

        // Create/Update spUsuariosAdmin
        console.log('Creating/Updating Stored Procedure spUsuariosAdmin...');
        await pool.request().query(`
      CREATE OR ALTER PROCEDURE spUsuariosAdmin
          @ACCION VARCHAR(50),
          @DATA_JSON NVARCHAR(MAX) = NULL
      AS
      BEGIN
          SET NOCOUNT ON;

          DECLARE @id UNIQUEIDENTIFIER = NULL;
          DECLARE @empresa_id VARCHAR(20) = NULL;
          DECLARE @username NVARCHAR(100) = NULL;
          DECLARE @email NVARCHAR(250) = NULL;
          DECLARE @nombre NVARCHAR(150) = NULL;
          DECLARE @password_hash NVARCHAR(MAX) = NULL;
          DECLARE @rol NVARCHAR(50) = NULL;
          DECLARE @activo BIT = NULL;

          IF @DATA_JSON IS NOT NULL AND ISJSON(@DATA_JSON) > 0
          BEGIN
              SET @id = TRY_CAST(JSON_VALUE(@DATA_JSON, '$.id') AS UNIQUEIDENTIFIER);
              SET @empresa_id = JSON_VALUE(@DATA_JSON, '$.empresa_id');
              SET @username = JSON_VALUE(@DATA_JSON, '$.username');
              SET @email = JSON_VALUE(@DATA_JSON, '$.email');
              SET @nombre = JSON_VALUE(@DATA_JSON, '$.nombre');
              SET @password_hash = JSON_VALUE(@DATA_JSON, '$.password_hash');
              SET @rol = JSON_VALUE(@DATA_JSON, '$.rol');
              SET @activo = TRY_CAST(JSON_VALUE(@DATA_JSON, '$.activo') AS BIT);
          END

          IF @ACCION = 'SELECT_BY_USERNAME'
          BEGIN
              SELECT (
                  SELECT 
                      u.id, 
                      u.empresa_id, 
                      e.nombre AS empresa_nombre, 
                      u.nombre, 
                      u.username, 
                      u.email, 
                      u.password_hash, 
                      u.rol, 
                      u.activo
                  FROM usuarios_admin u
                  INNER JOIN empresas e ON u.empresa_id = e.id
                  WHERE (u.username = @username OR u.email = @username) AND u.activo = 1
                  FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
              ) AS DATOS;
          END
          ELSE IF @ACCION = 'SELECT_BY_ID'
          BEGIN
              SELECT (
                  SELECT 
                      u.id, 
                      u.empresa_id, 
                      e.nombre AS empresa_nombre, 
                      e.activo AS empresa_activo,
                      e.fecha_creacion AS empresa_fecha_creacion,
                      u.nombre, 
                      u.username, 
                      u.email, 
                      u.password_hash, 
                      u.rol, 
                      u.activo,
                      u.fecha_creacion,
                      u.fecha_actualizacion
                  FROM usuarios_admin u
                  INNER JOIN empresas e ON u.empresa_id = e.id
                  WHERE u.id = @id
                  FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
              ) AS DATOS;
          END
          ELSE IF @ACCION = 'SELECT_ALL'
          BEGIN
              SELECT (
                  SELECT 
                      u.id, 
                      u.empresa_id, 
                      e.nombre AS empresa_nombre, 
                      u.nombre, 
                      u.username, 
                      u.email, 
                      u.rol, 
                      u.activo,
                      u.fecha_creacion,
                      u.fecha_actualizacion
                  FROM usuarios_admin u
                  INNER JOIN empresas e ON u.empresa_id = e.id
                  WHERE (@empresa_id IS NULL OR u.empresa_id = @empresa_id)
                  ORDER BY u.fecha_actualizacion DESC
                  FOR JSON PATH
              ) AS DATOS;
          END
          ELSE IF @ACCION = 'INSERT'
          BEGIN
              IF EXISTS (SELECT 1 FROM usuarios_admin WHERE username = @username)
              BEGIN
                  THROW 50000, 'El nombre de usuario ya se encuentra registrado.', 1;
              END

              DECLARE @InsertedID UNIQUEIDENTIFIER = NEWID();

              INSERT INTO usuarios_admin (id, empresa_id, nombre, username, email, password_hash, rol, activo)
              VALUES (@InsertedID, ISNULL(@empresa_id, '00'), @nombre, @username, @email, @password_hash, ISNULL(@rol, 'ADMIN'), ISNULL(@activo, 1));

              SELECT (
                  SELECT u.id, u.empresa_id, e.nombre AS empresa_nombre, u.nombre, u.username, u.email, u.rol
                  FROM usuarios_admin u
                  INNER JOIN empresas e ON u.empresa_id = e.id
                  WHERE u.id = @InsertedID
                  FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
              ) AS DATOS;
          END
          ELSE IF @ACCION = 'UPDATE' OR @ACCION = 'UPDATE_PERFIL'
          BEGIN
              UPDATE usuarios_admin
              SET nombre = ISNULL(@nombre, nombre),
                  email = ISNULL(@email, email),
                  password_hash = ISNULL(@password_hash, password_hash),
                  rol = ISNULL(@rol, rol),
                  activo = ISNULL(@activo, activo),
                  fecha_actualizacion = GETDATE()
              WHERE id = @id;

              SELECT (
                  SELECT 
                      u.id, 
                      u.empresa_id, 
                      e.nombre AS empresa_nombre, 
                      u.nombre, 
                      u.username, 
                      u.email, 
                      u.rol, 
                      u.activo
                  FROM usuarios_admin u
                  INNER JOIN empresas e ON u.empresa_id = e.id
                  WHERE u.id = @id
                  FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
              ) AS DATOS;
          END
      END;
    `);
        console.log('Procedure "spUsuariosAdmin" created/updated.');

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
          DECLARE @empresa_id VARCHAR(20) = NULL;
          DECLARE @area NVARCHAR(150) = NULL;
          DECLARE @cargo NVARCHAR(150) = NULL;
          DECLARE @perfil_json NVARCHAR(MAX) = NULL;

          IF @DATA_JSON IS NOT NULL AND ISJSON(@DATA_JSON) > 0
          BEGIN
              SET @id = TRY_CAST(JSON_VALUE(@DATA_JSON, '$.id') AS UNIQUEIDENTIFIER);
              SET @empresa_id = JSON_VALUE(@DATA_JSON, '$.empresa_id');
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
                      p.id, 
                      p.empresa_id,
                      e.nombre AS empresa_nombre,
                      p.area, 
                      p.cargo, 
                      JSON_QUERY(p.perfil_json) AS perfil_json, 
                      p.fecha_creacion AS fecha_creacion, 
                      p.fecha_actualizacion AS fecha_actualizacion 
                  FROM perfiles_cargo p
                  LEFT JOIN empresas e ON p.empresa_id = e.id
                  WHERE (@empresa_id IS NULL OR p.empresa_id = @empresa_id)
                  ORDER BY p.fecha_actualizacion DESC
                  FOR JSON PATH
              ) AS DATOS;
          END
          ELSE IF @ACCION = 'SELECT_BY_ID'
          BEGIN
              SELECT (
                  SELECT 
                      p.id, 
                      p.empresa_id,
                      e.nombre AS empresa_nombre,
                      p.area, 
                      p.cargo, 
                      JSON_QUERY(p.perfil_json) AS perfil_json, 
                      p.fecha_creacion AS fecha_creacion, 
                      p.fecha_actualizacion AS fecha_actualizacion 
                  FROM perfiles_cargo p
                  LEFT JOIN empresas e ON p.empresa_id = e.id
                  WHERE p.id = @id
                  FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
              ) AS DATOS;
          END
          ELSE IF @ACCION = 'INSERT'
          BEGIN
              DECLARE @InsertedID UNIQUEIDENTIFIER = NEWID();

              INSERT INTO perfiles_cargo (id, empresa_id, area, cargo, perfil_json) 
              VALUES (@InsertedID, ISNULL(@empresa_id, '00'), @area, @cargo, @perfil_json);

              SELECT (
                  SELECT 
                      id, 
                      empresa_id,
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
              SET empresa_id = ISNULL(@empresa_id, empresa_id),
                  area = @area, 
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
          DECLARE @empresa_id VARCHAR(20) = NULL;
          DECLARE @perfil_id UNIQUEIDENTIFIER = NULL;
          DECLARE @titulo NVARCHAR(200) = NULL;
          DECLARE @descripcion NVARCHAR(MAX) = NULL;
          DECLARE @estado NVARCHAR(50) = NULL;
          DECLARE @requiere_registro BIT = NULL;
          DECLARE @configuracion_json NVARCHAR(MAX) = NULL;

          IF @DATA_JSON IS NOT NULL AND ISJSON(@DATA_JSON) > 0
          BEGIN
              SET @id = TRY_CAST(JSON_VALUE(@DATA_JSON, '$.id') AS UNIQUEIDENTIFIER);
              SET @empresa_id = JSON_VALUE(@DATA_JSON, '$.empresa_id');
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
                      v.empresa_id,
                      e.nombre AS empresa_nombre,
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
                  LEFT JOIN empresas e ON v.empresa_id = e.id
                  WHERE (@empresa_id IS NULL OR v.empresa_id = @empresa_id)
                  ORDER BY v.fecha_actualizacion DESC
                  FOR JSON PATH
              ) AS DATOS;
          END
          ELSE IF @ACCION = 'SELECT_ACTIVE'
          BEGIN
              SELECT (
                  SELECT 
                      v.id, 
                      v.empresa_id,
                      e.nombre AS empresa_nombre,
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
                  LEFT JOIN empresas e ON v.empresa_id = e.id
                  WHERE v.estado = 'ACTIVA' AND (@empresa_id IS NULL OR v.empresa_id = @empresa_id)
                  ORDER BY v.fecha_actualizacion DESC
                  FOR JSON PATH
              ) AS DATOS;
          END
          ELSE IF @ACCION = 'SELECT_BY_ID'
          BEGIN
              SELECT (
                  SELECT 
                      v.id, 
                      v.empresa_id,
                      e.nombre AS empresa_nombre,
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
                  LEFT JOIN empresas e ON v.empresa_id = e.id
                  WHERE v.id = @id
                  FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
              ) AS DATOS;
          END
          ELSE IF @ACCION = 'INSERT'
          BEGIN
              DECLARE @InsertedID UNIQUEIDENTIFIER = NEWID();

              INSERT INTO vacantes (id, empresa_id, perfil_id, titulo, descripcion, estado, requiere_registro, configuracion_json) 
              VALUES (@InsertedID, ISNULL(@empresa_id, '00'), @perfil_id, @titulo, @descripcion, ISNULL(@estado, 'ACTIVA'), ISNULL(@requiere_registro, 1), @configuracion_json);

              SELECT (
                  SELECT id, empresa_id, perfil_id, titulo, descripcion, estado, requiere_registro 
                  FROM vacantes 
                  WHERE id = @InsertedID
                  FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
              ) AS DATOS;
          END
          ELSE IF @ACCION = 'UPDATE'
          BEGIN
              UPDATE vacantes 
              SET empresa_id = ISNULL(@empresa_id, empresa_id),
                  perfil_id = @perfil_id, 
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
          DECLARE @empresa_id VARCHAR(20) = NULL;
          DECLARE @vacante_id UNIQUEIDENTIFIER = NULL;
          DECLARE @candidato_id UNIQUEIDENTIFIER = NULL;
          DECLARE @preguntas_respondidas_json NVARCHAR(MAX) = NULL;

          IF @DATA_JSON IS NOT NULL AND ISJSON(@DATA_JSON) > 0
          BEGIN
              SET @id = TRY_CAST(JSON_VALUE(@DATA_JSON, '$.id') AS UNIQUEIDENTIFIER);
              SET @empresa_id = JSON_VALUE(@DATA_JSON, '$.empresa_id');
              SET @vacante_id = TRY_CAST(JSON_VALUE(@DATA_JSON, '$.vacante_id') AS UNIQUEIDENTIFIER);
              SET @candidato_id = TRY_CAST(JSON_VALUE(@DATA_JSON, '$.candidato_id') AS UNIQUEIDENTIFIER);
              SET @preguntas_respondidas_json = JSON_QUERY(@DATA_JSON, '$.preguntas_respondidas_json');
              IF @preguntas_respondidas_json IS NULL SET @preguntas_respondidas_json = JSON_VALUE(@DATA_JSON, '$.preguntas_respondidas_json');
          END

          IF @ACCION = 'SELECT_ALL'
          BEGIN
              SELECT (
                  SELECT 
                      p.id, 
                      p.vacante_id,
                      v.empresa_id,
                      e.nombre AS empresa_nombre,
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
                      p.respuesta_ia,
                      p.estado_ia,
                      p.puntuacion_ia,
                      p.posicion,
                      p.segunda_validacion,
                      JSON_QUERY(p.json_analisis_ia) AS json_analisis_ia,
                      JSON_QUERY(COALESCE(p.preguntas_respondidas_json, '[]')) AS preguntas_respondidas
                  FROM postulaciones p
                  INNER JOIN vacantes v ON p.vacante_id = v.id
                  LEFT JOIN empresas e ON v.empresa_id = e.id
                  INNER JOIN candidatos c ON p.candidato_id = c.id
                  WHERE (@empresa_id IS NULL OR v.empresa_id = @empresa_id)
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
                      p.respuesta_ia,
                      p.estado_ia,
                      p.puntuacion_ia,
                      p.posicion,
                      p.segunda_validacion,
                      JSON_QUERY(p.json_analisis_ia) AS json_analisis_ia,
                      JSON_QUERY(COALESCE(p.preguntas_respondidas_json, '[]')) AS preguntas_respondidas
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
                  id, vacante_id, candidato_id, preguntas_respondidas_json
              )
              VALUES (
                  @InsertedID, @vacante_id, @candidato_id, @preguntas_respondidas_json
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
          DECLARE @acepto_tratamiento_datos BIT = NULL;
          DECLARE @version_tratamiento_datos NVARCHAR(50) = NULL;

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
              SET @acepto_tratamiento_datos = TRY_CAST(JSON_VALUE(@DATA_JSON, '$.acepto_tratamiento_datos') AS BIT);
              SET @version_tratamiento_datos = JSON_VALUE(@DATA_JSON, '$.version_tratamiento_datos');
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
                         hv_archivo_nombre, hv_archivo_ruta,
                         acepto_tratamiento_datos, fecha_aceptacion_tratamiento_datos, version_tratamiento_datos
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

              INSERT INTO candidatos (
                  id, email, password_hash, codigo_verificacion, verificado,
                  acepto_tratamiento_datos, fecha_aceptacion_tratamiento_datos, version_tratamiento_datos
              )
              VALUES (
                  @InsertedID, @email, @password_hash, @codigo_verificacion, ISNULL(@verificado, 0),
                  ISNULL(@acepto_tratamiento_datos, 0),
                  CASE WHEN @acepto_tratamiento_datos = 1 THEN GETDATE() ELSE NULL END,
                  CASE WHEN @acepto_tratamiento_datos = 1 THEN @version_tratamiento_datos ELSE NULL END
              );

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
                  acepto_tratamiento_datos = CASE WHEN @acepto_tratamiento_datos = 1 THEN 1 ELSE acepto_tratamiento_datos END,
                  fecha_aceptacion_tratamiento_datos = CASE WHEN @acepto_tratamiento_datos = 1 AND acepto_tratamiento_datos = 0 THEN GETDATE() ELSE fecha_aceptacion_tratamiento_datos END,
                  version_tratamiento_datos = CASE WHEN @acepto_tratamiento_datos = 1 AND acepto_tratamiento_datos = 0 THEN @version_tratamiento_datos ELSE version_tratamiento_datos END,
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
