import { pool, withTransaction } from '../db.js';
import { computeStandings } from './standings.js';

// Orden de siembra estándar para un bracket de tamaño potencia de 2.
// Devuelve las semillas (1..size) en orden de posiciones del bracket, de
// modo que las parejas consecutivas sean los cruces de primera ronda y las
// mejores semillas queden en mitades opuestas.
export function standardSeedOrder(size) {
  let seeds = [1, 2];
  while (seeds.length < size) {
    const sum = seeds.length * 2 + 1;
    const next = [];
    for (const s of seeds) {
      next.push(s);
      next.push(sum - s);
    }
    seeds = next;
  }
  return seeds;
}

const clinchGames = (bestOf) => Math.floor(bestOf / 2) + 1;

/**
 * Obtiene los equipos clasificados, ya sembrados (semilla 1 = mejor récord).
 * groups: toma `qualifiers` por cada grupo. single: toma `qualifiers` en total.
 * El orden de siembra prioriza la posición en el grupo y luego el PCT.
 */
async function getSeeds(leagueId, qualifiers) {
  const { league, groups } = await computeStandings(leagueId);
  if (!league) return [];

  const pool = [];
  if (league.format === 'groups') {
    for (const g of groups) {
      g.rows.slice(0, qualifiers).forEach((row, placeInGroup) => {
        pool.push({ teamId: row.teamId, name: row.name, pct: row.pct,
          placeInGroup, groupName: g.groupName });
      });
    }
  } else {
    const g = groups[0];
    if (g) g.rows.slice(0, qualifiers).forEach((row, placeInGroup) => {
      pool.push({ teamId: row.teamId, name: row.name, pct: row.pct, placeInGroup });
    });
  }

  // Siembra: primero todos los #1 de grupo (mejor PCT), luego los #2, etc.
  pool.sort((a, b) => a.placeInGroup - b.placeInGroup || b.pct - a.pct);
  pool.forEach((t, i) => { t.seed = i + 1; });
  return pool;
}

/**
 * Genera (o regenera) el bracket de playoffs de una liga. Borra playoffs
 * previos. Crea las series de todas las rondas enlazadas. Las semillas que
 * caen contra un "bye" avanzan automáticamente.
 */
