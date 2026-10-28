// Grupos de cargo y categorías de la matriz de competencias ARTDECON (Excel "ARTDECON Matriz Competencias").
// Cada perfil de cargo pertenece a un grupo; cada competencia define nivel requerido (1-5) y peso por grupo.
const GRUPOS_CARGO = [
  { id: 'DIRECTIVO', nombre: 'Directivo' },
  { id: 'COORDINADOR', nombre: 'Coordinador' },
  { id: 'ANALISTA', nombre: 'Analista' },
  { id: 'FACILITADOR', nombre: 'Facilitador' },
  { id: 'OPERARIO', nombre: 'Operario' }
];

const CATEGORIAS_COMPETENCIA = [
  { id: 'TRANSVERSAL', nombre: 'Transversal' },
  { id: 'ESPECIFICA', nombre: 'Específica' },
  { id: 'VALOR', nombre: 'Valor' }
];

// En la entrevista se preguntan las N competencias de mayor peso para el grupo del cargo; las demás son opcionales
const COMPETENCIAS_PRINCIPALES_ENTREVISTA = 5;

const ES_GRUPO_VALIDO = id => GRUPOS_CARGO.some(g => g.id === id);

module.exports = {
  GRUPOS_CARGO,
  CATEGORIAS_COMPETENCIA,
  COMPETENCIAS_PRINCIPALES_ENTREVISTA,
  ES_GRUPO_VALIDO
};
