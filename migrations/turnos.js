// Turnos estandarizados (nov. 2026): una sola lista para todas las pantallas, en el catálogo tipo TURNO.
// Antes cada pantalla tenía la suya y la vacante quedaba guardada con valores distintos según dónde se creara.
const TURNOS = [
  'Diurno (Lunes a Sábado)',
  'Rotativo (3 turnos)',
  'Nocturno',
  'Disponibilidad completa'
];

// Valores guardados antes con un equivalente claro en la lista nueva. Los demás (p. ej. "Diurno Ordinario",
// "Fines de Semana" o texto libre) se conservan: la pantalla los muestra como "valor anterior" hasta que los cambien.
const EQUIVALENCIAS = {
  'Diurno': 'Diurno (Lunes a Sábado)',
  'Rotativo 3 turnos': 'Rotativo (3 turnos)',
  'Rotativos': 'Rotativo (3 turnos)',
  'Turnos Rotativos (6-2, 2-10, 10-6)': 'Rotativo (3 turnos)',
  'Disponibilidad Total': 'Disponibilidad completa'
};

// Pasa al nombre estándar el turno de las vacantes ya creadas (vacantes.perfil_oculto_json.turnos).
// Idempotente: una segunda ejecución no encuentra nada que cambiar.
async function migrateTurnosVacantes(pool, sql) {
  let total = 0;
  for (const [anterior, nuevo] of Object.entries(EQUIVALENCIAS)) {
    const result = await pool.request()
      .input('anterior', sql.NVarChar(200), anterior)
      .input('nuevo', sql.NVarChar(200), nuevo)
      .query(`
        UPDATE vacantes
        SET perfil_oculto_json = JSON_MODIFY(perfil_oculto_json, '$.turnos', @nuevo)
        WHERE ISJSON(perfil_oculto_json) = 1
          AND JSON_VALUE(perfil_oculto_json, '$.turnos') = @anterior
      `);
    total += result.rowsAffected[0] || 0;
  }
  console.log(`Turnos de vacantes estandarizados: ${total} vacante(s) actualizada(s).`);
}

module.exports = { TURNOS, migrateTurnosVacantes };