export async function generatePlayoffs(leagueId, { qualifiers = 2, bestOf = 5 } = {}) {
  const seeds = await getSeeds(leagueId, qualifiers);
  if (seeds.length < 2) {
    throw new Error('Se necesitan al menos 2 equipos clasificados con juegos finalizados.');
  }

  const m = seeds.length;
  let size = 1;
  while (size < m) size *= 2;          // siguiente potencia de 2
  const order = standardSeedOrder(size);
  const bySeed = new Map(seeds.map((s) => [s.seed, s]));
  const numRounds = Math.log2(size);

  return withTransaction(async (conn) => {
    // Limpia playoffs anteriores (los juegos caen por ON DELETE CASCADE).
    await conn.query('DELETE FROM playoff_series WHERE league_id = :id', { id: leagueId });

    // Crea las series de cada ronda (de la última a la primera para enlazar).
    // Primero generamos la estructura en memoria.
    const rounds = [];          // rounds[r] = array de series {high, low, labels...}
    const roundSizes = [];
    for (let r = 0; r < numRounds; r++) roundSizes.push(size / 2 ** (r + 1));

    // Ronda 1 a partir del orden de siembra.
    const round1 = [];
    for (let i = 0; i < size / 2; i++) {
      const hiSeed = order[i * 2];
      const loSeed = order[i * 2 + 1];
      const hi = bySeed.get(hiSeed) || null;
      const lo = bySeed.get(loSeed) || null;
      round1.push({
        highTeam: hi?.teamId ?? null,
        lowTeam: lo?.teamId ?? null,
        highLabel: `#${hiSeed}`,
        lowLabel: `#${loSeed}`,
      });
    }
    rounds.push(round1);
    for (let r = 1; r < numRounds; r++) {
      const arr = [];
      for (let i = 0; i < roundSizes[r]; i++) {
        arr.push({ highTeam: null, lowTeam: null, highLabel: null, lowLabel: null });
      }
      rounds.push(arr);
    }

    const roundName = (r) => {
      const remaining = numRounds - r; // 1 => final
      if (remaining === 1) return 'Final';
      if (remaining === 2) return 'Semifinal';
      if (remaining === 3) return 'Cuartos de final';
      return `Ronda ${r + 1}`;
    };

    // Inserta de la ronda final hacia atrás para conocer next_series_id.
    const ids = rounds.map((arr) => new Array(arr.length).fill(null));
    for (let r = numRounds - 1; r >= 0; r--) {
      for (let i = 0; i < rounds[r].length; i++) {
        const s = rounds[r][i];
        let nextId = null, nextSlot = null;
        if (r < numRounds - 1) {
          nextId = ids[r + 1][Math.floor(i / 2)];
          nextSlot = i % 2 === 0 ? 'high' : 'low';
        }
        const nm = rounds[r].length > 1 ? `${roundName(r)} ${i + 1}` : roundName(r);
        const [res] = await conn.query(
          `INSERT INTO playoff_series
             (league_id, round, position, name, best_of, high_seed_team_id,
              low_seed_team_id, high_seed_label, low_seed_label, next_series_id, next_slot)
           VALUES (:league, :round, :pos, :name, :bo, :hi, :lo, :hl, :ll, :next, :slot)`,
          {
            league: leagueId, round: r + 1, pos: i, name: nm, bo: bestOf,
            hi: s.highTeam, lo: s.lowTeam, hl: s.highLabel, ll: s.lowLabel,
            next: nextId, slot: nextSlot,
          }
        );
        ids[r][i] = res.insertId;
      }
    }

    // Procesa byes de la primera ronda: si un lado no tiene equipo, el otro
    // avanza automáticamente.
    for (let i = 0; i < round1.length; i++) {
      const s = round1[i];
      if (s.highTeam && !s.lowTeam) await advanceWinner(conn, ids[0][i], s.highTeam);
      else if (!s.highTeam && s.lowTeam) await advanceWinner(conn, ids[0][i], s.lowTeam);
    }

    await conn.query("UPDATE leagues SET status = 'in_progress' WHERE id = :id", { id: leagueId });
    return { series: ids.flat().length, rounds: numRounds, size };
  });
}

// Marca el ganador de una serie y lo coloca en la serie siguiente.
async function advanceWinner(conn, seriesId, teamId) {
  const [[s]] = await conn.query('SELECT * FROM playoff_series WHERE id = :id', { id: seriesId });
  if (!s) return;
  await conn.query('UPDATE playoff_series SET winner_team_id = :w WHERE id = :id',
    { w: teamId, id: seriesId });
  if (s.next_series_id) {
    const col = s.next_slot === 'high' ? 'high_seed_team_id' : 'low_seed_team_id';
    await conn.query(
      `UPDATE playoff_series SET ${col} = :team WHERE id = :id`,
      { team: teamId, id: s.next_series_id }
    );
  }
}

/**
 * Recalcula el estado de una serie tras finalizar un juego: cuenta victorias,
 * define ganador si alcanza los juegos para cerrar y lo avanza. Se llama desde
 * el guardado de boxscore.
 */
