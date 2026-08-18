module.exports = {
  apps: [
    {
      name: 'topTalent-backend',
      script: 'index.js',
      // En producción no se suele activar watch por defecto, pero se puede configurar
      watch: false,

      // Variables de entorno POR DEFECTO (Producción)
      env: {
        NODE_ENV: 'development',
        PORT: 3800,
        DB_USER: 'sa',
        DB_PASSWORD: 'ADMadm1234',
        DB_SERVER: '190.85.54.78',
        DB_NAME: 'TOP_TALENT',
        DB_PORT: 1433,
        DB_ENCRYPT: 'false',
        FRONTEND_URL: '',
        N8N_WEBHOOK_POSTULACIONES_URL: 'https://agentes.colchonessunmoon.com/webhook/ef34c04b-32a1-4358-b8d8-28a4d7948690',
        N8N_WEBHOOK_PERFILES_URL: 'https://agentes.colchonessunmoon.com/webhook/206de3fe-864d-43ba-994c-d0d7b2544ac9',
        N8N_WEBHOOK_PREGUNTAS_URL: 'https://agentes.colchonessunmoon.com/webhook/6a27d132-6591-43e8-b3dc-18e3c0ef9379',
        SMTP_HOST: 'smtp.gmail.com',
        SMTP_PORT: 465,
        SMTP_USER: 'soporte@artdecon.com',
        SMTP_PASS: 'xfmwryzvhyqnocvm',
      },

      // Variables de entorno para Desarrollo (--env development)
      env_development: {
        NODE_ENV: 'development',
        PORT: 3800,
        DB_USER: 'sa',
        DB_PASSWORD: 'ADMadm1234',
        DB_SERVER: '190.85.54.78',
        DB_NAME: 'TOP_TALENT',
        DB_PORT: 1433,
        DB_ENCRYPT: 'false',
        FRONTEND_URL: 'http://localhost:4200',
        N8N_WEBHOOK_POSTULACIONES_URL: 'https://agentes.colchonessunmoon.com/webhook/ef34c04b-32a1-4358-b8d8-28a4d7948690',
        N8N_WEBHOOK_PERFILES_URL: 'https://agentes.colchonessunmoon.com/webhook/206de3fe-864d-43ba-994c-d0d7b2544ac9',
        N8N_WEBHOOK_PREGUNTAS_URL: 'https://agentes.colchonessunmoon.com/webhook/6a27d132-6591-43e8-b3dc-18e3c0ef9379',
        SMTP_HOST: 'smtp.gmail.com',
        SMTP_PORT: 465,
        SMTP_USER: 'soporte@artdecon.com',
        SMTP_PASS: 'xfmwryzvhyqnocvm',
        watch: true // Activa watch en desarrollo para auto-recarga
      }
    }
  ]
};
