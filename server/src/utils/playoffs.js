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

// Título genérico de ronda para un bracket de eliminación simple.
function genericRoundTitle(round, totalRounds) {
  const remaining = totalRounds - (round - 1);
  if (remaining === 1) return 'Final';
  if (remaining === 2) return 'Semifinal';
  if (remaining === 3) return 'Cuartos de final';
  return `Ronda ${round}`;
}

// Etiqueta corta de un grupo: "Grupo A" -> "A".
function groupTag(name, fallback) {
  const m = String(name || '').match(/grupo\s+([A-Za-z0-9]+)/i);
  if (m) return m[1].toUpperCase();
  const t = String(name || '').trim();
  return t ? t[0].toUpperCase() : fallback;
}

// ---------------------------------------------------------------------------
// Bracket automático (formato del torneo: 2 grupos, 6 clasificados por grupo).
//
//   Play-in (1 juego):  3º vs 6º y 4º vs 5º de cada grupo.
//   Cuartos (al mejor de 3):  1A-4B · 2A-3B · 3A-2B · 4A-1B
//     (1A/2A = directos del grupo A; 3A/4A = ganadores del play-in de A; igual B)
//   Semifinal (al mejor de 3):  Ganador C1 vs Ganador C3 · Ganador C2 vs Ganador C4
//   Final (al mejor de 3):      Ganador Semifinal 1 vs Ganador Semifinal 2
// ---------------------------------------------------------------------------
const AUTO_TITLES = ['Play-in', 'Cuartos de final', 'Semifinal', 'Final'];

// Plan estático del bracket (sin equipos). gi: 0 = grupo A, 1 = grupo B.
function autoBracketPlan(aTag, bTag) {
  const seed = (gi, place, tag) => ({ kind: 'seed', gi, place, label: `${place}${tag}` });
  const win = (code, label) => ({ kind: 'winner', code, label });
  return [
    // Play-in (ronda 1) — un solo juego.
    { code: 'PIA1', round: 1, pos: 0, bestOf: 1, name: `${aTag}: 3º vs 6º`,
      high: seed(0, 3, aTag), low: seed(0, 6, aTag), next: { code: 'C3', slot: 'high' } },
    { code: 'PIA2', round: 1, pos: 1, bestOf: 1, name: `${aTag}: 4º vs 5º`,
      high: seed(0, 4, aTag), low: seed(0, 5, aTag), next: { code: 'C4', slot: 'high' } },
    { code: 'PIB1', round: 1, pos: 2, bestOf: 1, name: `${bTag}: 3º vs 6º`,
      high: seed(1, 3, bTag), low: seed(1, 6, bTag), next: { code: 'C2', slot: 'low' } },
    { code: 'PIB2', round: 1, pos: 3, bestOf: 1, name: `${bTag}: 4º vs 5º`,
      high: seed(1, 4, bTag), low: seed(1, 5, bTag), next: { code: 'C1', slot: 'low' } },
    // Cuartos de final (ronda 2).
    { code: 'C1', round: 2, pos: 0, bestOf: 3, name: 'C1',
      high: seed(0, 1, aTag), low: win('PIB2', `4${bTag}`), next: { code: 'S1', slot: 'high' } },
    { code: 'C2', round: 2, pos: 1, bestOf: 3, name: 'C2',
      high: seed(0, 2, aTag), low: win('PIB1', `3${bTag}`), next: { code: 'S2', slot: 'high' } },
    { code: 'C3', round: 2, pos: 2, bestOf: 3, name: 'C3',
      high: win('PIA1', `3${aTag}`), low: seed(1, 2, bTag), next: { code: 'S1', slot: 'low' } },
    { code: 'C4', round: 2, pos: 3, bestOf: 3, name: 'C4',
      high: win('PIA2', `4${aTag}`), low: seed(1, 1, bTag), next: { code: 'S2', slot: 'low' } },
    // Semifinal (ronda 3).
    { code: 'S1', round: 3, pos: 0, bestOf: 3, name: 'Semifinal 1',
      high: win('C1', 'Ganador C1'), low: win('C3', 'Ganador C3'), next: { code: 'F', slot: 'high' } },
    { code: 'S2', round: 3, pos: 1, bestOf: 3, name: 'Semifinal 2',
      high: win('C2', 'Ganador C2'), low: win('C4', 'Ganador C4'), next: { code: 'F', slot: 'low' } },
    // Final (ronda 4).
    { code: 'F', round: 4, pos: 0, bestOf: 3, name: 'Final',
      high: win('S1', 'Ganador Semifinal 1'), low: win('S2', 'Ganador Semifinal 2'), next: null },
  ];
}

// ¿La liga usa el formato automático de 2 grupos?
function isAutoLeague(league, groups) {
  return league && league.format === 'groups' && groups && groups.length === 2;
}

