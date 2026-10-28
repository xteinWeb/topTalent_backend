// Preguntas del prefiltro de candidatos. Son las mismas por teléfono (las registra Talento Humano)
// y por WhatsApp (las responde el candidato en el formulario del enlace).
// tipo: si_no | opcion | numero | texto | texto_largo
const PREGUNTAS_PREFILTRO = [
  { id: 'sigue_interesado', texto: '¿Sigues interesado(a) en la vacante?', tipo: 'si_no', obligatoria: true },
  { id: 'disponibilidad_horario', texto: '¿Tienes disponibilidad para el horario del cargo (incluidos turnos, si aplican)?', tipo: 'si_no', obligatoria: true },
  { id: 'disponibilidad_ingreso', texto: '¿Cuándo podrías empezar a trabajar?', tipo: 'opcion', opciones: ['Inmediata', 'En 15 días', 'En 1 mes', 'Más de 1 mes'], obligatoria: true },
  { id: 'aspiracion_salarial', texto: '¿Cuál es tu aspiración salarial mensual (en pesos)?', tipo: 'numero', obligatoria: true },
  { id: 'ciudad_barrio', texto: '¿En qué ciudad y barrio vives?', tipo: 'texto', obligatoria: true, max: 150 },
  { id: 'puede_desplazarse', texto: '¿Puedes desplazarte hasta nuestras instalaciones?', tipo: 'si_no', obligatoria: true },
  { id: 'comentario', texto: '¿Hay algo más que quieras contarnos?', tipo: 'texto_largo', obligatoria: false, max: 1000 }
];

// Si el candidato ya no está interesado, el resto de preguntas deja de ser obligatorio
const PREGUNTA_INTERES = 'sigue_interesado';

const RESULTADOS_PREFILTRO = ['Pasa', 'No pasa'];

// Horas de vigencia del enlace enviado por WhatsApp (debe coincidir con GENERAR_TOKEN_PREFILTRO en spPostulaciones)
const VIGENCIA_ENLACE_HORAS = 72;

// Devuelve { respuestas } normalizadas o { error } con el primer problema encontrado
function validarRespuestasPrefiltro(entrada) {
  const datos = entrada && typeof entrada === 'object' ? entrada : {};
  const respuestas = {};
  const sinInteres = String(datos[PREGUNTA_INTERES] || '').trim() === 'No';

  for (const p of PREGUNTAS_PREFILTRO) {
    let valor = datos[p.id];
    valor = valor === undefined || valor === null ? '' : String(valor).trim();
    const obligatoria = p.obligatoria && !(sinInteres && p.id !== PREGUNTA_INTERES);

    if (!valor) {
      if (obligatoria) return { error: `Responde la pregunta: "${p.texto}"` };
      continue;
    }

    if (p.tipo === 'si_no' && !['Si', 'No'].includes(valor)) {
      return { error: `Respuesta no válida para: "${p.texto}"` };
    }
    if (p.tipo === 'opcion' && !p.opciones.includes(valor)) {
      return { error: `Respuesta no válida para: "${p.texto}"` };
    }
    if (p.tipo === 'numero') {
      const numero = Number(valor.replace(/[.\s$]/g, '').replace(',', '.'));
      if (!Number.isFinite(numero) || numero < 0 || numero > 1000000000) {
        return { error: `Ingresa un valor numérico válido para: "${p.texto}"` };
      }
      valor = Math.round(numero);
    }
    if (p.max && typeof valor === 'string' && valor.length > p.max) {
      return { error: `La respuesta a "${p.texto}" supera ${p.max} caracteres.` };
    }
    respuestas[p.id] = valor;
  }

  return { respuestas };
}

module.exports = {
  PREGUNTAS_PREFILTRO,
  RESULTADOS_PREFILTRO,
  VIGENCIA_ENLACE_HORAS,
  validarRespuestasPrefiltro
};
