const { poolPromise, sql } = require('../config/db');

async function main() {
  try {
    const pool = await poolPromise;
    
    // Check columns in postulaciones
    const cols = await pool.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE, COLUMN_DEFAULT
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'postulaciones'
      ORDER BY ORDINAL_POSITION
    `);
    console.log('--- POSTULACIONES COLUMNS ---');
    console.table(cols.recordset);

    // Check all tables in DB
    const allTables = await pool.request().query(`
      SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'
    `);
    console.log('--- ALL TABLES ---');
    console.table(allTables.recordset);

    // Check spPostulaciones definition
    const sp = await pool.request().query(`
      SELECT OBJECT_DEFINITION(OBJECT_ID('spPostulaciones')) AS def
    `);
    const def = sp.recordset[0]?.def || '';
    const idx = def.indexOf('CAMBIAR_ESTADO_POSTULANTE');
    if (idx !== -1) {
      console.log('--- SP POSTULACIONES (CAMBIAR_ESTADO_POSTULANTE) ---');
      console.log(def.substring(Math.max(0, idx - 100), idx + 500));
    } else {
      console.log('CAMBIAR_ESTADO_POSTULANTE not found in spPostulaciones definition');
    }

    const constraints = await pool.request().query(`
      SELECT CONSTRAINT_NAME, CONSTRAINT_TYPE 
      FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS 
      WHERE TABLE_NAME = 'postulaciones'
    `);
    console.log('--- CONSTRAINTS ---');
    console.table(constraints.recordset);

    const checkConstraints = await pool.request().query(`
      SELECT cc.CONSTRAINT_NAME, cc.CHECK_CLAUSE 
      FROM INFORMATION_SCHEMA.CHECK_CONSTRAINTS cc
      JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc ON cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
      WHERE tc.TABLE_NAME = 'postulaciones'
    `);
    console.log('--- CHECK CONSTRAINTS ---');
    console.table(checkConstraints.recordset);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
