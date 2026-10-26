import { pool } from '../db.js';

/**
 * Reúne todo lo necesario para simular el final de la temporada en el navegador:
 *   - teams:     equipos con su grupo.
 *   - played:    juegos ya jugados (con marcador) para sembrar la base.
 *   - remaining: juegos que faltan por jugar, deducidos del todos-contra-todos
 *                (cada par del mismo grupo juega `rounds` veces, menos los ya
 *                jugados). Incluye los agendados sin resultado.
 *
 * No calcula posiciones: eso lo hace el cliente en vivo con los resultados que
 * el usuario va poniendo.
 */
export async function computeSimulationData(leagueId) {
  const [[league]] = await pool.query('SELECT * FROM leagues WHERE id = :id', { id: leagueId });
  if (!league) return { league: null };

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

  const [games] = await pool.query(
    `SELECT group_id, home_team_id, away_team_id, home_score, away_score
       FROM games
      WHERE league_id = :id AND status = 'final' AND stage = 'regular'`,
    { id: leagueId }
  );

  const played = games
    .filter((g) => g.home_score != null && g.away_score != null)
    .map((g) => ({
      groupId: g.group_id,
      homeId: g.home_team_id,
      awayId: g.away_team_id,
      homeScore: g.home_score,
      awayScore: g.away_score,
    }));

  const pkey = (a, b) => (a < b ? `${a}:${b}` : `${b}:${a}`);
  const pc = new Map();
  for (const g of played) pc.set(pkey(g.homeId, g.awayId), (pc.get(pkey(g.homeId, g.awayId)) || 0) + 1);

  const groups = new Map();
  for (const t of teams) {
    const gid = useGroups ? (t.group_id ?? 0) : 0;
    if (!groups.has(gid)) groups.set(gid, []);
    groups.get(gid).push(t);
  }

  const info = (t) => ({ id: t.id, name: t.name, color: t.color, logoUrl: t.logo_url });
  const remaining = [];
  for (const members of groups.values()) {
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const a = members[i], b = members[j];
        const left = rounds - (pc.get(pkey(a.id, b.id)) || 0);
        for (let k = 0; k < left; k++) {
          remaining.push({
            groupId: useGroups ? (a.group_id ?? null) : null,
            groupName: useGroups ? (a.group_name ?? 'Sin grupo') : 'General',
            teamA: info(a),
            teamB: info(b),
          });
        }
      }
    }
  }
  remaining.sort((x, y) =>
    String(x.groupName).localeCompare(String(y.groupName)) ||
    x.teamA.name.localeCompare(y.teamA.name) ||
    x.teamB.name.localeCompare(y.teamB.name));

  const teamsOut = teams.map((t) => ({
    id: t.id, name: t.name, color: t.color, logoUrl: t.logo_url,
    groupId: useGroups ? (t.group_id ?? 0) : 0,
    groupName: useGroups ? (t.group_name ?? 'Sin grupo') : 'General',
  }));

  return {
    league: { id: league.id, name: league.name, format: league.format, rounds },
    teams: teamsOut,
    played,
    remaining,
  };
}
