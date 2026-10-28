const ExcelJS = require('exceljs');
const { poolPromise, sql } = require('../config/db');
const { empresaDelUsuario } = require('../middleware/auth');
const { setAttachmentHeader } = require('../utils/http');

// Estado que marca el inicio de cada etapa del embudo (mismo criterio que el dashboard).
// Un candidato cuenta en una etapa si su estado actual es ese o uno posterior del flujo;
// los que salieron del flujo (estados con motivo: Descartado, Reserva, No aprobó Pruebas) no avanzan.
const ETAPAS = [
  { id: 'prefiltro', nombre: 'Prefiltro aprobado', desde: 'Prefiltro Aprobado' },
  { id: 'entrevista', nombre: 'En entrevista TH', desde: 'Entrevista TH Agendada' },
  { id: 'gerencia', nombre: 'Aprobados por gerencia', desde: 'Aprobado por gerencia' },
  { id: 'contratados', nombre: 'Contratados', desde: 'Contratado' }
];
const AGRUPACIONES = { area: 'Área', lider: 'Líder' };
const DIA_MS = 24 * 60 * 60 * 1000;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function leerParametros(req) {
  const hoy = new Date();
  const hace90 = new Date(hoy.getTime() - 90 * DIA_MS);
  const iso = d => d.toISOString().slice(0, 10);
  const desde = FECHA.test(req.query.desde || '') ? req.query.desde : iso(hace90);
  const hasta = FECHA.test(req.query.hasta || '') ? req.query.hasta : iso(hoy);
  const agrupar = AGRUPACIONES[req.query.agrupar] ? req.query.agrupar : 'area';
  return { desde, hasta, agrupar };
}

function parsear(valor) {
  if (!valor) return [];
  return typeof valor === 'string' ? JSON.parse(valor) : valor;
}

function dias(inicio, fin) {
  if (!inicio || !fin) return null;
  const d = (new Date(fin) - new Date(inicio)) / DIA_MS;
  return d >= 0 ? d : null;
}

function promedio(valores) {
  const v = valores.filter(x => x !== null && x !== undefined);
  return { promedio_dias: v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null, mediciones: v.length };
}

const pct = (n, total) => (total > 0 ? Math.round((n / total) * 1000) / 10 : 0);

async function cargarDatos(req, params) {
  const pool = await poolPromise;
  const [datos, estados] = await Promise.all([
    pool.request()
      .input('ACCION', sql.VarChar(50), 'INDICADORES')
      .input('DATA_JSON', sql.NVarChar, JSON.stringify({ empresa_id: empresaDelUsuario(req), desde: params.desde, hasta: params.hasta }))
      .execute('spReportes'),
    pool.request()
      .input('ACCION', sql.VarChar(50), 'SELECT_ALL')
      .input('DATA_JSON', sql.NVarChar, null)
      .execute('spEstadosPostulacion')
  ]);
  const fila = datos.recordset[0] || {};
  const raw = estados.recordset[0] && estados.recordset[0]["DATOS"];
  return {
    postulaciones: parsear(fila.postulaciones),
    vacantes: parsear(fila.vacantes),
    estados: raw ? JSON.parse(raw) : []
  };
}

