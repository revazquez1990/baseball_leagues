import { Router } from 'express';
import { pool } from '../db.js';
import { requireAdmin } from '../middleware/auth.js';
import { playerBatting, playerPitching } from '../utils/stats.js';
import { validateCarnet } from '../utils/carnet.js';

const router = Router();

// Verifica que el carné no esté ya usado por otro jugador de la misma liga.
// Devuelve el jugador en conflicto, o null.
async function carnetConflict(leagueId, carnet, excludePlayerId = 0) {
  const [[dup]] = await pool.query(
    `SELECT p.id, p.name, t.name AS team_name
       FROM players p JOIN teams t ON t.id = p.team_id
      WHERE t.league_id = :lid AND p.carnet = :carnet AND p.id <> :pid
      LIMIT 1`,
    { lid: leagueId, carnet, pid: excludePlayerId }
  );
  return dup || null;
}

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
  const { name, carnet, number = null, position = null, bats = null, throws = null } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Nombre requerido' });

  const check = validateCarnet(carnet);
  if (!check.ok) return res.status(400).json({ error: check.error });

  const [[team]] = await pool.query('SELECT league_id FROM teams WHERE id = :id', { id: req.params.teamId });
  if (!team) return res.status(404).json({ error: 'Equipo no encontrado' });

  const dup = await carnetConflict(team.league_id, check.carnet);
  if (dup) {
    return res.status(409).json({
      error: `El carné ya está registrado para ${dup.name} (${dup.team_name}) en esta liga.`,
    });
  }

  const [r] = await pool.query(
    `INSERT INTO players (team_id, name, carnet, number, position, bats, throws)
     VALUES (:t, :n, :carnet, :num, :pos, :bats, :throws)`,
    { t: req.params.teamId, n: name, carnet: check.carnet, num: number, pos: position, bats, throws }
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
  const { name, carnet, number, position, bats, throws } = req.body || {};

  const [[current]] = await pool.query(
    `SELECT p.*, t.league_id FROM players p JOIN teams t ON t.id = p.team_id WHERE p.id = :id`,
    { id: req.params.id }
  );
  if (!current) return res.status(404).json({ error: 'Jugador no encontrado' });

  // Si se envía carné, validarlo y comprobar duplicados en la liga.
  let carnetValue = null; // null => no cambiar (COALESCE)
  if (carnet !== undefined) {
    const check = validateCarnet(carnet);
    if (!check.ok) return res.status(400).json({ error: check.error });
    const dup = await carnetConflict(current.league_id, check.carnet, current.id);
    if (dup) {
      return res.status(409).json({
        error: `El carné ya está registrado para ${dup.name} (${dup.team_name}) en esta liga.`,
      });
    }
    carnetValue = check.carnet;
  }

  await pool.query(
    `UPDATE players SET
        name = COALESCE(:name, name),
        carnet = COALESCE(:carnet, carnet),
        number = COALESCE(:number, number),
        position = COALESCE(:position, position),
        bats = COALESCE(:bats, bats),
        throws = COALESCE(:throws, throws)
      WHERE id = :id`,
    { id: req.params.id, name: name ?? null, carnet: carnetValue, number: number ?? null,
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