export async function recomputeSeries(seriesId) {
  await withTransaction(async (conn) => {
    const [[s]] = await conn.query('SELECT * FROM playoff_series WHERE id = :id', { id: seriesId });
    if (!s) return;

    const [[counts]] = await conn.query(
      `SELECT
         SUM(CASE WHEN (home_team_id=:hi AND home_score>away_score)
                    OR (away_team_id=:hi AND away_score>home_score) THEN 1 ELSE 0 END) AS high_wins,
         SUM(CASE WHEN (home_team_id=:lo AND home_score>away_score)
                    OR (away_team_id=:lo AND away_score>home_score) THEN 1 ELSE 0 END) AS low_wins
       FROM games WHERE series_id=:id AND status='final'`,
      { id: seriesId, hi: s.high_seed_team_id, lo: s.low_seed_team_id }
    );

    const highWins = Number(counts.high_wins || 0);
    const lowWins = Number(counts.low_wins || 0);
    const need = clinchGames(s.best_of);

    let winner = null;
    if (s.high_seed_team_id && highWins >= need) winner = s.high_seed_team_id;
    else if (s.low_seed_team_id && lowWins >= need) winner = s.low_seed_team_id;

    if (winner && winner !== s.winner_team_id) {
      await advanceWinner(conn, seriesId, winner);
    } else if (!winner && s.winner_team_id) {
      // Se editó/eliminó un resultado y ya no hay ganador: revierte.
      await conn.query('UPDATE playoff_series SET winner_team_id = NULL WHERE id = :id', { id: seriesId });
      if (s.next_series_id) {
        const col = s.next_slot === 'high' ? 'high_seed_team_id' : 'low_seed_team_id';
        await conn.query(`UPDATE playoff_series SET ${col} = NULL WHERE id = :id`,
          { id: s.next_series_id });
      }
    }
  });
}

/** Devuelve el bracket completo listo para pintar en el frontend. */
export async function getBracket(leagueId) {
  const [series] = await pool.query(
    `SELECT ps.*, h.name AS high_name, h.color AS high_color,
            l.name AS low_name, l.color AS low_color, w.name AS winner_name
       FROM playoff_series ps
       LEFT JOIN teams h ON h.id = ps.high_seed_team_id
       LEFT JOIN teams l ON l.id = ps.low_seed_team_id
       LEFT JOIN teams w ON w.id = ps.winner_team_id
      WHERE ps.league_id = :id
      ORDER BY ps.round, ps.position`,
    { id: leagueId }
  );
  if (series.length === 0) return { rounds: [] };

  const [games] = await pool.query(
    `SELECT g.id, g.series_id, g.game_date, g.status, g.home_team_id, g.away_team_id,
            g.home_score, g.away_score
       FROM games g
       JOIN playoff_series ps ON ps.id = g.series_id
      WHERE ps.league_id = :id
      ORDER BY g.id`,
    { id: leagueId }
  );
  const gamesBySeries = new Map();
  for (const g of games) {
    if (!gamesBySeries.has(g.series_id)) gamesBySeries.set(g.series_id, []);
    gamesBySeries.get(g.series_id).push(g);
  }

  const need = (bo) => clinchGames(bo);
  const byRound = new Map();
  for (const s of series) {
    const sg = gamesBySeries.get(s.id) || [];
    const highWins = sg.filter((g) => g.status === 'final' &&
      ((g.home_team_id === s.high_seed_team_id && g.home_score > g.away_score) ||
       (g.away_team_id === s.high_seed_team_id && g.away_score > g.home_score))).length;
    const lowWins = sg.filter((g) => g.status === 'final' &&
      ((g.home_team_id === s.low_seed_team_id && g.home_score > g.away_score) ||
       (g.away_team_id === s.low_seed_team_id && g.away_score > g.home_score))).length;

    const row = {
      id: s.id, round: s.round, position: s.position, name: s.name, bestOf: s.best_of,
      clinch: need(s.best_of),
      high: s.high_seed_team_id
        ? { teamId: s.high_seed_team_id, name: s.high_name, color: s.high_color, wins: highWins }
        : { teamId: null, name: s.low_seed_team_id && !s.high_seed_team_id ? 'BYE' : 'Por definir', label: s.high_seed_label, wins: 0 },
      low: s.low_seed_team_id
        ? { teamId: s.low_seed_team_id, name: s.low_name, color: s.low_color, wins: lowWins }
        : { teamId: null, name: 'Por definir', label: s.low_seed_label, wins: 0 },
      winnerTeamId: s.winner_team_id,
      winnerName: s.winner_name,
      games: sg,
    };
    if (!byRound.has(s.round)) byRound.set(s.round, []);
    byRound.get(s.round).push(row);
  }

  const rounds = [...byRound.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([round, list]) => ({ round, series: list }));
  return { rounds };
}
