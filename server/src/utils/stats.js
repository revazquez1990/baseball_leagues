import { pool } from '../db.js';

// --- Cálculos de tasas a partir de totales ---------------------------------

export function battingRates(t) {
  const singles = t.h - t.b2 - t.b3 - t.hr;
  const tb = singles + 2 * t.b2 + 3 * t.b3 + 4 * t.hr;
  const avg = t.ab > 0 ? t.h / t.ab : 0;
  const obpDen = t.ab + t.bb + t.hbp + t.sf;
  const obp = obpDen > 0 ? (t.h + t.bb + t.hbp) / obpDen : 0;
  const slg = t.ab > 0 ? tb / t.ab : 0;
  const pa = t.ab + t.bb + t.hbp + t.sf; // aprox. apariciones al plato
  return {
    tb,
    pa,
    avg: round3(avg),
    obp: round3(obp),
    slg: round3(slg),
    ops: round3(obp + slg),
  };
}

export function pitchingRates(t) {
  const ip = t.outs / 3;
  const era = ip > 0 ? (9 * t.er) / ip : 0;
  const whip = ip > 0 ? (t.bb + t.h) / ip : 0;
  return {
    ip: formatIP(t.outs),
    ipDecimal: round1(ip),
    era: round2(era),
    whip: round2(whip),
  };
}

function round1(n) { return Number(n.toFixed(1)); }
function round2(n) { return Number(n.toFixed(2)); }
function round3(n) { return Number(n.toFixed(3)); }

// Formatea outs como entradas de béisbol: 10 outs -> "3.1"
export function formatIP(outs) {
  const whole = Math.floor(outs / 3);
  const rem = outs % 3;
  return `${whole}.${rem}`;
}

// --- Agregaciones ----------------------------------------------------------

const BAT_SUM = `
  SUM(bl.ab) ab, SUM(bl.r) r, SUM(bl.h) h, SUM(bl.b2) b2, SUM(bl.b3) b3,
  SUM(bl.hr) hr, SUM(bl.rbi) rbi, SUM(bl.bb) bb, SUM(bl.so) so,
  SUM(bl.hbp) hbp, SUM(bl.sf) sf, SUM(bl.sb) sb, COUNT(DISTINCT bl.game_id) gp`;

const PIT_SUM = `
  SUM(pl.outs) outs, SUM(pl.h) h, SUM(pl.r) r, SUM(pl.er) er,
  SUM(pl.bb) bb, SUM(pl.so) so, SUM(pl.hr) hr, SUM(pl.bf) bf,
  SUM(pl.win) w, SUM(pl.loss) l, SUM(pl.save) sv,
  COUNT(DISTINCT pl.game_id) gp`;

// Normaliza los agregados numéricos: NULL -> 0, strings numéricos -> número.
// Los campos de texto (nombre, equipo, posición) se dejan intactos.
function z(row) {
  const out = {};
  for (const k of Object.keys(row)) {
    const v = row[k];
    if (v == null) { out[k] = 0; continue; }
    const n = Number(v);
    out[k] = Number.isNaN(n) ? v : n;
  }
  return out;
}

export async function playerBatting(playerId) {
  const [[row]] = await pool.query(
    `SELECT ${BAT_SUM} FROM batting_lines bl
       JOIN games g ON g.id = bl.game_id AND g.status='final'
      WHERE bl.player_id = :id`,
    { id: playerId }
  );
  const t = z(row);
  return { ...t, ...battingRates(t) };
}

export async function playerPitching(playerId) {
  const [[row]] = await pool.query(
    `SELECT ${PIT_SUM} FROM pitching_lines pl
       JOIN games g ON g.id = pl.game_id AND g.status='final'
      WHERE pl.player_id = :id`,
    { id: playerId }
  );
  const t = z(row);
  return { ...t, ...pitchingRates(t) };
}

// Estadísticas de bateo de todos los jugadores de un equipo.
export async function teamBatting(teamId) {
  const [rows] = await pool.query(
    `SELECT p.id, p.name, p.carnet, p.number, p.position, ${BAT_SUM}
       FROM players p
       LEFT JOIN batting_lines bl ON bl.player_id = p.id
       LEFT JOIN games g ON g.id = bl.game_id AND g.status='final'
      WHERE p.team_id = :id
      GROUP BY p.id
      ORDER BY p.number, p.name`,
    { id: teamId }
  );
  return rows.map((row) => {
    const t = z(row);
    return {
      ...t, ...battingRates(t),
      id: row.id, name: row.name, carnet: row.carnet, number: row.number, position: row.position,
    };
  });
}

