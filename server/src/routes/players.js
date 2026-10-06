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

// Importar varios jugadores de golpe (admin). Valida el CI y los duplicados
// (en la liga y dentro de la propia lista) por fila; inserta los válidos y
// devuelve el detalle de los que fallaron.
// body: { players: [{ name, carnet, number?, position? }] }
router.post('/teams/:teamId/players/bulk', requireAdmin, async (req, res) => {
  const { players = [] } = req.body || {};
  if (!Array.isArray(players) || players.length === 0) {
    return res.status(400).json({ error: 'Lista vacía' });
  }
  const [[team]] = await pool.query('SELECT league_id FROM teams WHERE id = :id', { id: req.params.teamId });
  if (!team) return res.status(404).json({ error: 'Equipo no encontrado' });

  const created = [];
  const errors = [];
  const seen = new Set(); // carnés dentro de esta misma lista

  for (const p of players) {
    const name = (p?.name || '').trim();
    if (!name) { errors.push({ name: p?.name || '(sin nombre)', carnet: p?.carnet, error: 'Nombre vacío' }); continue; }

    const check = validateCarnet(p?.carnet);
    if (!check.ok) { errors.push({ name, carnet: p?.carnet, error: check.error }); continue; }

    if (seen.has(check.carnet)) {
      errors.push({ name, carnet: check.carnet, error: 'CI repetido en la lista' });
      continue;
    }
    const dup = await carnetConflict(team.league_id, check.carnet);
    if (dup) {
      errors.push({ name, carnet: check.carnet, error: `Ya existe: ${dup.name} (${dup.team_name})` });
      continue;
    }

    seen.add(check.carnet);
    const [r] = await pool.query(
      `INSERT INTO players (team_id, name, carnet, number, position)
       VALUES (:t, :n, :carnet, :num, :pos)`,
      {
        t: req.params.teamId, n: name, carnet: check.carnet,
        num: p?.number === '' || p?.number == null ? null : Number(p.number),
        pos: p?.position ? String(p.position).slice(0, 10) : null,
      }
    );
    created.push({ id: r.insertId, name, carnet: check.carnet });
  }

  res.json({ createdCount: created.length, created, errors });
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
