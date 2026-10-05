import { Router } from 'express';
import { pool } from '../db.js';
import { requireAdmin } from '../middleware/auth.js';
import { playerBatting, playerPitching } from '../utils/stats.js';

const router = Router();

// Nómina de un equipo (pública).
router.get('/teams/:teamId/players', async (req, res) => {
  const [rows] = await pool.query(
    'SELECT * FROM players WHERE team_id = :id ORDER BY number, name',
    { id: req.params.teamId }
  );
  res.json(rows);
});

// Agregar jugador (admin).
router.post('/teams/:teamId/players', requireAdmin, async (req, res) => {
  const { name, number = null, position = null, bats = null, throws = null } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Nombre requerido' });
  const [r] = await pool.query(
    `INSERT INTO players (team_id, name, number, position, bats, throws)
     VALUES (:t, :n, :num, :pos, :bats, :throws)`,
    { t: req.params.teamId, n: name, num: number, pos: position, bats, throws }
  );
  const [[player]] = await pool.query('SELECT * FROM players WHERE id = :id', { id: r.insertId });
  res.status(201).json(player);
});

// Ficha de jugador con estadísticas (pública).
router.get('/players/:id', async (req, res) => {
  const [[player]] = await pool.query(
    `SELECT p.*, t.name AS team_name, t.id AS team_id, t.league_id
       FROM players p JOIN teams t ON t.id = p.team_id WHERE p.id = :id`,
    { id: req.params.id }
  );
  if (!player) return res.status(404).json({ error: 'Jugador no encontrado' });
  const batting = await playerBatting(req.params.id);
  const pitching = await playerPitching(req.params.id);
  res.json({ player, batting, pitching });
});

// Actualizar jugador (admin).
router.put('/players/:id', requireAdmin, async (req, res) => {
  const { name, number, position, bats, throws } = req.body || {};
  await pool.query(
    `UPDATE players SET
        name = COALESCE(:name, name),
        number = COALESCE(:number, number),
        position = COALESCE(:position, position),
        bats = COALESCE(:bats, bats),
        throws = COALESCE(:throws, throws)
      WHERE id = :id`,
    { id: req.params.id, name: name ?? null, number: number ?? null,
      position: position ?? null, bats: bats ?? null, throws: throws ?? null }
  );
  const [[player]] = await pool.query('SELECT * FROM players WHERE id = :id', { id: req.params.id });
  res.json(player);
});

// Eliminar jugador (admin).
router.delete('/players/:id', requireAdmin, async (req, res) => {
  await pool.query('DELETE FROM players WHERE id = :id', { id: req.params.id });
  res.status(204).end();
});

export default router;
