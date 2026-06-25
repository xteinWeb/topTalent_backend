const { sql, poolPromise } = require('./config/db');

async function migrate() {
  try {
    console.log('Connecting to database...');
    const pool = await poolPromise;
    console.log('Checking database tables...');
    
    // Check if the perfiles_cargo table exists in SQL Server schema
    const checkQuery = `
      SELECT 1 FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_NAME = 'perfiles_cargo'
    `;
    const checkResult = await pool.request().query(checkQuery);
    
    if (checkResult.recordset.length === 0) {
      console.log('Table "perfiles_cargo" does not exist. Creating...');
      
      const createTableQuery = `
        CREATE TABLE perfiles_cargo (
          id UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
          area NVARCHAR(150) NOT NULL,
          cargo NVARCHAR(150) NOT NULL,
          perfil_json NVARCHAR(MAX) NOT NULL,
          fecha_creacion DATETIME2 DEFAULT GETDATE(),
          fecha_actualizacion DATETIME2 DEFAULT GETDATE()
        );
      `;
      
      await pool.request().query(createTableQuery);
      console.log('Table "perfiles_cargo" created successfully.');
    } else {
      console.log('Table "perfiles_cargo" already exists. No actions required.');
    }

    console.log('Cleaning up old Stored Procedures...');
    await pool.request().query('DROP PROCEDURE IF EXISTS sp_PerfilesCargo_GetAll');
    await pool.request().query('DROP PROCEDURE IF EXISTS sp_PerfilesCargo_GetById');
    await pool.request().query('DROP PROCEDURE IF EXISTS sp_PerfilesCargo_Create');
    await pool.request().query('DROP PROCEDURE IF EXISTS sp_PerfilesCargo_Update');
    await pool.request().query('DROP PROCEDURE IF EXISTS sp_PerfilesCargo_Delete');
    await pool.request().query('DROP PROCEDURE IF EXISTS sp_PerfilesCargo');
    await pool.request().query('DROP PROCEDURE IF EXISTS spPerfilesCargo');
    console.log('Old procedures dropped successfully.');

    console.log('Creating/Updating Stored Procedure spPerfilesCargo with @ACCION and @DATA_JSON...');

    await pool.request().query(`
      CREATE OR ALTER PROCEDURE spPerfilesCargo
          @ACCION VARCHAR(50),
          @DATA_JSON NVARCHAR(MAX) = NULL
      AS
      BEGIN
          SET NOCOUNT ON;

          -- Declarar variables internas extraídas del JSON
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
    
    console.log('Migrations executed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();
