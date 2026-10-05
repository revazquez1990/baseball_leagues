import { Router } from 'express';
import { pool } from '../db.js';
import { requireAdmin } from '../middleware/auth.js';
import { generatePlayoffs, getBracket } from '../utils/playoffs.js';

const router = Router();

// Bracket de playoffs de una liga (pública).
router.get('/leagues/:id/playoffs', async (req, res) => {
  const bracket = await getBracket(req.params.id);
  res.json(bracket);
});

// Generar / regenerar bracket (admin).
router.post('/leagues/:id/playoffs', requireAdmin, async (req, res) => {
  const { qualifiers = 2, bestOf = 5 } = req.body || {};
  try {
    const info = await generatePlayoffs(req.params.id, {
      qualifiers: Math.max(1, Number(qualifiers) || 1),
      bestOf: Math.max(1, Number(bestOf) || 1),
    });
    const bracket = await getBracket(req.params.id);
    res.json({ ok: true, info, bracket });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Eliminar playoffs (admin).
router.delete('/leagues/:id/playoffs', requireAdmin, async (req, res) => {
  await pool.query('DELETE FROM playoff_series WHERE league_id = :id', { id: req.params.id });
  res.status(204).end();
});

// Agregar un juego a una serie (admin). Alterna la localía por juego.
router.post('/series/:id/games', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const [[s]] = await pool.query('SELECT * FROM playoff_series WHERE id = :id', { id });
  if (!s) return res.status(404).json({ error: 'Serie no encontrada' });
  if (!s.high_seed_team_id || !s.low_seed_team_id) {
    return res.status(400).json({ error: 'La serie aún no tiene ambos equipos definidos' });
  }
  if (s.winner_team_id) {
    return res.status(400).json({ error: 'La serie ya tiene un ganador' });
  }

  const [[{ n }]] = await pool.query(
    'SELECT COUNT(*) n FROM games WHERE series_id = :id', { id }
  );
  // Localía alternada: juego par -> mejor semilla en casa; impar -> al revés.
  const highHome = n % 2 === 0;
  const home = highHome ? s.high_seed_team_id : s.low_seed_team_id;
  const away = highHome ? s.low_seed_team_id : s.high_seed_team_id;

  const [r] = await pool.query(
    `INSERT INTO games (league_id, series_id, round, home_team_id, away_team_id, stage)
     VALUES (:league, :series, :round, :home, :away, 'playoff')`,
    { league: s.league_id, series: id, round: s.round, home, away }
  );
  const [[game]] = await pool.query('SELECT * FROM games WHERE id = :id', { id: r.insertId });
  res.status(201).json(game);
});

export default router;
