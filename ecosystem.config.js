module.exports = {
  apps: [
    {
      name: 'topTalent-backend',
      script: 'index.js',
      // En producción no se suele activar watch por defecto, pero se puede configurar
      watch: false,

      // Variables de entorno POR DEFECTO (Producción)
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        DB_USER: 'sa',
        DB_PASSWORD: 'sql2025DEVadmin',
        DB_SERVER: '190.85.54.78',
        DB_NAME: 'TOP_TALENT',
        DB_PORT: 9788,
        DB_ENCRYPT: 'false',
        FRONTEND_URL: '',
      },

      // Variables de entorno para Desarrollo (--env development)
      env_development: {
        NODE_ENV: 'development',
        PORT: 3000,
        DB_USER: 'sa',
        DB_PASSWORD: 'ADMadm1234',
        DB_SERVER: '190.85.54.78',
        DB_NAME: 'TOP_TALENT',
        DB_PORT: 1433,
        DB_ENCRYPT: 'false',
        FRONTEND_URL: 'http://localhost:4200',
        watch: true // Activa watch en desarrollo para auto-recarga
      }
    }
  ]
};
