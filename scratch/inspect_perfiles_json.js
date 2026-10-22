const http = require('http');

http.get('http://localhost:3000/api/perfiles', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      const items = Array.isArray(json) ? json : (json.data || json.perfiles || []);
      console.log(`Total perfiles recibidos: ${items.length}`);
      items.slice(0, 4).forEach((p, i) => {
        console.log(`\n--- Perfil ${i+1}: ${p.cargo} (${p.area}) ---`);
        console.log('Tipo de perfil_json:', typeof p.perfil_json);
        console.log('Valor de perfil_json:', typeof p.perfil_json === 'object' ? Object.keys(p.perfil_json || {}) : p.perfil_json?.slice(0, 200));
        if (typeof p.perfil_json === 'object' && p.perfil_json) {
          console.log('proposito:', p.perfil_json.proposito || p.perfil_json.objetivo || p.perfil_json.descripcion);
        }
      });
    } catch (e) {
      console.error(e.message);
    }
  });
}).on('error', console.error);
