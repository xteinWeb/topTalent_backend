const sql = require('mssql');
require('dotenv').config();

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT || '1433', 10),
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: true // useful for local dev environments
  }
};

const poolPromise = new sql.ConnectionPool(config)
  .connect()
  .then(pool => {
    console.log('Connected to SQL Server');
    // Add custom query method to mimic pool.query('QUERY', [params])
    pool.query = async function (queryStr, params = []) {
      const request = pool.request();
      let index = 0;
      const newQueryStr = queryStr.replace(/\?/g, () => {
        const paramName = `p${index}`;
        // Register parameters dynamically
        request.input(paramName, params[index]);
        index++;
        return `@${paramName}`;
      });
      return request.query(newQueryStr);
    };
    return pool;
  })
  .catch(err => {
    console.error('Database Connection Failed! Bad Config: ', err);
    throw err;
  });

module.exports = {
  sql,
  poolPromise
};
