// Datos de ejemplo para probar la app. Uso: npm run db:seed
// Crea una liga con 6 equipos en 2 grupos, nóminas, calendario y algunos
// boxscores ya cargados, para ver posiciones y líderes funcionando.
import { pool, withTransaction } from '../db.js';
import { distributeIntoGroups } from '../utils/random.js';
import { generateRoundRobin } from '../utils/schedule.js';

const TEAM_NAMES = ['Tigres', 'Leones', 'Águilas', 'Piratas', 'Toros', 'Halcones'];
const FIRST = ['Luis', 'Carlos', 'José', 'Miguel', 'Pedro', 'Juan', 'Raúl', 'Diego', 'Yadiel', 'Ariel'];
const LAST = ['Pérez', 'González', 'Rodríguez', 'Martínez', 'Hernández', 'López', 'Díaz', 'Ramos'];
const POS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'P'];

const rand = (a) => a[Math.floor(Math.random() * a.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// Genera carnés válidos y únicos (11 dígitos; aammdd + 5 dígitos).
const usedCarnets = new Set();
function makeCarnet() {
  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  for (let i = 0; i < 1000; i++) {
    const y = randInt(80, 99); // años 1980-1999 para el ejemplo
    const mm = randInt(1, 12);
    const dd = randInt(1, daysInMonth[mm - 1]);
    const tail = String(randInt(0, 99999)).padStart(5, '0');
    const c = `${String(y).padStart(2, '0')}${String(mm).padStart(2, '0')}${String(dd).padStart(2, '0')}${tail}`;
    if (!usedCarnets.has(c)) { usedCarnets.add(c); return c; }
  }
  throw new Error('No se pudo generar un carné único');
}

async function main() {
  console.log('Generando datos de ejemplo...');

  const leagueId = await withTransaction(async (conn) => {
    const [lr] = await conn.query(
      `INSERT INTO leagues (name, season, format, num_groups, rounds, status)
       VALUES ('Liga de Barrios', '2026', 'groups', 2, 2, 'setup')`
    );
    const leagueId = lr.insertId;

    // Equipos + nóminas.
    const teamIds = [];
    for (const name of TEAM_NAMES) {
      const [tr] = await conn.query(
        'INSERT INTO teams (league_id, name, color) VALUES (?, ?, ?)',
        [leagueId, name, `#${randInt(0, 0xffffff).toString(16).padStart(6, '0')}`]
      );
      const teamId = tr.insertId;
      teamIds.push(teamId);
      for (let i = 1; i <= 12; i++) {
        await conn.query(
          `INSERT INTO players (team_id, name, carnet, number, position, bats, throws)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [teamId, `${rand(FIRST)} ${rand(LAST)}`, makeCarnet(), i, rand(POS), rand(['R', 'L', 'S']), rand(['R', 'L'])]
        );
      }
    }

    // Grupos (2) con reparto aleatorio.
    const groupIds = [];
    for (const letter of ['A', 'B']) {
      const [gr] = await conn.query(
        'INSERT INTO league_groups (league_id, name) VALUES (?, ?)',
        [leagueId, `Grupo ${letter}`]
      );
      groupIds.push(gr.insertId);
    }
    const dist = distributeIntoGroups(teamIds, 2);
    for (let gi = 0; gi < dist.length; gi++) {
      for (const tid of dist[gi]) {
        await conn.query('UPDATE teams SET group_id = ? WHERE id = ?', [groupIds[gi], tid]);
      }
    }

    // Calendario por grupo.
    for (let gi = 0; gi < dist.length; gi++) {
      const games = generateRoundRobin(dist[gi], 2);
      for (const g of games) {
        await conn.query(
          `INSERT INTO games (league_id, group_id, round, home_team_id, away_team_id, stage)
           VALUES (?, ?, ?, ?, ?, 'regular')`,
          [leagueId, groupIds[gi], g.round, g.home, g.away]
        );
      }
    }
    await conn.query("UPDATE leagues SET status='scheduled' WHERE id=?", [leagueId]);
    return leagueId;
  });

  // Cargar boxscores en ~60% de los juegos.
  const [games] = await pool.query(
    'SELECT * FROM games WHERE league_id = ? ORDER BY id',
    [leagueId]
  );

  for (const game of games) {
    if (Math.random() > 0.6) continue; // deja algunos pendientes
    await fillBoxscore(game);
  }

  await pool.query("UPDATE leagues SET status='in_progress' WHERE id=?", [leagueId]);
  console.log(`Liga de ejemplo creada (id=${leagueId}). ¡Abre el frontend para verla!`);
  await pool.end();
}

async function fillBoxscore(game) {
  for (const teamId of [game.home_team_id, game.away_team_id]) {
    const [players] = await pool.query(
      'SELECT id FROM players WHERE team_id = ? ORDER BY number LIMIT 9',
      [teamId]
    );
    // Bateo
    for (const p of players) {
      const ab = randInt(2, 5);
      const h = randInt(0, ab);
      const hr = h > 0 && Math.random() < 0.15 ? 1 : 0;
      const b2 = h - hr > 0 && Math.random() < 0.3 ? 1 : 0;
      await pool.query(
        `INSERT INTO batting_lines (game_id, player_id, team_id, ab, r, h, b2, b3, hr, rbi, bb, so, hbp, sf, sb)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 0, 0, ?)`,
        [game.id, p.id, teamId, ab, randInt(0, 2), h, b2, hr,
         randInt(0, 3), randInt(0, 2), randInt(0, 2), randInt(0, 2)]
      );
    }
    // Pitcheo: 1-2 lanzadores
    const [pitchers] = await pool.query(
      'SELECT id FROM players WHERE team_id = ? ORDER BY RAND() LIMIT 2',
      [teamId]
    );
    let outsLeft = 27;
    for (let i = 0; i < pitchers.length && outsLeft > 0; i++) {
      const outs = i === pitchers.length - 1 ? outsLeft : randInt(9, 18);
      outsLeft -= outs;
      await pool.query(
        `INSERT INTO pitching_lines (game_id, player_id, team_id, outs, h, r, er, bb, so, hr, bf)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [game.id, pitchers[i].id, teamId, Math.max(0, outs), randInt(3, 9),
         randInt(0, 6), randInt(0, 5), randInt(0, 4), randInt(2, 9), randInt(0, 2), randInt(15, 30)]
      );
    }
  }

  // Marcador desde carreras.
  const [[home]] = await pool.query(
    'SELECT COALESCE(SUM(r),0) r FROM batting_lines WHERE game_id=? AND team_id=?',
    [game.id, game.home_team_id]
  );
  const [[away]] = await pool.query(
    'SELECT COALESCE(SUM(r),0) r FROM batting_lines WHERE game_id=? AND team_id=?',
    [game.id, game.away_team_id]
  );
  let h = Number(home.r), a = Number(away.r);
  if (h === a) h += 1; // evita empates en el ejemplo
  await pool.query(
    "UPDATE games SET home_score=?, away_score=?, status='final' WHERE id=?",
    [h, a, game.id]
  );
  // Asigna ganador/perdedor a un lanzador de cada lado.
  const winnerTeam = h > a ? game.home_team_id : game.away_team_id;
  const loserTeam = h > a ? game.away_team_id : game.home_team_id;
  await pool.query(
    `UPDATE pitching_lines SET win=1 WHERE game_id=? AND team_id=? ORDER BY outs DESC LIMIT 1`,
    [game.id, winnerTeam]
  );
  await pool.query(
    `UPDATE pitching_lines SET loss=1 WHERE game_id=? AND team_id=? ORDER BY outs DESC LIMIT 1`,
    [game.id, loserTeam]
  );
}

main().catch((err) => {
  console.error('Error en seed:', err.message);
  process.exit(1);
});
