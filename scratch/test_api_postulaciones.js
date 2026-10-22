const http = require('http');

http.get('http://localhost:3000/api/postulaciones', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      const items = Array.isArray(json) ? json : (json.data || json.postulaciones || []);
      console.log(`API /api/postulaciones retornó ${items.length} postulaciones.`);
      items.forEach((p, i) => {
        console.log(` ${i+1}. [${p.estado_postulante || 'N/A'}] ${p.nombre_completo || p.correo} - Vacante: ${p.vacante_titulo} (Score IA: ${p.puntuacion_ia || 'N/A'})`);
      });
    } catch (e) {
      console.error('Error parseando json:', e.message);
    }
  });
}).on('error', err => console.error(err.message));
