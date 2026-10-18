import { Router } from 'express';
import { pool } from '../db.js';
import { requireAdmin } from '../middleware/auth.js';
import { teamBatting, teamPitching, battingRates, pitchingRates } from '../utils/stats.js';

const router = Router();

// Suma los campos indicados sobre un arreglo de jugadores.
function sumFields(rows, fields) {
  const out = {};
  for (const f of fields) out[f] = rows.reduce((acc, r) => acc + Number(r[f] || 0), 0);
  return out;
}

// Equipos de una liga (pública).
router.get('/leagues/:leagueId/teams', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT t.*, g.name AS group_name,
            (SELECT COUNT(*) FROM players p WHERE p.team_id = t.id) AS player_count
       FROM teams t
       LEFT JOIN league_groups g ON g.id = t.group_id
      WHERE t.league_id = :id ORDER BY t.name`,
    { id: req.params.leagueId }
  );
  res.json(rows);
});

// Crear equipo (admin).
router.post('/leagues/:leagueId/teams', requireAdmin, async (req, res) => {
  const { name, city = null, color = '#1e5aa8', logo_url = null } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Nombre requerido' });
  const [r] = await pool.query(
    'INSERT INTO teams (league_id, name, city, color, logo_url) VALUES (:l, :n, :c, :col, :logo)',
    { l: req.params.leagueId, n: name, c: city, col: color, logo: logo_url }
  );
  const [[team]] = await pool.query('SELECT * FROM teams WHERE id = :id', { id: r.insertId });
  res.status(201).json(team);
});

// Crear varios equipos en lote por cantidad (admin).
// body: { count: 8, prefix: 'Equipo' }  -> "Equipo 1".."Equipo 8"
router.post('/leagues/:leagueId/teams/bulk', requireAdmin, async (req, res) => {
  const { count = 0, prefix = 'Equipo' } = req.body || {};
  const n = Math.max(0, Math.min(64, Number(count) || 0));
  if (n === 0) return res.status(400).json({ error: 'Cantidad inválida' });
  const values = [];
  for (let i = 1; i <= n; i++) {
    values.push([req.params.leagueId, `${prefix} ${i}`, '#1e5aa8']);
  }
  await pool.query(
    'INSERT INTO teams (league_id, name, color) VALUES ?',
    [values]
  );
  const [rows] = await pool.query(
    'SELECT * FROM teams WHERE league_id = :id ORDER BY name',
    { id: req.params.leagueId }
  );
  res.status(201).json(rows);
});

// Detalle de equipo con nómina y estadísticas (pública).
router.get('/teams/:id', async (req, res) => {
  const { id } = req.params;
  const [[team]] = await pool.query(
    `SELECT t.*, g.name AS group_name, l.name AS league_name
       FROM teams t
       LEFT JOIN league_groups g ON g.id = t.group_id
       JOIN leagues l ON l.id = t.league_id
      WHERE t.id = :id`,
    { id }
  );
  if (!team) return res.status(404).json({ error: 'Equipo no encontrado' });

  const batting = await teamBatting(id);
  const pitching = await teamPitching(id);

  // Totales del equipo: se suman los acumulados y las tasas (AVG/OBP/SLG/OPS,
  // ERA/WHIP) se recalculan desde esos totales, no promediando promedios.
  const batTot = sumFields(batting, ['ab', 'r', 'h', 'b2', 'b3', 'hr', 'rbi', 'bb', 'so', 'hbp', 'sf', 'sb']);
  const battingTotal = { ...batTot, ...battingRates(batTot) };
  const pitTot = sumFields(pitching, ['outs', 'h', 'r', 'er', 'bb', 'so', 'hr', 'bf', 'w', 'l', 'sv']);
  const pitchingTotal = { ...pitTot, ...pitchingRates(pitTot) };

  // Récord del equipo a partir de juegos finalizados.
  const [[rec]] = await pool.query(
    `SELECT
        SUM(CASE WHEN (home_team_id=:id AND home_score>away_score)
                   OR (away_team_id=:id AND away_score>home_score) THEN 1 ELSE 0 END) w,
        SUM(CASE WHEN (home_team_id=:id AND home_score<away_score)
                   OR (away_team_id=:id AND away_score<home_score) THEN 1 ELSE 0 END) l
       FROM games
      WHERE status='final' AND (home_team_id=:id OR away_team_id=:id)`,
    { id }
  );

  res.json({
    team,
    record: { w: Number(rec.w || 0), l: Number(rec.l || 0) },
    roster: batting, // batting incluye a todos los jugadores (aunque no pitcheen)
    pitching,
    battingTotal,
    pitchingTotal,
  });
});

// Actualizar equipo (admin).
router.put('/teams/:id', requireAdmin, async (req, res) => {
  const { name, city, color, logo_url } = req.body || {};
  await pool.query(
    `UPDATE teams SET
        name = COALESCE(:name, name),
        city = COALESCE(:city, city),
        color = COALESCE(:color, color),
        logo_url = COALESCE(:logo, logo_url)
      WHERE id = :id`,
    { id: req.params.id, name: name ?? null, city: city ?? null,
      color: color ?? null, logo: logo_url ?? null }
  );
  const [[team]] = await pool.query('SELECT * FROM teams WHERE id = :id', { id: req.params.id });
  res.json(team);
});

// Asignar (o quitar) el grupo de un equipo — asignación manual (admin).
// group_id = null quita el equipo de su grupo.
router.put('/teams/:id/group', requireAdmin, async (req, res) => {
  const { group_id = null } = req.body || {};
  await pool.query('UPDATE teams SET group_id = :g WHERE id = :id', {
    g: group_id === '' ? null : group_id, id: req.params.id,
  });
  const [[team]] = await pool.query('SELECT * FROM teams WHERE id = :id', { id: req.params.id });
  res.json(team);
});

// Eliminar equipo (admin).
router.delete('/teams/:id', requireAdmin, async (req, res) => {
  await pool.query('DELETE FROM teams WHERE id = :id', { id: req.params.id });
  res.status(204).end();
});

export default router;