function calcular({ postulaciones, vacantes, estados }, params) {
  const porNombre = new Map(estados.map(e => [e.nombre, e]));
  const ordenEtapa = Object.fromEntries(ETAPAS.map(e => [e.id, porNombre.get(e.desde)?.orden]));
  const esSalida = p => !!porNombre.get(p.estado)?.requiere_motivo;
  const alcanzo = (p, etapa) => {
    const e = porNombre.get(p.estado);
    return !!e && e.activo !== false && !e.requiere_motivo && ordenEtapa[etapa] !== undefined && e.orden >= ordenEtapa[etapa];
  };
  const claveGrupo = x => (params.agrupar === 'lider' ? x.lider_nombre : x.area) || 'Sin asignar';

  const resumirPostulaciones = lista => {
    const embudo = [{ id: 'postulados', nombre: 'Postulados', n: lista.length, pct: lista.length ? 100 : 0 }]
      .concat(ETAPAS.map(e => {
        const n = lista.filter(p => alcanzo(p, e.id)).length;
        return { id: e.id, nombre: e.nombre, n, pct: pct(n, lista.length) };
      }));
    const contratados = embudo.find(e => e.id === 'contratados').n;
    const salidas = lista.filter(esSalida).length;
    return {
      postulaciones: lista.length,
      contratados,
      salidas,
      en_proceso: lista.length - contratados - salidas,
      tasa_contratacion: pct(contratados, lista.length),
      embudo
    };
  };

  const tiempos = (posts, vacs) => ({
    solicitud_a_autorizacion: promedio(vacs.map(v => dias(v.fecha_solicitud, v.fecha_autorizacion))),
    autorizacion_a_publicacion: promedio(vacs.map(v => dias(v.fecha_autorizacion, v.fecha_activacion))),
    postulacion_a_contratacion: promedio(posts.map(p => dias(p.fecha_postulacion, p.fecha_contratado)))
  });

  const contarMotivos = lista => {
    const conteo = new Map();
    lista.filter(p => esSalida(p) && p.motivo_no_aprobado).forEach(p => {
      conteo.set(p.motivo_no_aprobado, (conteo.get(p.motivo_no_aprobado) || 0) + 1);
    });
    const total = [...conteo.values()].reduce((a, b) => a + b, 0);
    return [...conteo.entries()]
      .map(([motivo, n]) => ({ motivo, n, pct: pct(n, total) }))
      .sort((a, b) => b.n - a.n || a.motivo.localeCompare(b.motivo, 'es'));
  };

  // Por grupo (área o líder)
  const nombresGrupo = [...new Set([...postulaciones.map(claveGrupo), ...vacantes.map(claveGrupo)])]
    .sort((a, b) => a.localeCompare(b, 'es'));
  const grupos = nombresGrupo.map(nombre => {
    const posts = postulaciones.filter(p => claveGrupo(p) === nombre);
    const vacs = vacantes.filter(v => claveGrupo(v) === nombre);
    return { grupo: nombre, vacantes: vacs.length, ...resumirPostulaciones(posts), tiempos: tiempos(posts, vacs), motivos: contarMotivos(posts) };
  }).sort((a, b) => b.postulaciones - a.postulaciones || a.grupo.localeCompare(b.grupo, 'es'));

  // Por vacante: las del período y las que recibieron postulaciones en el período
  const idsVacantes = new Set([...vacantes.map(v => v.id), ...postulaciones.map(p => p.vacante_id)]);
  const porVacante = [...idsVacantes].map(id => {
    const v = vacantes.find(x => x.id === id);
    const posts = postulaciones.filter(p => p.vacante_id === id);
    const base = v || posts[0];
    return {
      vacante: v ? v.titulo : base.vacante_titulo,
      area: base.area,
      lider: base.lider_nombre,
      estado_vacante: v ? v.estado : '',
      ...resumirPostulaciones(posts),
      dias_solicitud_a_autorizacion: v ? dias(v.fecha_solicitud, v.fecha_autorizacion) : null
    };
  }).sort((a, b) => b.postulaciones - a.postulaciones || a.vacante.localeCompare(b.vacante, 'es'));

  return {
    periodo: { desde: params.desde, hasta: params.hasta },
    agrupar: params.agrupar,
    agrupar_nombre: AGRUPACIONES[params.agrupar],
    resumen: { vacantes: vacantes.length, ...resumirPostulaciones(postulaciones) },
    tiempos: tiempos(postulaciones, vacantes),
    grupos,
    vacantes: porVacante,
    motivos: contarMotivos(postulaciones)
  };
}

// GET /api/reportes/indicadores?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&agrupar=area|lider
exports.indicadores = async (req, res) => {
  try {
    const params = leerParametros(req);
    res.json({ data: calcular(await cargarDatos(req, params), params) });
  } catch (err) {
    console.error('Error al calcular el reporte de indicadores:', err);
    res.status(500).json({ error: err.message });
  }
};

