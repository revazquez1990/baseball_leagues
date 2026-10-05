import { pool } from '../db.js';

/**
 * Calcula la tabla de posiciones de una liga a partir de los juegos
 * finalizados de temporada regular.
 *
 * Reglas de desempate (estilo MLB, adaptadas a ligas de barrio):
 *   1. Mayor porcentaje de victorias (PCT = G / (G + P)).
 *   2. Enfrentamiento directo (head-to-head) entre los empatados.
 *   3. Mejor diferencial de carreras (RS - RA) en toda la temporada.
 *   4. Más carreras anotadas (RS).
 *   5. Orden alfabético (último recurso, estable).
 *
 * Devuelve un objeto con una clave por grupo:
 *   { [groupId|'all']: { groupName, rows: [...] } }
 */
export async function computeStandings(leagueId) {
  const [[league]] = await pool.query(
    'SELECT * FROM leagues WHERE id = :id',
    { id: leagueId }
  );
  if (!league) return { league: null, groups: [] };

  const [teams] = await pool.query(
    `SELECT t.id, t.name, t.color, t.group_id, g.name AS group_name
       FROM teams t
       LEFT JOIN league_groups g ON g.id = t.group_id
      WHERE t.league_id = :id
      ORDER BY t.name`,
    { id: leagueId }
  );

  const [games] = await pool.query(
    `SELECT id, group_id, home_team_id, away_team_id, home_score, away_score
       FROM games
      WHERE league_id = :id AND status = 'final' AND stage = 'regular'`,
    { id: leagueId }
  );

  // Inicializa estadísticas por equipo.
  const stats = new Map();
  for (const t of teams) {
    stats.set(t.id, {
      teamId: t.id,
      name: t.name,
      color: t.color,
      groupId: t.group_id,
      groupName: t.group_name,
      g: 0, w: 0, l: 0, rs: 0, ra: 0,
      streakType: null, streakLen: 0,
      results: [], // historial cronológico 'W'/'L' para racha y últimos 10
    });
    // h2h: victorias de este equipo frente a cada rival
    stats.get(t.id).h2h = new Map();
  }

  const h2hWins = new Map(); // `${a}-${b}` -> victorias de a sobre b

  for (const game of games) {
    if (game.home_score == null || game.away_score == null) continue;
    const home = stats.get(game.home_team_id);
    const away = stats.get(game.away_team_id);
    if (!home || !away) continue;

    home.g++; away.g++;
    home.rs += game.home_score; home.ra += game.away_score;
    away.rs += game.away_score; away.ra += game.home_score;

    const homeWon = game.home_score > game.away_score;
    const winnerId = homeWon ? home.teamId : away.teamId;
    const loserId = homeWon ? away.teamId : home.teamId;

    (homeWon ? home : away).w++;
    (homeWon ? away : home).l++;
    home.results.push(homeWon ? 'W' : 'L');
    away.results.push(homeWon ? 'L' : 'W');

    const key = `${winnerId}-${loserId}`;
    h2hWins.set(key, (h2hWins.get(key) || 0) + 1);
  }

  // Racha actual y últimos 10.
  for (const s of stats.values()) {
    const last10 = s.results.slice(-10);
    s.last10 = {
      w: last10.filter((r) => r === 'W').length,
      l: last10.filter((r) => r === 'L').length,
    };
    // Racha: recorre desde el final.
    let len = 0, type = null;
    for (let i = s.results.length - 1; i >= 0; i--) {
      if (type === null) { type = s.results[i]; len = 1; }
      else if (s.results[i] === type) len++;
      else break;
    }
    s.streak = type ? `${type}${len}` : '-';
    s.pct = s.g > 0 ? s.w / s.g : 0;
    s.diff = s.rs - s.ra;
  }

  // head-to-head helper entre un conjunto de equipos empatados.
  function h2hRecord(teamId, others) {
    let w = 0, total = 0;
    for (const other of others) {
      if (other === teamId) continue;
      const won = h2hWins.get(`${teamId}-${other}`) || 0;
      const lost = h2hWins.get(`${other}-${teamId}`) || 0;
      w += won;
      total += won + lost;
    }
    return total > 0 ? w / total : 0;
  }

  // Agrupa por grupo (o un único grupo 'all' si la liga es tabla única).
  const useGroups = league.format === 'groups';
  const groupsMap = new Map();
  for (const s of stats.values()) {
    const gid = useGroups ? (s.groupId ?? 0) : 0;
    const gname = useGroups ? (s.groupName ?? 'Sin grupo') : 'General';
    if (!groupsMap.has(gid)) groupsMap.set(gid, { groupId: gid, groupName: gname, rows: [] });
    groupsMap.get(gid).rows.push(s);
  }

  const result = [];
  for (const group of groupsMap.values()) {
    const rows = group.rows;

    rows.sort((a, b) => {
      if (b.pct !== a.pct) return b.pct - a.pct;
      // Empate: enfrentamiento directo dentro del grupo de empatados.
      const tied = rows
        .filter((r) => r.pct === a.pct)
        .map((r) => r.teamId);
      const h2hA = h2hRecord(a.teamId, tied);
      const h2hB = h2hRecord(b.teamId, tied);
      if (h2hB !== h2hA) return h2hB - h2hA;
      if (b.diff !== a.diff) return b.diff - a.diff;
      if (b.rs !== a.rs) return b.rs - a.rs;
      return a.name.localeCompare(b.name);
    });

    // Juegos detrás del líder (GB).
    const leader = rows[0];
    rows.forEach((r, i) => {
      r.rank = i + 1;
      r.gb = leader
        ? ((leader.w - r.w) + (r.l - leader.l)) / 2
        : 0;
    });

    // Limpia campos internos antes de enviar.
    group.rows = rows.map((r) => ({
      rank: r.rank,
      teamId: r.teamId,
      name: r.name,
      color: r.color,
      g: r.g, w: r.w, l: r.l,
      pct: Number(r.pct.toFixed(3)),
      gb: r.gb === 0 ? '-' : r.gb.toFixed(1),
      rs: r.rs, ra: r.ra, diff: r.diff,
      streak: r.streak,
      last10: `${r.last10.w}-${r.last10.l}`,
    }));
    result.push(group);
  }

  // Orden de grupos por nombre.
  result.sort((a, b) => String(a.groupName).localeCompare(String(b.groupName)));

  return { league, groups: result };
}
