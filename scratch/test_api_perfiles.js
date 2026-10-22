const http = require('http');

http.get('http://localhost:3000/api/perfiles', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const json = JSON.parse(data);
    const items = Array.isArray(json) ? json : (json.data || json.perfiles || []);
    console.log(`Total perfiles recibidos: ${items.length}`);
    items.forEach(p => console.log(` - ${p.cargo} | Área: ${p.area}`));
  });
});