// Estadísticas de pitcheo de todos los jugadores de un equipo.
export async function teamPitching(teamId) {
  const [rows] = await pool.query(
    `SELECT p.id, p.name, p.number, ${PIT_SUM}
       FROM players p
       LEFT JOIN pitching_lines pl ON pl.player_id = p.id
       LEFT JOIN games g ON g.id = pl.game_id AND g.status='final'
      WHERE p.team_id = :id
      GROUP BY p.id
      HAVING outs > 0
      ORDER BY p.number, p.name`,
    { id: teamId }
  );
  return rows.map((row) => {
    const t = z(row);
    return { ...t, ...pitchingRates(t), id: row.id, name: row.name, number: row.number };
  });
}

/**
 * Líderes de una liga. Agrega por jugador sobre juegos finalizados de la
 * liga y ordena por cada categoría. Para tasas (AVG/OBP/SLG/OPS/ERA/WHIP)
 * aplica un mínimo de apariciones/entradas para calificar.
 */
export async function leagueLeaders(leagueId, { minPA = null, minIP = null } = {}) {
  const [batRows] = await pool.query(
    `SELECT p.id, p.name, t.id teamId, t.name teamName, t.color, ${BAT_SUM}
       FROM batting_lines bl
       JOIN games g ON g.id = bl.game_id AND g.status='final' AND g.league_id = :id
       JOIN players p ON p.id = bl.player_id
       JOIN teams t ON t.id = bl.team_id
      GROUP BY p.id`,
    { id: leagueId }
  );

  const [pitRows] = await pool.query(
    `SELECT p.id, p.name, t.id teamId, t.name teamName, t.color, ${PIT_SUM}
       FROM pitching_lines pl
       JOIN games g ON g.id = pl.game_id AND g.status='final' AND g.league_id = :id
       JOIN players p ON p.id = pl.player_id
       JOIN teams t ON t.id = pl.team_id
      GROUP BY p.id`,
    { id: leagueId }
  );

  const batters = batRows.map((row) => {
    const t = z(row);
    return { ...t, ...battingRates(t),
      id: row.id, name: row.name, teamId: row.teamId, teamName: row.teamName, color: row.color };
  });
  const pitchers = pitRows.map((row) => {
    const t = z(row);
    return { ...t, ...pitchingRates(t),
      id: row.id, name: row.name, teamId: row.teamId, teamName: row.teamName, color: row.color };
  });

  // Umbral automático para tasas si no se especifica: ~2.0 PA por juego de
  // equipo / 1.0 IP por juego, aproximado con los máximos observados.
  const maxGP = Math.max(1, ...batters.map((b) => b.gp));
  const paThreshold = minPA ?? Math.max(5, Math.round(maxGP * 2.0));
  const ipThreshold = minIP ?? Math.max(3, Math.round(maxGP * 1.0));

  const topN = (arr, key, dir = 'desc', n = 10, filter = null) => {
    let list = filter ? arr.filter(filter) : arr;
    list = [...list].sort((a, b) => (dir === 'desc' ? b[key] - a[key] : a[key] - b[key]));
    return list.slice(0, n).filter((x) => (dir === 'desc' ? x[key] > 0 : true));
  };

  return {
    thresholds: { paThreshold, ipThreshold },
    batting: {
      avg: topN(batters, 'avg', 'desc', 10, (b) => b.pa >= paThreshold),
      hr: topN(batters, 'hr'),
      rbi: topN(batters, 'rbi'),
      h: topN(batters, 'h'),
      r: topN(batters, 'r'),
      sb: topN(batters, 'sb'),
      ops: topN(batters, 'ops', 'desc', 10, (b) => b.pa >= paThreshold),
      obp: topN(batters, 'obp', 'desc', 10, (b) => b.pa >= paThreshold),
      slg: topN(batters, 'slg', 'desc', 10, (b) => b.pa >= paThreshold),
    },
    pitching: {
      w: topN(pitchers, 'w'),
      sv: topN(pitchers, 'sv'),
      so: topN(pitchers, 'so'),
      era: topN(pitchers, 'era', 'asc', 10, (p) => p.outs >= ipThreshold * 3),
      whip: topN(pitchers, 'whip', 'asc', 10, (p) => p.outs >= ipThreshold * 3),
    },
  };
}