// Igual que isAutoLeague pero consultando por id (cuenta los grupos reales).
export async function isAutoLeagueById(leagueId) {
  const [[league]] = await pool.query('SELECT format FROM leagues WHERE id = :id', { id: leagueId });
  if (!league || league.format !== 'groups') return false;
  const [[{ n }]] = await pool.query(
    'SELECT COUNT(*) AS n FROM league_groups WHERE league_id = :id', { id: leagueId }
  );
  return Number(n) === 2;
}

/**
 * Cuenta los juegos de temporada regular que faltan por jugarse, deducidos del
 * todos-contra-todos (cada par juega `rounds` veces). La fase clasificatoria se
 * considera terminada cuando no queda ninguno y ya se jugó al menos uno.
 */
export async function regularPending(leagueId) {
  const [[league]] = await pool.query('SELECT rounds, format FROM leagues WHERE id = :id', { id: leagueId });
  if (!league) return { pending: 0, complete: false, hasGames: false };
  const rounds = Math.max(1, league.rounds || 1);
  const useGroups = league.format === 'groups';

  const [teams] = await pool.query('SELECT id, group_id FROM teams WHERE league_id = :id', { id: leagueId });
  const [games] = await pool.query(
    "SELECT home_team_id, away_team_id FROM games WHERE league_id = :id AND status = 'final' AND stage = 'regular'",
    { id: leagueId }
  );

  const pk = (a, b) => (a < b ? `${a}:${b}` : `${b}:${a}`);
  const played = new Map();
  for (const g of games) {
    const k = pk(g.home_team_id, g.away_team_id);
    played.set(k, (played.get(k) || 0) + 1);
  }

  const buckets = new Map();
  for (const t of teams) {
    const key = useGroups ? (t.group_id ?? 0) : 0;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(t.id);
  }

  let pending = 0;
  for (const ids of buckets.values()) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        pending += Math.max(0, rounds - (played.get(pk(ids[i], ids[j])) || 0));
      }
    }
  }
  return { pending, complete: pending === 0 && games.length > 0, hasGames: games.length > 0 };
}

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

/**
 * Genera (o regenera) el bracket automático del torneo (2 grupos, 6 por grupo)
 * sembrado con la tabla de posiciones actual. Solo se permite cuando la fase
 * clasificatoria ya terminó. Crea play-in, cuartos, semifinal y final enlazados,
 * y avanza automáticamente los play-in que queden con "bye".
 */
