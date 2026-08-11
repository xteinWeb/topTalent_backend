// One-off maintenance script: cleans literal "undefined" text left in
// candidatos.perfil_completo_json (estudios/experiencias) from the template-literal bug
// in postulacion-form.component.ts. Run with: node scratch/clean_undefined_data.js
const { sql, poolPromise } = require('../config/db');

function isUndefinedish(str) {
  if (typeof str !== 'string') return false;
  const trimmed = str.trim().toLowerCase();
  if (!trimmed) return false;
  return trimmed.split(/\s+/).every(w => w === 'undefined' || w === 'de');
}

function cleanString(str) {
  if (typeof str !== 'string') return str;
  if (isUndefinedish(str)) return '';
  // Remove standalone "undefined" word occurrences inside longer strings (e.g. "Funciones: undefined")
  return str.replace(/\bundefined\b/gi, '').replace(/\s{2,}/g, ' ').trim();
}

function cleanArray(arr, fields) {
  let changed = false;
  if (!Array.isArray(arr)) return { arr, changed };
  const newArr = arr.map(item => {
    if (!item || typeof item !== 'object') return item;
    const newItem = { ...item };
    fields.forEach(f => {
      if (typeof newItem[f] === 'string') {
        const cleaned = cleanString(newItem[f]);
        if (cleaned !== newItem[f]) {
          changed = true;
          newItem[f] = cleaned;
        }
      }
    });
    return newItem;
  });
  return { arr: newArr, changed };
}

async function run() {
  const pool = await poolPromise;
  const result = await pool.request().query(`
    SELECT id, perfil_completo_json FROM candidatos WHERE perfil_completo_json IS NOT NULL
  `);

  console.log(`Revisando ${result.recordset.length} candidatos...`);

  let totalAfectados = 0;

  for (const row of result.recordset) {
    let perfil;
    try {
      perfil = typeof row.perfil_completo_json === 'string'
        ? JSON.parse(row.perfil_completo_json)
        : row.perfil_completo_json;
    } catch (e) {
      console.warn(`No se pudo parsear perfil_completo_json de candidato ${row.id}, se omite.`);
      continue;
    }
    if (!perfil) continue;

    let changed = false;

    const expResult = cleanArray(perfil.experiencias || [], ['fecha_inicio', 'fecha_fin', 'descripcion']);
    if (expResult.changed) {
      perfil.experiencias = expResult.arr;
      changed = true;
    }

    const estResult = cleanArray(perfil.estudios || [], ['fecha_inicio', 'fecha_fin', 'observaciones']);
    if (estResult.changed) {
      perfil.estudios = estResult.arr;
      changed = true;
    }

    if (changed) {
      totalAfectados++;
      console.log(`Corrigiendo candidato ${row.id}...`);
      await pool.request()
        .input('ACCION', sql.VarChar(50), 'UPDATE_PERFIL')
        .input('DATA_JSON', sql.NVarChar, JSON.stringify({
          id: row.id,
          perfil_completo_json: JSON.stringify(perfil)
        }))
        .execute('spCandidatos');
    }
  }

  console.log(`Listo. Candidatos corregidos: ${totalAfectados} de ${result.recordset.length}.`);
  process.exit(0);
}

run().catch(err => {
  console.error('Error ejecutando limpieza:', err);
  process.exit(1);
});
