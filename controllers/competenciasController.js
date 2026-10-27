const { poolPromise, sql } = require('../config/db');
const { empresaDelUsuario } = require('../middleware/auth');
const {
  GRUPOS_CARGO,
  CATEGORIAS_COMPETENCIA,
  COMPETENCIAS_PRINCIPALES_ENTREVISTA,
  ES_GRUPO_VALIDO
} = require('../config/competencias');

// Tolerancia al validar que los pesos de cada grupo sumen 100 % (los pesos se guardan con 4 decimales)
const TOLERANCIA_SUMA = 0.0005;

function empresaMatriz(req) {
  return empresaDelUsuario(req) || req.user.empresa_id || '00';
}

async function listar(pool, empresaId, incluirInactivas) {
  const result = await pool.request()
    .input('ACCION', sql.VarChar(50), 'SELECT_ALL')
    .input('DATA_JSON', sql.NVarChar, JSON.stringify({ empresa_id: empresaId, incluir_inactivas: incluirInactivas ? 1 : 0 }))
    .execute('spCompetencias');
  const raw = result.recordset.map(r => r["DATOS"]).join('');
  const lista = raw ? JSON.parse(raw) : [];
  return lista.map(c => ({
    ...c,
    activo: c.activo === true || c.activo === 1,
    // grupos llega como arreglo; se expone como mapa { GRUPO: { nivel_requerido, peso } }
    grupos: Object.fromEntries((c.grupos || []).map(g => [g.grupo, { nivel_requerido: Number(g.nivel_requerido), peso: Number(g.peso) }]))
  }));
}

// GET matriz completa (cualquier usuario administrativo puede consultarla)
exports.obtener = async (req, res) => {
  try {
    const pool = await poolPromise;
    const competencias = await listar(pool, empresaMatriz(req), req.query.incluir_inactivas === '1');
    res.json({
      data: {
        competencias,
        grupos: GRUPOS_CARGO,
        categorias: CATEGORIAS_COMPETENCIA,
        principales_entrevista: COMPETENCIAS_PRINCIPALES_ENTREVISTA
      }
    });
  } catch (err) {
    console.error('Error al consultar la matriz de competencias:', err);
    res.status(500).json({ error: err.message });
  }
};

function validarMatriz(competencias) {
  if (!Array.isArray(competencias) || competencias.length === 0) {
    return 'La matriz debe tener al menos una competencia.';
  }
  const categorias = CATEGORIAS_COMPETENCIA.map(c => c.id);
  for (const c of competencias) {
    const nombre = String(c.nombre || '').trim();
    if (!nombre) return 'Todas las competencias deben tener nombre.';
    if (!categorias.includes(c.categoria)) return `Categoría no válida en "${nombre}".`;
    for (const g of GRUPOS_CARGO) {
      const v = c.grupos && c.grupos[g.id];
      const nivel = v ? Number(v.nivel_requerido) : NaN;
      const peso = v ? Number(v.peso) : NaN;
      if (!(nivel >= 1 && nivel <= 5)) return `"${nombre}": el nivel requerido para ${g.nombre} debe estar entre 1 y 5.`;
      if (!(peso >= 0 && peso <= 1)) return `"${nombre}": el peso para ${g.nombre} debe estar entre 0 % y 100 %.`;
    }
  }
  // Solo las competencias activas cuentan para la suma de pesos
  for (const g of GRUPOS_CARGO) {
    const suma = competencias
      .filter(c => c.activo !== false)
      .reduce((total, c) => total + Number(c.grupos[g.id].peso), 0);
    if (Math.abs(suma - 1) > TOLERANCIA_SUMA) {
      return `Los pesos de ${g.nombre} suman ${(suma * 100).toFixed(1)} %; deben sumar 100 %.`;
    }
  }
  return null;
}

// PUT guardar la matriz completa (Talento Humano / Superadmin). Se valida y guarda todo o nada.
exports.guardar = async (req, res) => {
  const competencias = req.body && req.body.competencias;
  const error = validarMatriz(competencias);
  if (error) {
    return res.status(400).json({ error });
  }

  const pool = await poolPromise;
  const empresaId = empresaMatriz(req);
  const tx = new sql.Transaction(pool);
  try {
    await tx.begin();
    for (let i = 0; i < competencias.length; i++) {
      const c = competencias[i];
      await new sql.Request(tx)
        .input('ACCION', sql.VarChar(50), 'GUARDAR')
        .input('DATA_JSON', sql.NVarChar, JSON.stringify({
          id: c.id || null,
          empresa_id: empresaId,
          categoria: c.categoria,
          nombre: String(c.nombre).trim(),
          definicion: c.definicion || '',
          conductas_observables: c.conductas_observables || '',
          justificacion_peso: c.justificacion_peso || '',
          riesgo_organizacional: c.riesgo_organizacional || '',
          pregunta_seleccion: c.pregunta_seleccion || '',
          criterio_evaluacion: c.criterio_evaluacion || '',
          orden: i + 1,
          activo: c.activo === false ? 0 : 1,
          grupos: GRUPOS_CARGO.map(g => ({
            grupo: g.id,
            nivel_requerido: Number(c.grupos[g.id].nivel_requerido),
            peso: Math.round(Number(c.grupos[g.id].peso) * 10000) / 10000
          }))
        }))
        .execute('spCompetencias');
    }
    await tx.commit();

    const actualizadas = await listar(pool, empresaId, true);
    res.json({ message: 'Matriz de competencias guardada.', data: { competencias: actualizadas } });
  } catch (err) {
    try { await tx.rollback(); } catch (e) {}
    console.error('Error al guardar la matriz de competencias:', err);
    res.status(500).json({ error: err.message });
  }
};

// GET competencias para la entrevista de un grupo de cargo, ordenadas por peso.
// Las de mayor peso son las principales (obligatorias); empate: mayor nivel requerido y luego orden de la matriz.
exports.paraEntrevista = async (req, res) => {
  try {
    const grupo = String(req.query.grupo || '').toUpperCase();
    if (!ES_GRUPO_VALIDO(grupo)) {
      return res.status(400).json({ error: 'Indique un grupo de cargo válido.' });
    }

    const pool = await poolPromise;
    const competencias = (await listar(pool, empresaMatriz(req), false))
      .filter(c => c.grupos[grupo])
      .map(c => ({
        id: c.id,
        categoria: c.categoria,
        nombre: c.nombre,
        definicion: c.definicion,
        conductas_observables: c.conductas_observables,
        pregunta_seleccion: c.pregunta_seleccion,
        criterio_evaluacion: c.criterio_evaluacion,
        orden: c.orden,
        nivel_requerido: c.grupos[grupo].nivel_requerido,
        peso: c.grupos[grupo].peso
      }))
      .sort((a, b) => b.peso - a.peso || b.nivel_requerido - a.nivel_requerido || a.orden - b.orden)
      .map((c, i) => ({ ...c, principal: i < COMPETENCIAS_PRINCIPALES_ENTREVISTA }));

    res.json({
      data: {
        grupo,
        grupo_nombre: GRUPOS_CARGO.find(g => g.id === grupo).nombre,
        principales: COMPETENCIAS_PRINCIPALES_ENTREVISTA,
        competencias
      }
    });
  } catch (err) {
    console.error('Error al consultar competencias de entrevista:', err);
    res.status(500).json({ error: err.message });
  }
};