export async function generateAutoPlayoffs(leagueId) {
  const { league, groups } = await computeStandings(leagueId);
  if (!league) throw new Error('Liga no encontrada');
  if (!isAutoLeague(league, groups)) {
    throw new Error('El bracket automático requiere una liga de 2 grupos.');
  }
  const { complete } = await regularPending(leagueId);
  if (!complete) throw new Error('La fase clasificatoria aún no ha terminado.');

  const A = groups[0], B = groups[1];
  const aTag = groupTag(A.groupName, 'A');
  const bTag = groupTag(B.groupName, 'B');
  const seeds = [A.rows, B.rows];
  const teamOf = (ref) =>
    ref.kind === 'seed' ? (seeds[ref.gi]?.[ref.place - 1]?.teamId ?? null) : null;

  const plan = autoBracketPlan(aTag, bTag);

  return withTransaction(async (conn) => {
    await conn.query('DELETE FROM playoff_series WHERE league_id = :id', { id: leagueId });

    // Inserta de la ronda final hacia atrás para conocer next_series_id.
    const ordered = [...plan].sort((a, b) => b.round - a.round || b.pos - a.pos);
    const idByCode = new Map();
    for (const s of ordered) {
      const nextId = s.next ? idByCode.get(s.next.code) : null;
      const nextSlot = s.next ? s.next.slot : null;
      const [res] = await conn.query(
        `INSERT INTO playoff_series
           (league_id, round, position, name, best_of, high_seed_team_id,
            low_seed_team_id, high_seed_label, low_seed_label, next_series_id, next_slot)
         VALUES (:l, :r, :p, :n, :bo, :hi, :lo, :hl, :ll, :next, :slot)`,
        {
          l: leagueId, r: s.round, p: s.pos, n: s.name, bo: s.bestOf,
          hi: teamOf(s.high), lo: teamOf(s.low),
          hl: s.high.label, ll: s.low.label, next: nextId, slot: nextSlot,
        }
      );
      idByCode.set(s.code, res.insertId);
    }

    // Play-in con "bye": si a un lado le falta equipo (grupo con menos de 6),
    // el otro avanza automáticamente a su cuarto de final.
    for (const s of plan) {
      if (s.round !== 1) continue;
      const hi = teamOf(s.high), lo = teamOf(s.low);
      if (hi && !lo) await advanceWinner(conn, idByCode.get(s.code), hi);
      else if (!hi && lo) await advanceWinner(conn, idByCode.get(s.code), lo);
    }

    await conn.query("UPDATE leagues SET status = 'in_progress' WHERE id = :id", { id: leagueId });
    return { series: plan.length, rounds: 4 };
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
    `SELECT g.id, g.series_id, g.game_date, g.game_time, g.status, g.home_team_id, g.away_team_id,
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

  const roundsArr = [...byRound.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([round, list]) => ({ round, series: list }));

  // Título de cada ronda. Si la ronda 1 es play-in (un solo juego) y la 2 son
  // series largas, es el bracket automático; si no, títulos genéricos.
  const total = roundsArr.length;
  const r1 = roundsArr[0];
  const r2 = roundsArr[1];
  const hasPlayIn = r1 && r1.series.every((s) => s.bestOf === 1) &&
                    r2 && r2.series.some((s) => s.bestOf > 1);
  for (const r of roundsArr) {
    r.title = hasPlayIn
      ? (AUTO_TITLES[r.round - 1] || `Ronda ${r.round}`)
      : genericRoundTitle(r.round, total);
  }
  return { rounds: roundsArr };
}

/**
 * Bracket "proyectado" en vivo desde la tabla actual (sin persistir ni juegos).
 * Rellena los participantes del play-in con los 6 primeros de cada grupo y deja
 * el resto como "Por definir". Es lo que se muestra mientras la fase regular no
 * termina (provisional) o antes de generar el bracket.
 */
function projectAutoBracket(groups) {
  const A = groups[0], B = groups[1];
  const aTag = groupTag(A.groupName, 'A');
  const bTag = groupTag(B.groupName, 'B');
  const seeds = [A.rows, B.rows];
  const plan = autoBracketPlan(aTag, bTag);

  const side = (ref) => {
    if (ref.kind === 'seed') {
      const row = seeds[ref.gi]?.[ref.place - 1];
      if (row) {
        return { teamId: row.teamId, name: row.name, color: row.color, logoUrl: row.logoUrl, label: ref.label, wins: 0 };
      }
    }
    return { teamId: null, name: 'Por definir', label: ref.label, wins: 0 };
  };

  const byRound = new Map();
  for (const s of plan) {
    const row = {
      id: s.code, round: s.round, position: s.pos, name: s.name,
      bestOf: s.bestOf, clinch: clinchGames(s.bestOf),
      high: side(s.high), low: side(s.low),
      winnerTeamId: null, winnerName: null, games: [],
    };
    if (!byRound.has(s.round)) byRound.set(s.round, []);
    byRound.get(s.round).push(row);
  }
  return [...byRound.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([round, list]) => ({ round, title: AUTO_TITLES[round - 1] || `Ronda ${round}`, series: list }));
}

/**
 * Punto de entrada del frontend de playoffs. Decide qué mostrar:
 *   - Si ya hay bracket persistido -> ese (con juegos, editable si la fase acabó).
 *   - Si no, y la liga es de 2 grupos -> proyección en vivo desde la tabla.
 * Devuelve banderas para la UI: regularComplete, provisional, persisted, editable.
 */
export async function getPlayoffs(leagueId) {
  const { league, groups } = await computeStandings(leagueId);
  if (!league) return { league: null, rounds: [] };

  const { complete: regularComplete } = await regularPending(leagueId);
  const auto = isAutoLeague(league, groups);
  const persisted = await getBracket(leagueId);
  const hasPersisted = persisted.rounds.length > 0;

  // Formato genérico (no son 2 grupos): se conserva el comportamiento anterior.
  if (!auto) {
    return {
      rounds: persisted.rounds,
      auto: false, regularComplete,
      provisional: hasPersisted && !regularComplete,
      persisted: hasPersisted,
      editable: hasPersisted && regularComplete,
    };
  }

  // Liga automática. Un bracket persistido solo "cuenta" si es el automático
  // (play-in en ronda 1). Cualquier bracket viejo de otro formato se ignora:
  // se muestra la proyección en vivo y al generar se reemplaza.
  const r1 = persisted.rounds[0];
  const r2 = persisted.rounds[1];
  const persistedIsAuto = hasPersisted &&
    r1.series.every((s) => s.bestOf === 1) && r2 && r2.series.some((s) => s.bestOf > 1);

  if (persistedIsAuto) {
    return {
      rounds: persisted.rounds,
      auto: true, regularComplete,
      provisional: !regularComplete,
      persisted: true,
      editable: regularComplete,
    };
  }

  // Aún no se ha generado el bracket automático: proyección en vivo desde la
  // tabla actual (provisional). Un bracket viejo persistido se tratará como
  // inexistente y se sobrescribirá al generar.
  return {
    rounds: projectAutoBracket(groups),
    auto: true, regularComplete,
    provisional: true,
    persisted: false,
    editable: false,
  };
}
