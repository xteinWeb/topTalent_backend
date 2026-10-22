const http = require('http');

http.get('http://localhost:3000/api/vacantes', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const json = JSON.parse(data);
    console.log('Keys en respuesta:', Object.keys(json));
    const items = Array.isArray(json) ? json : (json.data || json.vacantes || []);
    console.log(`Total vacantes recibidas: ${items.length}`);
    items.forEach(v => console.log(` - [${v.estado}] ${v.titulo} (Perfil: ${v.cargo || v.perfil_id})`));
  });
});
