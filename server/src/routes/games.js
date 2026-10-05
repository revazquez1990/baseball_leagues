import { Router } from 'express';
import { pool, withTransaction } from '../db.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

// Campos numéricos aceptados en cada línea.
const BAT_FIELDS = ['ab', 'r', 'h', 'b2', 'b3', 'hr', 'rbi', 'bb', 'so', 'hbp', 'sf', 'sb'];
const PIT_FIELDS = ['outs', 'h', 'r', 'er', 'bb', 'so', 'hr', 'bf', 'win', 'loss', 'save'];

function pick(obj, fields) {
  const out = {};
  for (const f of fields) out[f] = Math.max(0, Number(obj?.[f]) || 0);
  return out;
}

// Juegos de una liga (pública). Filtros opcionales: ?status=&group_id=&team_id=
router.get('/leagues/:leagueId/games', async (req, res) => {
  const { status, group_id, team_id } = req.query;
  const where = ['g.league_id = :league'];
  const params = { league: req.params.leagueId };
  if (status) { where.push('g.status = :status'); params.status = status; }
  if (group_id) { where.push('g.group_id = :group'); params.group = group_id; }
  if (team_id) { where.push('(g.home_team_id = :team OR g.away_team_id = :team)'); params.team = team_id; }

  const [rows] = await pool.query(
    `SELECT g.*, h.name AS home_name, h.color AS home_color,
            a.name AS away_name, a.color AS away_color, gr.name AS group_name
       FROM games g
       JOIN teams h ON h.id = g.home_team_id
       JOIN teams a ON a.id = g.away_team_id
       LEFT JOIN league_groups gr ON gr.id = g.group_id
      WHERE ${where.join(' AND ')}
      ORDER BY g.round, g.game_date, g.id`,
    params
  );
  res.json(rows);
});

// Detalle de un juego con su boxscore (pública).
router.get('/games/:id', async (req, res) => {
  const { id } = req.params;
  const [[game]] = await pool.query(
    `SELECT g.*, h.name AS home_name, h.color AS home_color,
            a.name AS away_name, a.color AS away_color
       FROM games g
       JOIN teams h ON h.id = g.home_team_id
       JOIN teams a ON a.id = g.away_team_id
      WHERE g.id = :id`,
    { id }
  );
  if (!game) return res.status(404).json({ error: 'Juego no encontrado' });

  const [batting] = await pool.query(
    `SELECT bl.*, p.name, p.number FROM batting_lines bl
       JOIN players p ON p.id = bl.player_id WHERE bl.game_id = :id`,
    { id }
  );
  const [pitching] = await pool.query(
    `SELECT pl.*, p.name, p.number FROM pitching_lines pl
       JOIN players p ON p.id = pl.player_id WHERE pl.game_id = :id`,
    { id }
  );
  res.json({ game, batting, pitching });
});

// Crear juego manual (admin) — útil para playoffs o amistosos.
router.post('/leagues/:leagueId/games', requireAdmin, async (req, res) => {
  const { home_team_id, away_team_id, game_date = null, round = 1, group_id = null, stage = 'regular' } = req.body || {};
  if (!home_team_id || !away_team_id || home_team_id === away_team_id) {
    return res.status(400).json({ error: 'Equipos local y visitante válidos requeridos' });
  }
  const [r] = await pool.query(
    `INSERT INTO games (league_id, group_id, round, game_date, home_team_id, away_team_id, stage)
     VALUES (:l, :g, :round, :date, :home, :away, :stage)`,
    { l: req.params.leagueId, g: group_id, round, date: game_date, home: home_team_id, away: away_team_id, stage }
  );
  const [[game]] = await pool.query('SELECT * FROM games WHERE id = :id', { id: r.insertId });
  res.status(201).json(game);
});

