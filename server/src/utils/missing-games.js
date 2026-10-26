import { pool } from '../db.js';

/**
 * Calcula los juegos de temporada regular que FALTAN por programar, deducidos
 * del todos-contra-todos: cada par de equipos del mismo grupo debe enfrentarse
 * `rounds` veces; se restan los juegos que ya existen en el calendario (en
 * cualquier estado: agendados o jugados). Lo que queda son los enfrentamientos
 * que todavía no están en el calendario y pueden agregarse.
 *
 * Devuelve { league, missing: [{ groupId, groupName, teamA, teamB }] } con una
 * entrada por cada juego pendiente (si un par debe jugar 2 veces y no se ha
 * programado ninguno, aparece 2 veces).
 */
export async function computeMissingGames(leagueId) {
  const [[league]] = await pool.query('SELECT * FROM leagues WHERE id = :id', { id: leagueId });
  if (!league) return { league: null, missing: [] };

  const rounds = Math.max(1, league.rounds || 1);
  const useGroups = league.format === 'groups';

  const [teams] = await pool.query(
    `SELECT t.id, t.name, t.color, t.logo_url, t.group_id, g.name AS group_name
       FROM teams t
       LEFT JOIN league_groups g ON g.id = t.group_id
      WHERE t.league_id = :id
      ORDER BY t.name`,
    { id: leagueId }
  );

  // Todos los juegos de temporada regular que ya existen (agendados o jugados).
  const [games] = await pool.query(
    `SELECT home_team_id, away_team_id
       FROM games
      WHERE league_id = :id AND stage = 'regular'`,
    { id: leagueId }
  );

  const pkey = (a, b) => (a < b ? `${a}:${b}` : `${b}:${a}`);
  const pairCount = new Map();
  for (const g of games) {
    const k = pkey(g.home_team_id, g.away_team_id);
    pairCount.set(k, (pairCount.get(k) || 0) + 1);
  }

  // Agrupa equipos (en tabla única todos juegan contra todos).
  const groups = new Map();
  for (const t of teams) {
    const gid = useGroups ? (t.group_id ?? 0) : 0;
    if (!groups.has(gid)) groups.set(gid, []);
    groups.get(gid).push(t);
  }

  const missing = [];
  const info = (t) => ({ id: t.id, name: t.name, color: t.color, logoUrl: t.logo_url });
  for (const members of groups.values()) {
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const a = members[i], b = members[j];
        const left = rounds - (pairCount.get(pkey(a.id, b.id)) || 0);
        for (let k = 0; k < left; k++) {
          missing.push({
            groupId: useGroups ? (a.group_id ?? null) : null,
            groupName: useGroups ? (a.group_name ?? 'Sin grupo') : 'General',
            teamA: info(a),
            teamB: info(b),
          });
        }
      }
    }
  }

  missing.sort((x, y) =>
    String(x.groupName).localeCompare(String(y.groupName)) ||
    x.teamA.name.localeCompare(y.teamA.name) ||
    x.teamB.name.localeCompare(y.teamB.name));

  return { league, missing };
}
