import { Router } from 'express';
import { pool, withTransaction } from '../db.js';
import { requireAdmin } from '../middleware/auth.js';
import { distributeIntoGroups } from '../utils/random.js';
import { generateRoundRobin, weekendDates, spacedDates } from '../utils/schedule.js';
import { computeStandings } from '../utils/standings.js';
import { computeMissingGames } from '../utils/missing-games.js';
import { leagueLeaders } from '../utils/stats.js';

const router = Router();

// Asegura que la liga tenga `numGroups` grupos, creando los que falten sin
// borrar los existentes (para que el sorteo y la asignación manual compartan
// los mismos grupos con id estable). Devuelve los grupos.
async function ensureGroups(conn, leagueId, numGroups) {
  const [existing] = await conn.query(
    'SELECT * FROM league_groups WHERE league_id = :id ORDER BY id', { id: leagueId }
  );
  const groups = [...existing];
  for (let i = existing.length; i < numGroups; i++) {
    const name = numGroups === 1 ? 'General' : `Grupo ${String.fromCharCode(65 + i)}`;
    const [r] = await conn.query(
      'INSERT INTO league_groups (league_id, name) VALUES (:id, :name)',
      { id: leagueId, name }
    );
    groups.push({ id: r.insertId, league_id: leagueId, name });
  }
  return groups;
}