// GET /api/reportes/indicadores/excel (mismos parámetros)
exports.indicadoresExcel = async (req, res) => {
  try {
    const params = leerParametros(req);
    const r = calcular(await cargarDatos(req, params), params);
    const libro = new ExcelJS.Workbook();
    libro.creator = 'Portal de Empleo Artdecon';
    libro.created = new Date();

    const encabezado = hoja => {
      hoja.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      hoja.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF16313A' } };
      hoja.views = [{ state: 'frozen', ySplit: 1 }];
    };
    const etapasCols = ETAPAS.map(e => ({ header: e.nombre, key: e.id, width: 18 }));
    const filaEmbudo = x => Object.fromEntries(x.embudo.map(e => [e.id, e.n]));
    const t = v => (v.promedio_dias === null ? 'Sin datos' : v.promedio_dias);

    // Resumen
    const resumen = libro.addWorksheet('Resumen');
    resumen.columns = [{ header: 'Indicador', key: 'k', width: 42 }, { header: 'Valor', key: 'v', width: 18 }, { header: 'Detalle', key: 'd', width: 40 }];
    resumen.addRows([
      { k: 'Período', v: `${r.periodo.desde} a ${r.periodo.hasta}` },
      { k: 'Vacantes solicitadas o creadas', v: r.resumen.vacantes },
      { k: 'Postulaciones', v: r.resumen.postulaciones },
      ...r.resumen.embudo.slice(1).map(e => ({ k: e.nombre, v: e.n, d: `${e.pct} % de las postulaciones` })),
      { k: 'En proceso', v: r.resumen.en_proceso },
      { k: 'Fuera del flujo (descartados, reserva, no aprobó pruebas)', v: r.resumen.salidas },
      { k: 'Tasa de contratación (%)', v: r.resumen.tasa_contratacion },
      { k: 'Días promedio: solicitud → autorización de Gerencia', v: t(r.tiempos.solicitud_a_autorizacion), d: `${r.tiempos.solicitud_a_autorizacion.mediciones} vacante(s)` },
      { k: 'Días promedio: autorización → publicación', v: t(r.tiempos.autorizacion_a_publicacion), d: `${r.tiempos.autorizacion_a_publicacion.mediciones} vacante(s)` },
      { k: 'Días promedio: postulación → contratación', v: t(r.tiempos.postulacion_a_contratacion), d: `${r.tiempos.postulacion_a_contratacion.mediciones} contratación(es)` }
    ]);
    encabezado(resumen);

    // Por grupo
    const porGrupo = libro.addWorksheet(`Por ${r.agrupar_nombre.toLowerCase()}`);
    porGrupo.columns = [
      { header: r.agrupar_nombre, key: 'grupo', width: 30 },
      { header: 'Vacantes', key: 'vacantes', width: 12 },
      { header: 'Postulaciones', key: 'postulaciones', width: 14 },
      ...etapasCols,
      { header: 'En proceso', key: 'en_proceso', width: 12 },
      { header: 'Fuera del flujo', key: 'salidas', width: 15 },
      { header: 'Tasa de contratación (%)', key: 'tasa', width: 22 },
      { header: 'Días solicitud → autorización', key: 't1', width: 26 },
      { header: 'Días postulación → contratación', key: 't2', width: 28 },
      { header: 'Motivo más frecuente', key: 'motivo', width: 36 }
    ];
    r.grupos.forEach(g => porGrupo.addRow({
      grupo: g.grupo, vacantes: g.vacantes, postulaciones: g.postulaciones, ...filaEmbudo(g),
      en_proceso: g.en_proceso, salidas: g.salidas, tasa: g.tasa_contratacion,
      t1: t(g.tiempos.solicitud_a_autorizacion), t2: t(g.tiempos.postulacion_a_contratacion),
      motivo: g.motivos[0] ? `${g.motivos[0].motivo} (${g.motivos[0].n})` : ''
    }));
    encabezado(porGrupo);

    // Por vacante
    const porVacante = libro.addWorksheet('Por vacante');
    porVacante.columns = [
      { header: 'Vacante', key: 'vacante', width: 34 },
      { header: 'Área', key: 'area', width: 22 },
      { header: 'Líder', key: 'lider', width: 26 },
      { header: 'Estado vacante', key: 'estado_vacante', width: 15 },
      { header: 'Postulaciones', key: 'postulaciones', width: 14 },
      ...etapasCols,
      { header: 'En proceso', key: 'en_proceso', width: 12 },
      { header: 'Fuera del flujo', key: 'salidas', width: 15 },
      { header: 'Días solicitud → autorización', key: 'dias', width: 26 }
    ];
    r.vacantes.forEach(v => porVacante.addRow({
      vacante: v.vacante, area: v.area, lider: v.lider, estado_vacante: v.estado_vacante, postulaciones: v.postulaciones,
      ...filaEmbudo(v), en_proceso: v.en_proceso, salidas: v.salidas,
      dias: v.dias_solicitud_a_autorizacion === null ? '' : Math.round(v.dias_solicitud_a_autorizacion * 10) / 10
    }));
    encabezado(porVacante);

    // Motivos (total y por grupo)
    const motivos = libro.addWorksheet('Motivos');
    motivos.columns = [
      { header: r.agrupar_nombre, key: 'grupo', width: 30 },
      { header: 'Motivo', key: 'motivo', width: 44 },
      { header: 'Candidatos', key: 'n', width: 12 },
      { header: '%', key: 'pct', width: 8 }
    ];
    r.motivos.forEach(m => motivos.addRow({ grupo: 'Total', ...m }));
    r.grupos.forEach(g => g.motivos.forEach(m => motivos.addRow({ grupo: g.grupo, ...m })));
    encabezado(motivos);

    setAttachmentHeader(res, `Indicadores_seleccion_${params.desde}_a_${params.hasta}.xlsx`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    await libro.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Error al exportar el reporte de indicadores:', err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
};
