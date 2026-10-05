// Generación de calendario "justo" mediante el método del círculo
// (round-robin): cada equipo juega contra todos los demás la misma
// cantidad de veces, repartido en jornadas (rounds) donde cada equipo
// juega a lo sumo una vez por jornada. Se alterna local/visitante para
// equilibrar la condición de local.

/**
 * Round-robin de una sola vuelta para una lista de equipos.
 * Devuelve un array de jornadas; cada jornada es un array de parejas
 * { home, away } (ids de equipo). Si el número de equipos es impar se
 * introduce un "bye" (equipo nulo) que se descarta.
 *
 * @param {number[]} teamIds
 * @returns {{home:number, away:number}[][]} jornadas
 */
function singleRoundRobin(teamIds) {
  const teams = [...teamIds];
  const bye = teams.length % 2 !== 0;
  if (bye) teams.push(null); // marcador de descanso

  const n = teams.length;
  const rounds = n - 1;
  const half = n / 2;
  const schedule = [];

  // El primer equipo queda fijo; el resto rota.
  const rotation = [...teams];

  for (let r = 0; r < rounds; r++) {
    const round = [];
    for (let i = 0; i < half; i++) {
      const t1 = rotation[i];
      const t2 = rotation[n - 1 - i];
      if (t1 === null || t2 === null) continue; // bye
      // Alterna local/visitante según jornada para repartir localías.
      if (r % 2 === 0) round.push({ home: t1, away: t2 });
      else round.push({ home: t2, away: t1 });
    }
    schedule.push(round);

    // Rotación: se fija el primero y se rota el resto en sentido horario.
    const fixed = rotation[0];
    const rest = rotation.slice(1);
    rest.unshift(rest.pop());
    rotation.splice(0, rotation.length, fixed, ...rest);
  }

  return schedule;
}

function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Devuelve `count` fechas (yyyy-mm-dd) que caen únicamente en viernes, sábado
 * o domingo, empezando en o después de `startDate`. Se usa para repartir las
 * jornadas en fines de semana (3 jornadas por fin de semana: Vie, Sáb, Dom).
 *
 * @param {string} startDate  fecha ISO 'yyyy-mm-dd'
 * @param {number} count
 */
export function weekendDates(startDate, count) {
  const dates = [];
  const d = new Date(`${startDate}T00:00:00`);
  let guard = 0;
  while (dates.length < count && guard < 4000) {
    const day = d.getDay(); // 0=Dom, 5=Vie, 6=Sáb
    if (day === 5 || day === 6 || day === 0) dates.push(toISO(d));
    d.setDate(d.getDate() + 1);
    guard++;
  }
  return dates;
}

/**
 * Fechas separadas por un número fijo de días (una por jornada).
 */
export function spacedDates(startDate, count, daysBetween = 7) {
  const dates = [];
  const base = new Date(`${startDate}T00:00:00`);
  for (let i = 0; i < count; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() + i * daysBetween);
    dates.push(toISO(d));
  }
  return dates;
}

/**
 * Genera el calendario completo para un conjunto de equipos (de un grupo
 * o de toda la liga), con la cantidad de vueltas indicada.
 *
 * En vueltas pares se invierte la localía respecto de la vuelta anterior,
 * de modo que todos jueguen de local y visitante de forma balanceada.
 *
 * @param {number[]} teamIds
 * @param {number} rounds  vueltas (1 = cada pareja una vez)
 * @returns {{home:number, away:number, round:number}[]} partidos planos
 */
export function generateRoundRobin(teamIds, rounds = 1) {
  if (teamIds.length < 2) return [];
  const base = singleRoundRobin(teamIds);
  const games = [];
  let roundNumber = 0;

  for (let v = 0; v < rounds; v++) {
    for (const jornada of base) {
      roundNumber += 1;
      for (const pair of jornada) {
        // En vueltas impares (v par: 0,2,...) se respeta la localía base;
        // en las siguientes se invierte.
        const swap = v % 2 === 1;
        games.push({
          home: swap ? pair.away : pair.home,
          away: swap ? pair.home : pair.away,
          round: roundNumber,
        });
      }
    }
  }

  return games;
}
