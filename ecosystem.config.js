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
        PORT: 3800,
        DB_USER: 'sa',
        DB_PASSWORD: 'sql2025DEVadmin',
        DB_SERVER: '190.85.54.78',
        DB_NAME: 'TOP_TALENT',
        DB_PORT: 9788,
        DB_ENCRYPT: 'false',
        FRONTEND_URL: '',
        N8N_WEBHOOK_URL: 'https://agentes.colchonessunmoon.com/webhook/ef34c04b-32a1-4358-b8d8-28a4d7948690',
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
        N8N_WEBHOOK_URL: 'https://agentes.colchonessunmoon.com/webhook/ef34c04b-32a1-4358-b8d8-28a4d7948690',
        watch: true // Activa watch en desarrollo para auto-recarga
      }
    }
  ]
};