// Actualizar datos del juego (fecha, etc.) (admin).
router.put('/games/:id', requireAdmin, async (req, res) => {
  const { game_date, round, group_id, stage } = req.body || {};
  await pool.query(
    `UPDATE games SET
        game_date = COALESCE(:date, game_date),
        round = COALESCE(:round, round),
        group_id = COALESCE(:group_id, group_id),
        stage = COALESCE(:stage, stage)
      WHERE id = :id`,
    { id: req.params.id, date: game_date ?? null, round: round ?? null,
      group_id: group_id ?? null, stage: stage ?? null }
  );
  const [[game]] = await pool.query('SELECT * FROM games WHERE id = :id', { id: req.params.id });
  res.json(game);
});

/**
 * Guardar el boxscore de un juego (admin). Reemplaza las líneas previas.
 * body: {
 *   batting: [{ player_id, team_id, ab, r, h, b2, b3, hr, rbi, bb, so, hbp, sf, sb }],
 *   pitching: [{ player_id, team_id, outs, h, r, er, bb, so, hr, bf, win, loss, save }]
 * }
 * El marcador se calcula desde las carreras (R) de cada equipo y el juego
 * queda como 'final'. Posiciones, líderes y nóminas se recalculan solos.
 */
router.post('/games/:id/boxscore', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { batting = [], pitching = [] } = req.body || {};

  const [[game]] = await pool.query('SELECT * FROM games WHERE id = :id', { id });
  if (!game) return res.status(404).json({ error: 'Juego no encontrado' });

  await withTransaction(async (conn) => {
    await conn.query('DELETE FROM batting_lines WHERE game_id = :id', { id });
    await conn.query('DELETE FROM pitching_lines WHERE game_id = :id', { id });

    for (const line of batting) {
      if (!line.player_id || !line.team_id) continue;
      const vals = pick(line, BAT_FIELDS);
      await conn.query(
        `INSERT INTO batting_lines
           (game_id, player_id, team_id, ab, r, h, b2, b3, hr, rbi, bb, so, hbp, sf, sb)
         VALUES (:game, :player, :team, :ab, :r, :h, :b2, :b3, :hr, :rbi, :bb, :so, :hbp, :sf, :sb)`,
        { game: id, player: line.player_id, team: line.team_id, ...vals }
      );
    }

    for (const line of pitching) {
      if (!line.player_id || !line.team_id) continue;
      const vals = pick(line, PIT_FIELDS);
      await conn.query(
        `INSERT INTO pitching_lines
           (game_id, player_id, team_id, outs, h, r, er, bb, so, hr, bf, win, loss, save)
         VALUES (:game, :player, :team, :outs, :h, :r, :er, :bb, :so, :hr, :bf, :win, :loss, :save)`,
        { game: id, player: line.player_id, team: line.team_id, ...vals }
      );
    }

    // Marcador = suma de carreras de bateadores por equipo.
    const [[home]] = await conn.query(
      'SELECT COALESCE(SUM(r),0) r FROM batting_lines WHERE game_id = :id AND team_id = :t',
      { id, t: game.home_team_id }
    );
    const [[away]] = await conn.query(
      'SELECT COALESCE(SUM(r),0) r FROM batting_lines WHERE game_id = :id AND team_id = :t',
      { id, t: game.away_team_id }
    );

    await conn.query(
      "UPDATE games SET home_score = :h, away_score = :a, status = 'final' WHERE id = :id",
      { id, h: Number(home.r), a: Number(away.r) }
    );
    await conn.query(
      "UPDATE leagues SET status = 'in_progress' WHERE id = :lid AND status != 'finished'",
      { lid: game.league_id }
    );
  });

  const [[updated]] = await pool.query('SELECT * FROM games WHERE id = :id', { id });
  res.json({ ok: true, game: updated });
});

// Eliminar juego (admin).
router.delete('/games/:id', requireAdmin, async (req, res) => {
  await pool.query('DELETE FROM games WHERE id = :id', { id: req.params.id });
  res.status(204).end();
});

export default router;