// Lista de ligas (pública).
router.get('/', async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT l.*,
            (SELECT COUNT(*) FROM teams t WHERE t.league_id = l.id) AS team_count,
            (SELECT COUNT(*) FROM games gm WHERE gm.league_id = l.id) AS game_count
       FROM leagues l
      ORDER BY l.created_at DESC`
  );
  res.json(rows);
});

// Detalle de liga con grupos y equipos (pública).
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const [[league]] = await pool.query('SELECT * FROM leagues WHERE id = :id', { id });
  if (!league) return res.status(404).json({ error: 'Liga no encontrada' });

  const [groups] = await pool.query(
    'SELECT * FROM league_groups WHERE league_id = :id ORDER BY name',
    { id }
  );
  const [teams] = await pool.query(
    `SELECT t.*, g.name AS group_name,
            (SELECT COUNT(*) FROM players p WHERE p.team_id = t.id) AS player_count
       FROM teams t
       LEFT JOIN league_groups g ON g.id = t.group_id
      WHERE t.league_id = :id ORDER BY t.name`,
    { id }
  );
  res.json({ league, groups, teams });
});

// Crear liga (admin).
router.post('/', requireAdmin, async (req, res) => {
  const { name, season = null, format = 'groups', num_groups = 1, rounds = 1 } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Nombre requerido' });
  const ng = format === 'groups' ? Math.max(1, Number(num_groups) || 1) : 1;
  const [result] = await pool.query(
    `INSERT INTO leagues (name, season, format, num_groups, rounds)
     VALUES (:name, :season, :format, :num_groups, :rounds)`,
    { name, season, format, num_groups: ng, rounds: Math.max(1, Number(rounds) || 1) }
  );
  const [[league]] = await pool.query('SELECT * FROM leagues WHERE id = :id', { id: result.insertId });
  res.status(201).json(league);
});

// Actualizar liga (admin).
router.put('/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, season, format, num_groups, rounds, status } = req.body || {};
  await pool.query(
    `UPDATE leagues SET
        name = COALESCE(:name, name),
        season = COALESCE(:season, season),
        format = COALESCE(:format, format),
        num_groups = COALESCE(:num_groups, num_groups),
        rounds = COALESCE(:rounds, rounds),
        status = COALESCE(:status, status)
      WHERE id = :id`,
    {
      id,
      name: name ?? null, season: season ?? null, format: format ?? null,
      num_groups: num_groups ?? null, rounds: rounds ?? null, status: status ?? null,
    }
  );
  const [[league]] = await pool.query('SELECT * FROM leagues WHERE id = :id', { id });
  res.json(league);
});

// Eliminar liga (admin).
router.delete('/:id', requireAdmin, async (req, res) => {
  await pool.query('DELETE FROM leagues WHERE id = :id', { id: req.params.id });
  res.status(204).end();
});

// Crear/asegurar los grupos de la liga sin asignar equipos (admin).
// Útil para después asignar manualmente cada equipo a un grupo.
router.post('/:id/groups', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const [[league]] = await pool.query('SELECT * FROM leagues WHERE id = :id', { id });
  if (!league) return res.status(404).json({ error: 'Liga no encontrada' });
  const numGroups = league.format === 'groups' ? Math.max(1, league.num_groups) : 1;
  await withTransaction((conn) => ensureGroups(conn, id, numGroups));
  const [groups] = await pool.query(
    `SELECT g.*, (SELECT COUNT(*) FROM teams t WHERE t.group_id = g.id) AS team_count
       FROM league_groups g WHERE g.league_id = :id ORDER BY g.id`,
    { id }
  );
  res.json({ ok: true, groups });
});

// Sorteo aleatorio de equipos en grupos (admin). Reutiliza los grupos
// existentes (id estable) para convivir con la asignación manual.
router.post('/:id/assign-groups', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const [[league]] = await pool.query('SELECT * FROM leagues WHERE id = :id', { id });
  if (!league) return res.status(404).json({ error: 'Liga no encontrada' });

  const [teams] = await pool.query('SELECT id FROM teams WHERE league_id = :id', { id });
  if (teams.length < 2) return res.status(400).json({ error: 'Se necesitan al menos 2 equipos' });

  const numGroups = league.format === 'groups' ? Math.max(1, league.num_groups) : 1;

  await withTransaction(async (conn) => {
    const groups = await ensureGroups(conn, id, numGroups);
    const groupIds = groups.slice(0, numGroups).map((g) => g.id);
    const distribution = distributeIntoGroups(teams.map((t) => t.id), numGroups);
    for (let gi = 0; gi < distribution.length; gi++) {
      for (const teamId of distribution[gi]) {
        await conn.query('UPDATE teams SET group_id = :g WHERE id = :t', {
          g: groupIds[gi], t: teamId,
        });
      }
    }
  });

  const [groups] = await pool.query(
    `SELECT g.*, (SELECT COUNT(*) FROM teams t WHERE t.group_id = g.id) AS team_count
       FROM league_groups g WHERE g.league_id = :id ORDER BY g.id`,
    { id }
  );
  res.json({ ok: true, groups });
});

// Generar calendario round-robin (admin). Borra juegos de temporada regular
// previos y crea los nuevos por grupo.
router.post('/:id/schedule', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { startDate = null, daysBetweenRounds = 7, weekendOnly = true } = req.body || {};
  const [[league]] = await pool.query('SELECT * FROM leagues WHERE id = :id', { id });
  if (!league) return res.status(404).json({ error: 'Liga no encontrada' });

  const [teams] = await pool.query('SELECT id, group_id FROM teams WHERE league_id = :id', { id });
  if (teams.length < 2) return res.status(400).json({ error: 'Se necesitan al menos 2 equipos' });

  // Agrupa por grupo (o todos juntos en liga única).
  const useGroups = league.format === 'groups';
  const buckets = new Map();
  for (const t of teams) {
    const key = useGroups ? (t.group_id ?? 0) : 0;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(t.id);
  }
  if (useGroups && buckets.has(0)) {
    return res.status(400).json({ error: 'Hay equipos sin grupo asignado. Sortea los grupos primero.' });
  }

  // Genera los partidos por grupo y calcula cuántas jornadas hay en total.
  const perBucket = [];
  let maxRound = 0;
  for (const [groupId, teamIds] of buckets.entries()) {
    const games = generateRoundRobin(teamIds, league.rounds);
    perBucket.push({ groupId, games });
    for (const g of games) if (g.round > maxRound) maxRound = g.round;
  }

  // Precalcula una fecha por jornada: fines de semana (Vie/Sáb/Dom) o
  // separadas por días. Sin startDate, las fechas quedan sin asignar.
  let roundDates = [];
  if (startDate) {
    roundDates = weekendOnly
      ? weekendDates(startDate, maxRound)
      : spacedDates(startDate, maxRound, Number(daysBetweenRounds || 7));
  }

  const created = await withTransaction(async (conn) => {
    await conn.query(
      "DELETE FROM games WHERE league_id = :id AND stage = 'regular'",
      { id }
    );

    let total = 0;
    for (const { groupId, games } of perBucket) {
      for (const g of games) {
        const date = roundDates[g.round - 1] || null;
        await conn.query(
          `INSERT INTO games (league_id, group_id, round, game_date, home_team_id, away_team_id, stage)
           VALUES (:league, :group, :round, :date, :home, :away, 'regular')`,
          {
            league: id,
            group: useGroups ? groupId : null,
            round: g.round,
            date,
            home: g.home,
            away: g.away,
          }
        );
        total++;
      }
    }
    await conn.query("UPDATE leagues SET status = 'scheduled' WHERE id = :id", { id });
    return total;
  });

  res.json({ ok: true, gamesCreated: created });
});

// Tabla de posiciones (pública).
router.get('/:id/standings', async (req, res) => {
  const data = await computeStandings(req.params.id);
  if (!data.league) return res.status(404).json({ error: 'Liga no encontrada' });
  res.json(data);
});

// Juegos que faltan por programar, deducidos del todos-contra-todos (pública).
router.get('/:id/missing-games', async (req, res) => {
  const data = await computeMissingGames(req.params.id);
  if (!data.league) return res.status(404).json({ error: 'Liga no encontrada' });
  res.json(data);
});

// Líderes (pública).
router.get('/:id/leaders', async (req, res) => {
  const leaders = await leagueLeaders(req.params.id);
  res.json(leaders);
});

export default router;
