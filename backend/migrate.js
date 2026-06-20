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
    
    console.log('Migrations executed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();
