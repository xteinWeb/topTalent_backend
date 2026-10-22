const { sql, poolPromise } = require('./config/db');
const bcrypt = require('bcryptjs');
const { migrateEstadosPostulacion } = require('./migrations/estadosPostulacion');

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
          rol NVARCHAR(50) DEFAULT 'SUPERADMIN' NOT NULL,
          area NVARCHAR(150) NULL,
          activo BIT DEFAULT 1 NOT NULL,
          fecha_creacion DATETIME2 DEFAULT GETDATE(),
          fecha_actualizacion DATETIME2 DEFAULT GETDATE()
        );
      `;
            await pool.request().query(createUsuariosAdminQuery);
            console.log('Table "usuarios_admin" created successfully.');
        } else {
            console.log('Table "usuarios_admin" already exists. Checking columns...');
            const alterUsuariosColsQuery = `
                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'usuarios_admin' AND COLUMN_NAME = 'area')
                BEGIN
                    ALTER TABLE usuarios_admin ADD area NVARCHAR(150) NULL;
                END
            `;
            await pool.request().query(alterUsuariosColsQuery);
        }

        // Seed initial users for company '00' for role testing
        const seedUsers = [
            { username: 'admin', nombre: 'Administrador Artdecon', email: 'admin@artdecon.com', rol: 'SUPERADMIN', pass: 'admin123', area: 'Dirección' },
            { username: 'gerencia', nombre: 'Gerencia General', email: 'gerencia@artdecon.com', rol: 'GERENCIA', pass: 'gerencia123', area: 'Gerencia' },
            { username: 'talento', nombre: 'Evelyn Alfaro (Talento Humano)', email: 'talento@artdecon.com', rol: 'TALENTO_HUMANO', pass: 'talento123', area: 'Talento Humano' },
            { username: 'lider.planta', nombre: 'Líder Planta y Mantenimiento', email: 'lider.planta@artdecon.com', rol: 'LIDER_AREA', pass: 'lider123', area: 'Planta y Operaciones' },
            { username: 'lider.comercial', nombre: 'Líder Comercial', email: 'lider.comercial@artdecon.com', rol: 'LIDER_AREA', pass: 'lider123', area: 'Comercial' }
        ];

        for (const u of seedUsers) {
            const checkUser = await pool.request()
                .input('username', sql.NVarChar(100), u.username)
                .query("SELECT COUNT(*) AS total FROM usuarios_admin WHERE username = @username");

            if (checkUser.recordset[0].total === 0) {
                const passHash = await bcrypt.hash(u.pass, 10);
                await pool.request()
                    .input('empresa_id', sql.VarChar(20), '00')
                    .input('nombre', sql.NVarChar(150), u.nombre)
                    .input('username', sql.NVarChar(100), u.username)
                    .input('email', sql.NVarChar(250), u.email)
                    .input('password_hash', sql.NVarChar(sql.MAX), passHash)
                    .input('rol', sql.NVarChar(50), u.rol)
                    .input('area', sql.NVarChar(150), u.area)
                    .query(`
                        INSERT INTO usuarios_admin (empresa_id, nombre, username, email, password_hash, rol, area, activo)
                        VALUES (@empresa_id, @nombre, @username, @email, @password_hash, @rol, @area, 1)
                    `);
                console.log(`Usuario ${u.username} (${u.rol}) creado exitosamente.`);
            }
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
                IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'perfiles_cargo' AND COLUMN_NAME = 'matriz_competencias_json')
                BEGIN
                    ALTER TABLE perfiles_cargo ADD matriz_competencias_json NVARCHAR(MAX) NULL;
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
          solicitado_por_id UNIQUEIDENTIFIER NULL FOREIGN KEY REFERENCES usuarios_admin(id),
          autorizado_por_id UNIQUEIDENTIFIER NULL FOREIGN KEY REFERENCES usuarios_admin(id),
          estado_aprobacion NVARCHAR(50) DEFAULT 'APROBADO' NOT NULL,
          observaciones_aprobacion NVARCHAR(MAX) NULL,
          tipo_requerimiento NVARCHAR(50) DEFAULT 'CARGO_NUEVO' NOT NULL,
          nombre_reemplaza NVARCHAR(200) NULL,
          seccion_area NVARCHAR(150) NULL,
          salario_min DECIMAL(18,2) NULL,
          salario_max DECIMAL(18,2) NULL,
          perfil_oculto_json NVARCHAR(MAX) NULL,
          fecha_solicitud DATETIME2 DEFAULT GETDATE(),
          fecha_autorizacion DATETIME2 NULL,
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
                IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'vacantes' AND COLUMN_NAME = 'solicitado_por_id')
                BEGIN
                    ALTER TABLE vacantes ADD solicitado_por_id UNIQUEIDENTIFIER NULL;
                END
                IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'vacantes' AND COLUMN_NAME = 'autorizado_por_id')
                BEGIN
                    ALTER TABLE vacantes ADD autorizado_por_id UNIQUEIDENTIFIER NULL;
                END
                IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'vacantes' AND COLUMN_NAME = 'estado_aprobacion')
                BEGIN
                    ALTER TABLE vacantes ADD estado_aprobacion NVARCHAR(50) DEFAULT 'APROBADO' NOT NULL;
                END
                IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'vacantes' AND COLUMN_NAME = 'observaciones_aprobacion')
                BEGIN
                    ALTER TABLE vacantes ADD observaciones_aprobacion NVARCHAR(MAX) NULL;
                END
                IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'vacantes' AND COLUMN_NAME = 'tipo_requerimiento')
                BEGIN
                    ALTER TABLE vacantes ADD tipo_requerimiento NVARCHAR(50) DEFAULT 'CARGO_NUEVO' NOT NULL;
                END
                IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'vacantes' AND COLUMN_NAME = 'nombre_reemplaza')
                BEGIN
                    ALTER TABLE vacantes ADD nombre_reemplaza NVARCHAR(200) NULL;
                END
                IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'vacantes' AND COLUMN_NAME = 'seccion_area')
                BEGIN
                    ALTER TABLE vacantes ADD seccion_area NVARCHAR(150) NULL;
                END
                IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'vacantes' AND COLUMN_NAME = 'salario_min')
                BEGIN
                    ALTER TABLE vacantes ADD salario_min DECIMAL(18,2) NULL;
                END
                IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'vacantes' AND COLUMN_NAME = 'salario_max')
                BEGIN
                    ALTER TABLE vacantes ADD salario_max DECIMAL(18,2) NULL;
                END
                IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'vacantes' AND COLUMN_NAME = 'perfil_oculto_json')
                BEGIN
                    ALTER TABLE vacantes ADD perfil_oculto_json NVARCHAR(MAX) NULL;
                END
                IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'vacantes' AND COLUMN_NAME = 'fecha_solicitud')
                BEGIN
                    ALTER TABLE vacantes ADD fecha_solicitud DATETIME2 DEFAULT GETDATE();
                END
                IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'vacantes' AND COLUMN_NAME = 'fecha_autorizacion')
                BEGIN
                    ALTER TABLE vacantes ADD fecha_autorizacion DATETIME2 NULL;
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
          segunda_validacion BIT NULL,
          estado_postulante NVARCHAR(50) DEFAULT 'Postulado' NOT NULL,
          cita_entrevista_json NVARCHAR(MAX) NULL,
          evaluacion_entrevista_json NVARCHAR(MAX) NULL
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

                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'postulaciones' AND COLUMN_NAME = 'respuesta_ia')
                BEGIN
                    ALTER TABLE postulaciones ADD respuesta_ia NVARCHAR(MAX) NULL;
                END

                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'postulaciones' AND COLUMN_NAME = 'estado_ia')
                BEGIN
                    ALTER TABLE postulaciones ADD estado_ia NVARCHAR(MAX) NULL;
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
                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'postulaciones' AND COLUMN_NAME = 'estado_postulante')
                BEGIN
                    ALTER TABLE postulaciones ADD estado_postulante NVARCHAR(50) DEFAULT 'Postulado' NOT NULL;
                END
                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'postulaciones' AND COLUMN_NAME = 'cita_entrevista_json')
                BEGIN
                    ALTER TABLE postulaciones ADD cita_entrevista_json NVARCHAR(MAX) NULL;
                END
                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'postulaciones' AND COLUMN_NAME = 'evaluacion_entrevista_json')
                BEGIN
                    ALTER TABLE postulaciones ADD evaluacion_entrevista_json NVARCHAR(MAX) NULL;
                END

                -- Delete orphan records if any
                EXEC('DELETE FROM postulaciones WHERE candidato_id IS NULL');

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
                EXEC('ALTER TABLE postulaciones ALTER COLUMN candidato_id UNIQUEIDENTIFIER NOT NULL');

                -- Add new Foreign Key with CASCADE
                EXEC('ALTER TABLE postulaciones ADD CONSTRAINT FK_postulaciones_candidatos FOREIGN KEY (candidato_id) REFERENCES candidatos(id) ON DELETE CASCADE');
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

        // 3.6 Catálogo dinámico de estados de postulación (tabla + semilla + spEstadosPostulacion)
        console.log('Creating/Updating estados_postulacion...');
        await migrateEstadosPostulacion(pool);
        console.log('Tabla "estados_postulacion" y procedure "spEstadosPostulacion" listos.');

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
          DECLARE @area NVARCHAR(150) = NULL;
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
              SET @area = JSON_VALUE(@DATA_JSON, '$.area');
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
                      u.area,
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
                      u.area,
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
                      u.area,
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

              INSERT INTO usuarios_admin (id, empresa_id, nombre, username, email, password_hash, rol, area, activo)
              VALUES (@InsertedID, ISNULL(@empresa_id, '00'), @nombre, @username, @email, @password_hash, ISNULL(@rol, 'SUPERADMIN'), @area, ISNULL(@activo, 1));

              SELECT (
                  SELECT u.id, u.empresa_id, e.nombre AS empresa_nombre, u.nombre, u.username, u.email, u.rol, u.area
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
                  area = ISNULL(@area, area),
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
                      u.area,
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
          DECLARE @matriz_competencias_json NVARCHAR(MAX) = NULL;

          IF @DATA_JSON IS NOT NULL AND ISJSON(@DATA_JSON) > 0
          BEGIN
              SET @id = TRY_CAST(JSON_VALUE(@DATA_JSON, '$.id') AS UNIQUEIDENTIFIER);
              SET @empresa_id = JSON_VALUE(@DATA_JSON, '$.empresa_id');
              SET @area = JSON_VALUE(@DATA_JSON, '$.area');
              SET @cargo = JSON_VALUE(@DATA_JSON, '$.cargo');
              SET @perfil_json = JSON_QUERY(@DATA_JSON, '$.perfil_json');
              IF @perfil_json IS NULL SET @perfil_json = JSON_VALUE(@DATA_JSON, '$.perfil_json');

              SET @matriz_competencias_json = JSON_QUERY(@DATA_JSON, '$.matriz_competencias_json');
              IF @matriz_competencias_json IS NULL SET @matriz_competencias_json = JSON_VALUE(@DATA_JSON, '$.matriz_competencias_json');
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
                      CASE WHEN ISJSON(p.perfil_json) = 1 THEN JSON_QUERY(p.perfil_json) ELSE NULL END AS perfil_json, 
                      CASE WHEN ISJSON(p.matriz_competencias_json) = 1 THEN JSON_QUERY(p.matriz_competencias_json) ELSE NULL END AS matriz_competencias_json,
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
                      CASE WHEN ISJSON(p.perfil_json) = 1 THEN JSON_QUERY(p.perfil_json) ELSE NULL END AS perfil_json, 
                      CASE WHEN ISJSON(p.matriz_competencias_json) = 1 THEN JSON_QUERY(p.matriz_competencias_json) ELSE NULL END AS matriz_competencias_json,
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

              INSERT INTO perfiles_cargo (id, empresa_id, area, cargo, perfil_json, matriz_competencias_json) 
              VALUES (@InsertedID, ISNULL(@empresa_id, '00'), @area, @cargo, @perfil_json, @matriz_competencias_json);

              SELECT (
                  SELECT id, empresa_id, area, cargo 
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
                  matriz_competencias_json = ISNULL(@matriz_competencias_json, matriz_competencias_json),
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

          -- Campos extendidos Octubre 2026
          DECLARE @solicitado_por_id UNIQUEIDENTIFIER = NULL;
          DECLARE @autorizado_por_id UNIQUEIDENTIFIER = NULL;
          DECLARE @estado_aprobacion NVARCHAR(50) = NULL;
          DECLARE @observaciones_aprobacion NVARCHAR(MAX) = NULL;
          DECLARE @tipo_requerimiento NVARCHAR(50) = NULL;
          DECLARE @nombre_reemplaza NVARCHAR(200) = NULL;
          DECLARE @seccion_area NVARCHAR(150) = NULL;
          DECLARE @salario_min DECIMAL(18,2) = NULL;
          DECLARE @salario_max DECIMAL(18,2) = NULL;
          DECLARE @perfil_oculto_json NVARCHAR(MAX) = NULL;

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

              SET @solicitado_por_id = TRY_CAST(JSON_VALUE(@DATA_JSON, '$.solicitado_por_id') AS UNIQUEIDENTIFIER);
              SET @autorizado_por_id = TRY_CAST(JSON_VALUE(@DATA_JSON, '$.autorizado_por_id') AS UNIQUEIDENTIFIER);
              SET @estado_aprobacion = JSON_VALUE(@DATA_JSON, '$.estado_aprobacion');
              SET @observaciones_aprobacion = JSON_VALUE(@DATA_JSON, '$.observaciones_aprobacion');
              SET @tipo_requerimiento = JSON_VALUE(@DATA_JSON, '$.tipo_requerimiento');
              SET @nombre_reemplaza = JSON_VALUE(@DATA_JSON, '$.nombre_reemplaza');
              SET @seccion_area = JSON_VALUE(@DATA_JSON, '$.seccion_area');
              SET @salario_min = TRY_CAST(JSON_VALUE(@DATA_JSON, '$.salario_min') AS DECIMAL(18,2));
              SET @salario_max = TRY_CAST(JSON_VALUE(@DATA_JSON, '$.salario_max') AS DECIMAL(18,2));
              SET @perfil_oculto_json = JSON_QUERY(@DATA_JSON, '$.perfil_oculto_json');
              IF @perfil_oculto_json IS NULL SET @perfil_oculto_json = JSON_VALUE(@DATA_JSON, '$.perfil_oculto_json');
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
                      p.area AS perfil_area,
                      CASE WHEN ISJSON(p.perfil_json) = 1 THEN JSON_QUERY(p.perfil_json) ELSE NULL END AS perfil_completo_json,
                      CASE WHEN ISJSON(p.matriz_competencias_json) = 1 THEN JSON_QUERY(p.matriz_competencias_json) ELSE NULL END AS matriz_competencias_json,
                      v.titulo, 
                      v.descripcion, 
                      v.estado, 
                      v.requiere_registro,
                      CASE WHEN ISJSON(v.configuracion_json) = 1 THEN JSON_QUERY(v.configuracion_json) ELSE NULL END AS configuracion_json,
                      v.solicitado_por_id,
                      u_sol.nombre AS solicitado_por_nombre,
                      v.autorizado_por_id,
                      u_aut.nombre AS autorizado_por_nombre,
                      ISNULL(v.estado_aprobacion, 'APROBADA') AS estado_aprobacion,
                      v.observaciones_aprobacion,
                      v.tipo_requerimiento,
                      v.nombre_reemplaza,
                      v.seccion_area,
                      v.salario_min,
                      v.salario_max,
                      CASE WHEN ISJSON(v.perfil_oculto_json) = 1 THEN JSON_QUERY(v.perfil_oculto_json) ELSE NULL END AS perfil_oculto_json,
                      v.fecha_solicitud,
                      v.fecha_autorizacion,
                      v.fecha_creacion, 
                      v.fecha_actualizacion 
                  FROM vacantes v
                  INNER JOIN perfiles_cargo p ON v.perfil_id = p.id
                  LEFT JOIN empresas e ON v.empresa_id = e.id
                  LEFT JOIN usuarios_admin u_sol ON v.solicitado_por_id = u_sol.id
                  LEFT JOIN usuarios_admin u_aut ON v.autorizado_por_id = u_aut.id
                  WHERE (@empresa_id IS NULL OR v.empresa_id = @empresa_id) 
                    AND (@solicitado_por_id IS NULL OR v.solicitado_por_id = @solicitado_por_id)
                    AND v.estado != 'ELIMINADA'
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
                      p.area AS perfil_area,
                      CASE WHEN ISJSON(p.perfil_json) = 1 THEN JSON_QUERY(p.perfil_json) ELSE NULL END AS perfil_completo_json,
                      v.titulo, 
                      v.descripcion, 
                      v.estado, 
                      v.requiere_registro,
                      CASE WHEN ISJSON(v.configuracion_json) = 1 THEN JSON_QUERY(v.configuracion_json) ELSE NULL END AS configuracion_json,
                      v.tipo_requerimiento,
                      v.seccion_area,
                      v.salario_min,
                      v.salario_max,
                      v.fecha_creacion, 
                      v.fecha_actualizacion 
                  FROM vacantes v
                  INNER JOIN perfiles_cargo p ON v.perfil_id = p.id
                  LEFT JOIN empresas e ON v.empresa_id = e.id
                  WHERE v.estado = 'ACTIVA' 
                    AND (v.estado_aprobacion IS NULL OR v.estado_aprobacion IN ('APROBADA', 'Aprobado', 'Aprobado con reservas'))
                    AND (@empresa_id IS NULL OR v.empresa_id = @empresa_id)
                  ORDER BY v.fecha_actualizacion DESC
                  FOR JSON PATH
              ) AS DATOS;
          END
          ELSE IF @ACCION = 'SELECT_SOLICITUDES_PENDIENTES'
          BEGIN
              SELECT (
                  SELECT 
                      v.id, 
                      v.empresa_id,
                      e.nombre AS empresa_nombre,
                      v.perfil_id,
                      p.cargo AS perfil_cargo,
                      p.area AS perfil_area,
                      CASE WHEN ISJSON(p.perfil_json) = 1 THEN JSON_QUERY(p.perfil_json) ELSE NULL END AS perfil_completo_json,
                      v.titulo, 
                      v.descripcion, 
                      v.estado, 
                      v.solicitado_por_id,
                      u_sol.nombre AS solicitado_por_nombre,
                      v.estado_aprobacion,
                      v.observaciones_aprobacion,
                      v.tipo_requerimiento,
                      v.nombre_reemplaza,
                      v.seccion_area,
                      v.salario_min,
                      v.salario_max,
                      CASE WHEN ISJSON(v.perfil_oculto_json) = 1 THEN JSON_QUERY(v.perfil_oculto_json) ELSE NULL END AS perfil_oculto_json,
                      v.fecha_solicitud,
                      v.fecha_creacion
                  FROM vacantes v
                  INNER JOIN perfiles_cargo p ON v.perfil_id = p.id
                  LEFT JOIN empresas e ON v.empresa_id = e.id
                  LEFT JOIN usuarios_admin u_sol ON v.solicitado_por_id = u_sol.id
                  WHERE (@empresa_id IS NULL OR v.empresa_id = @empresa_id)
                    AND v.estado != 'ELIMINADA'
                    AND v.estado_aprobacion IN ('PENDIENTE', 'Con observaciones', 'Pendiente')
                  ORDER BY v.fecha_solicitud DESC
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
                      p.area AS perfil_area,
                      CASE WHEN ISJSON(p.perfil_json) = 1 THEN JSON_QUERY(p.perfil_json) ELSE NULL END AS perfil_completo_json,
                      CASE WHEN ISJSON(p.matriz_competencias_json) = 1 THEN JSON_QUERY(p.matriz_competencias_json) ELSE NULL END AS matriz_competencias_json,
                      v.titulo, 
                      v.descripcion, 
                      v.estado, 
                      v.requiere_registro,
                      CASE WHEN ISJSON(v.configuracion_json) = 1 THEN JSON_QUERY(v.configuracion_json) ELSE NULL END AS configuracion_json,
                      v.solicitado_por_id,
                      u_sol.nombre AS solicitado_por_nombre,
                      v.autorizado_por_id,
                      u_aut.nombre AS autorizado_por_nombre,
                      ISNULL(v.estado_aprobacion, 'APROBADA') AS estado_aprobacion,
                      v.observaciones_aprobacion,
                      v.tipo_requerimiento,
                      v.nombre_reemplaza,
                      v.seccion_area,
                      v.salario_min,
                      v.salario_max,
                      CASE WHEN ISJSON(v.perfil_oculto_json) = 1 THEN JSON_QUERY(v.perfil_oculto_json) ELSE NULL END AS perfil_oculto_json,
                      v.fecha_solicitud,
                      v.fecha_autorizacion,
                      v.fecha_creacion, 
                      v.fecha_actualizacion 
                  FROM vacantes v
                  INNER JOIN perfiles_cargo p ON v.perfil_id = p.id
                  LEFT JOIN empresas e ON v.empresa_id = e.id
                  LEFT JOIN usuarios_admin u_sol ON v.solicitado_por_id = u_sol.id
                  LEFT JOIN usuarios_admin u_aut ON v.autorizado_por_id = u_aut.id
                  WHERE v.id = @id
                  FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
              ) AS DATOS;
          END
          ELSE IF @ACCION = 'SOLICITAR'
          BEGIN
              DECLARE @NewSolicitudID UNIQUEIDENTIFIER = NEWID();

              INSERT INTO vacantes (
                  id, empresa_id, perfil_id, titulo, descripcion, estado, requiere_registro, 
                  configuracion_json, solicitado_por_id, estado_aprobacion, tipo_requerimiento, 
                  nombre_reemplaza, seccion_area, salario_min, salario_max, perfil_oculto_json, fecha_solicitud
              ) 
              VALUES (
                  @NewSolicitudID, ISNULL(@empresa_id, '00'), @perfil_id, @titulo, @descripcion, 
                  'INACTIVA', ISNULL(@requiere_registro, 1), @configuracion_json, 
                  @solicitado_por_id, 'PENDIENTE', @tipo_requerimiento, 
                  @nombre_reemplaza, @seccion_area, @salario_min, @salario_max, @perfil_oculto_json, GETDATE()
              );

              SELECT (
                  SELECT id, titulo, estado, estado_aprobacion, fecha_solicitud 
                  FROM vacantes 
                  WHERE id = @NewSolicitudID
                  FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
              ) AS DATOS;
          END
          ELSE IF @ACCION = 'AUTORIZAR'
          BEGIN
              UPDATE vacantes 
              SET estado_aprobacion = @estado_aprobacion,
                  autorizado_por_id = @autorizado_por_id,
                  observaciones_aprobacion = @observaciones_aprobacion,
                  fecha_autorizacion = GETDATE(),
                  fecha_actualizacion = GETDATE()
              WHERE id = @id;

              SELECT '{"message": "Solicitud de vacante evaluada exitosamente"}' AS DATOS;
          END
          ELSE IF @ACCION = 'ACTIVAR'
          BEGIN
              UPDATE vacantes 
              SET estado = 'ACTIVA', fecha_actualizacion = GETDATE() 
              WHERE id = @id;

              SELECT '{"message": "Vacante activada exitosamente"}' AS DATOS;
          END
          ELSE IF @ACCION = 'DESACTIVAR'
          BEGIN
              UPDATE vacantes 
              SET estado = 'INACTIVA', fecha_actualizacion = GETDATE() 
              WHERE id = @id;

              SELECT '{"message": "Vacante desactivada exitosamente"}' AS DATOS;
          END
          ELSE IF @ACCION = 'INSERT'
          BEGIN
              DECLARE @InsertedID UNIQUEIDENTIFIER = NEWID();

              INSERT INTO vacantes (
                  id, empresa_id, perfil_id, titulo, descripcion, estado, requiere_registro, 
                  configuracion_json, solicitado_por_id, autorizado_por_id, estado_aprobacion,
                  observaciones_aprobacion, tipo_requerimiento, nombre_reemplaza, seccion_area,
                  salario_min, salario_max, perfil_oculto_json, fecha_solicitud, fecha_autorizacion
              ) 
              VALUES (
                  @InsertedID, ISNULL(@empresa_id, '00'), @perfil_id, @titulo, @descripcion, 
                  ISNULL(@estado, 'ACTIVA'), ISNULL(@requiere_registro, 1), @configuracion_json,
                  @solicitado_por_id, @autorizado_por_id, ISNULL(@estado_aprobacion, 'APROBADA'),
                  @observaciones_aprobacion, @tipo_requerimiento, @nombre_reemplaza, @seccion_area,
                  @salario_min, @salario_max, @perfil_oculto_json, GETDATE(), 
                  CASE WHEN @estado_aprobacion IN ('APROBADA', 'Aprobado') THEN GETDATE() ELSE NULL END
              );

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
                  tipo_requerimiento = ISNULL(@tipo_requerimiento, tipo_requerimiento),
                  nombre_reemplaza = ISNULL(@nombre_reemplaza, nombre_reemplaza),
                  seccion_area = ISNULL(@seccion_area, seccion_area),
                  salario_min = ISNULL(@salario_min, salario_min),
                  salario_max = ISNULL(@salario_max, salario_max),
                  perfil_oculto_json = ISNULL(@perfil_oculto_json, perfil_oculto_json),
                  estado_aprobacion = ISNULL(@estado_aprobacion, estado_aprobacion),
                  observaciones_aprobacion = ISNULL(@observaciones_aprobacion, observaciones_aprobacion),
                  fecha_actualizacion = GETDATE() 
              WHERE id = @id;

              SELECT '{"message": "Vacante actualizada exitosamente"}' AS DATOS;
          END
          ELSE IF @ACCION = 'DELETE'
          BEGIN
              UPDATE vacantes SET estado = 'ELIMINADA', fecha_actualizacion = GETDATE() WHERE id = @id;
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
          DECLARE @estado_postulante NVARCHAR(50) = NULL;
          DECLARE @cita_entrevista_json NVARCHAR(MAX) = NULL;
          DECLARE @evaluacion_entrevista_json NVARCHAR(MAX) = NULL;

          IF @DATA_JSON IS NOT NULL AND ISJSON(@DATA_JSON) > 0
          BEGIN
              SET @id = TRY_CAST(JSON_VALUE(@DATA_JSON, '$.id') AS UNIQUEIDENTIFIER);
              SET @empresa_id = JSON_VALUE(@DATA_JSON, '$.empresa_id');
              SET @vacante_id = TRY_CAST(JSON_VALUE(@DATA_JSON, '$.vacante_id') AS UNIQUEIDENTIFIER);
              SET @candidato_id = TRY_CAST(JSON_VALUE(@DATA_JSON, '$.candidato_id') AS UNIQUEIDENTIFIER);
              SET @preguntas_respondidas_json = JSON_QUERY(@DATA_JSON, '$.preguntas_respondidas_json');
              IF @preguntas_respondidas_json IS NULL SET @preguntas_respondidas_json = JSON_VALUE(@DATA_JSON, '$.preguntas_respondidas_json');
              
              SET @estado_postulante = JSON_VALUE(@DATA_JSON, '$.estado_postulante');
              SET @cita_entrevista_json = JSON_QUERY(@DATA_JSON, '$.cita_entrevista_json');
              IF @cita_entrevista_json IS NULL SET @cita_entrevista_json = JSON_VALUE(@DATA_JSON, '$.cita_entrevista_json');

              SET @evaluacion_entrevista_json = JSON_QUERY(@DATA_JSON, '$.evaluacion_entrevista_json');
              IF @evaluacion_entrevista_json IS NULL SET @evaluacion_entrevista_json = JSON_VALUE(@DATA_JSON, '$.evaluacion_entrevista_json');
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
                      JSON_QUERY(COALESCE(p.preguntas_respondidas_json, '[]')) AS preguntas_respondidas,
                      ISNULL(p.estado_postulante, 'Postulado') AS estado_postulante,
                      CASE WHEN ISJSON(p.cita_entrevista_json) = 1 THEN JSON_QUERY(p.cita_entrevista_json) ELSE NULL END AS cita_entrevista_json,
                      CASE WHEN ISJSON(p.evaluacion_entrevista_json) = 1 THEN JSON_QUERY(p.evaluacion_entrevista_json) ELSE NULL END AS evaluacion_entrevista_json,
                      CASE WHEN ISJSON(pc.matriz_competencias_json) = 1 THEN JSON_QUERY(pc.matriz_competencias_json) ELSE NULL END AS matriz_competencias_json
                  FROM postulaciones p
                  INNER JOIN vacantes v ON p.vacante_id = v.id
                  INNER JOIN perfiles_cargo pc ON v.perfil_id = pc.id
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
                      JSON_QUERY(COALESCE(p.preguntas_respondidas_json, '[]')) AS preguntas_respondidas,
                      ISNULL(p.estado_postulante, 'Postulado') AS estado_postulante,
                      CASE WHEN ISJSON(p.cita_entrevista_json) = 1 THEN JSON_QUERY(p.cita_entrevista_json) ELSE NULL END AS cita_entrevista_json,
                      CASE WHEN ISJSON(p.evaluacion_entrevista_json) = 1 THEN JSON_QUERY(p.evaluacion_entrevista_json) ELSE NULL END AS evaluacion_entrevista_json,
                      CASE WHEN ISJSON(pc.matriz_competencias_json) = 1 THEN JSON_QUERY(pc.matriz_competencias_json) ELSE NULL END AS matriz_competencias_json
                  FROM postulaciones p
                  INNER JOIN vacantes v ON p.vacante_id = v.id
                  INNER JOIN perfiles_cargo pc ON v.perfil_id = pc.id
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
                  id, vacante_id, candidato_id, preguntas_respondidas_json, estado_postulante
              )
              VALUES (
                  @InsertedID, @vacante_id, @candidato_id, @preguntas_respondidas_json, 'Postulado'
              );

              SELECT (
                  SELECT p.id, p.vacante_id, p.candidato_id, c.email AS correo, p.estado_postulante
                  FROM postulaciones p
                  INNER JOIN candidatos c ON p.candidato_id = c.id
                  WHERE p.id = @InsertedID
                  FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
              ) AS DATOS;
          END
          ELSE IF @ACCION = 'CAMBIAR_ESTADO_POSTULANTE'
          BEGIN
              UPDATE postulaciones 
              SET estado_postulante = @estado_postulante
              WHERE id = @id;

              SELECT '{"message": "Estado del postulante actualizado exitosamente"}' AS DATOS;
          END
          ELSE IF @ACCION = 'AGENDAR_ENTREVISTA'
          BEGIN
              UPDATE postulaciones 
              SET cita_entrevista_json = @cita_entrevista_json,
                  estado_postulante = 'Citado a Entrevista'
              WHERE id = @id;

              SELECT '{"message": "Entrevista agendada exitosamente"}' AS DATOS;
          END
          ELSE IF @ACCION = 'GUARDAR_EVALUACION_ENTREVISTA'
          BEGIN
              UPDATE postulaciones 
              SET evaluacion_entrevista_json = @evaluacion_entrevista_json,
                  estado_postulante = ISNULL(@estado_postulante, estado_postulante)
              WHERE id = @id;

              SELECT '{"message": "Evaluación de entrevista guardada exitosamente"}' AS DATOS;
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
