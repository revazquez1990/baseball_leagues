import { pool } from '../db.js';

/**
 * Calcula la tabla de posiciones de una liga a partir de los juegos
 * finalizados de temporada regular.
 *
 * Orden: mayor porcentaje de victorias (PCT = G / (G + P)). En caso de empate,
 * sistema de desempate (en este orden):
 *   1. Enfrentamiento directo (G-P) entre los equipos empatados.
 *   2. Diferencia de carreras entre los equipos empatados.
 *   3. Más carreras anotadas entre los equipos empatados.
 *   4. Diferencia de carreras en todo el torneo.
 *   5. Más carreras anotadas en todo el torneo.
 *   6. Orden alfabético (último recurso, estable).
 *
 * En ligas de tabla única marca la clasificación cuando está matemáticamente
 * asegurada según los juegos pendientes: 'directo' (top 2 garantizado),
 * 'comodin' (top 6 garantizado) o 'eliminado' (ya no puede entrar al top 6).
 *
 * Devuelve { league, groups: [{ groupId, groupName, rows: [...] }] }.
 */
const DIRECT_SPOTS = 2;   // cupos de clasificación directa
const PLAYOFF_SPOTS = 6;  // cupos totales (directos + comodines)

export async function computeStandings(leagueId) {
  const [[league]] = await pool.query(
    'SELECT * FROM leagues WHERE id = :id',
    { id: leagueId }
  );
  if (!league) return { league: null, groups: [] };

  const [teams] = await pool.query(
    `SELECT t.id, t.name, t.color, t.logo_url, t.group_id, g.name AS group_name
       FROM teams t
       LEFT JOIN league_groups g ON g.id = t.group_id
      WHERE t.league_id = :id
      ORDER BY t.name`,
    { id: leagueId }
  );

  const [games] = await pool.query(
    `SELECT id, group_id, home_team_id, away_team_id, home_score, away_score
       FROM games
      WHERE league_id = :id AND status = 'final' AND stage = 'regular'`,
    { id: leagueId }
  );

  // Inicializa estadísticas por equipo.
  const stats = new Map();
  for (const t of teams) {
    stats.set(t.id, {
      teamId: t.id,
      name: t.name,
      color: t.color,
      logoUrl: t.logo_url,
      groupId: t.group_id,
      groupName: t.group_name,
      g: 0, w: 0, l: 0, rs: 0, ra: 0,
      rem: 0, // juegos pendientes
    });
  }

  // Enfrentamiento directo: por cada par (equipo -> rival) acumula G, P y
  // carreras a favor/en contra en los juegos entre ellos.
  const h2h = new Map(); // `${teamId}:${otherId}` -> { w, l, rs, ra }
  const bump = (a, b, rsA, raA, aWon) => {
    const key = `${a}:${b}`;
    const rec = h2h.get(key) || { w: 0, l: 0, rs: 0, ra: 0 };
    rec.w += aWon ? 1 : 0;
    rec.l += aWon ? 0 : 1;
    rec.rs += rsA;
    rec.ra += raA;
    h2h.set(key, rec);
  };

  for (const game of games) {
    if (game.home_score == null || game.away_score == null) continue;
    const home = stats.get(game.home_team_id);
    const away = stats.get(game.away_team_id);
    if (!home || !away) continue;

    home.g++; away.g++;
    home.rs += game.home_score; home.ra += game.away_score;
    away.rs += game.away_score; away.ra += game.home_score;

    const homeWon = game.home_score > game.away_score;
    (homeWon ? home : away).w++;
    (homeWon ? away : home).l++;

    bump(home.teamId, away.teamId, game.home_score, game.away_score, homeWon);
    bump(away.teamId, home.teamId, game.away_score, game.home_score, !homeWon);
  }

  for (const s of stats.values()) {
    s.pct = s.g > 0 ? s.w / s.g : 0;
    s.diff = s.rs - s.ra;
  }

  // Juegos ya disputados entre dos equipos (para deducir los que faltan del
  // calendario todos-contra-todos).
  const playedBetween = (a, b) => {
    const rec = h2h.get(`${a}:${b}`);
    return rec ? rec.w + rec.l : 0;
  };
  const rounds = Math.max(1, league.rounds || 1);

  // Agregado de enfrentamiento directo de un equipo frente a un conjunto de
  // rivales (los empatados). Devuelve G-P, PCT, diferencia y carreras a favor.
  function h2hAgg(teamId, others) {
    let w = 0, l = 0, rs = 0, ra = 0;
    for (const other of others) {
      if (other === teamId) continue;
      const rec = h2h.get(`${teamId}:${other}`);
      if (rec) { w += rec.w; l += rec.l; rs += rec.rs; ra += rec.ra; }
    }
    const total = w + l;
    return { pct: total > 0 ? w / total : 0, diff: rs - ra, rs };
  }

  // Agrupa por grupo (o un único grupo 'all' si la liga es tabla única).
  const useGroups = league.format === 'groups';
  const groupsMap = new Map();
  for (const s of stats.values()) {
    const gid = useGroups ? (s.groupId ?? 0) : 0;
    const gname = useGroups ? (s.groupName ?? 'Sin grupo') : 'General';
    if (!groupsMap.has(gid)) groupsMap.set(gid, { groupId: gid, groupName: gname, rows: [] });
    groupsMap.get(gid).rows.push(s);
  }

  const result = [];
  for (const group of groupsMap.values()) {
    const rows = group.rows;

    rows.sort((a, b) => {
      if (b.pct !== a.pct) return b.pct - a.pct;
      // Empate: desempate entre los equipos con el mismo PCT.
      const tied = rows.filter((r) => r.pct === a.pct).map((r) => r.teamId);
      const A = h2hAgg(a.teamId, tied);
      const B = h2hAgg(b.teamId, tied);
      if (B.pct !== A.pct) return B.pct - A.pct;       // 1. enfrentamiento directo
      if (B.diff !== A.diff) return B.diff - A.diff;   // 2. dif. de carreras entre ellos
      if (B.rs !== A.rs) return B.rs - A.rs;           // 3. carreras anotadas entre ellos
      if (b.diff !== a.diff) return b.diff - a.diff;   // 4. dif. de carreras del torneo
      if (b.rs !== a.rs) return b.rs - a.rs;           // 5. carreras anotadas del torneo
      return a.name.localeCompare(b.name);
    });

    // Juegos detrás del primer lugar (JD). El líder: '-'.
    const leader = rows[0];
    rows.forEach((r, i) => {
      r.rank = i + 1;
      if (i === 0 || !leader) {
        r.jd = '-';
      } else {
        const jd = ((leader.w - r.w) + (r.l - leader.l)) / 2;
        r.jd = jd.toFixed(1);
      }
    });

    // Juegos pendientes dentro del grupo, deducidos del todos-contra-todos:
    // cada par juega `rounds` veces; lo que falta por jugarse es pendiente.
    const groupPending = [];
    for (const r of rows) r.rem = 0;
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const a = rows[i], b = rows[j];
        const left = rounds - playedBetween(a.teamId, b.teamId);
        for (let k = 0; k < left; k++) {
          groupPending.push({ home_team_id: a.teamId, away_team_id: b.teamId });
          a.rem++; b.rem++;
        }
      }
    }

    // Clasificación asegurada por grupo: 2 primeros = directo, 3ro-6to = comodín.
    // Resuelve los empates con el sistema de desempate (duelo particular entre 2;
    // promedio de ganados entre 3 o más).
    const clasif = computeClinch(rows, groupPending, h2h);

    // Limpia campos internos antes de enviar.
    group.rows = rows.map((r) => ({
      rank: r.rank,
      teamId: r.teamId,
      name: r.name,
      color: r.color,
      logoUrl: r.logoUrl,
      g: r.g, w: r.w, l: r.l,
      pct: Number(r.pct.toFixed(3)),
      jd: r.jd,
      rs: r.rs, ra: r.ra, diff: r.diff,
      clasif: clasif.get(r.teamId) || null, // 'directo' | 'comodin' | 'eliminado' | null
    }));
    result.push(group);
  }

  // Orden de grupos por nombre.
  result.sort((a, b) => String(a.groupName).localeCompare(String(b.groupName)));

  return { league, groups: result };
}

// Tope de juegos pendientes para calcular la clasificación de forma exacta por
// enumeración (2^n escenarios). Por encima de esto se usa la cota conservadora
// (que nunca se equivoca: a lo sumo tarda en marcar un cupo que ya es seguro).
const MAX_ENUM_GAMES = 18;

/**
 * Determina, para cada equipo, si ya tiene asegurado un cupo directo (top 2),
 * un comodín (top 6) o si quedó eliminado del top 6.
 *
 * Cuando quedan pocos juegos pendientes (<= MAX_ENUM_GAMES) lo calcula de forma
 * EXACTA: recorre todos los resultados posibles de los juegos que faltan y, en
 * cada escenario, resuelve los empates con el sistema de desempate
 * (enfrentamiento directo entre 2; promedio de ganados entre 3 o más). Un
 * equipo tiene asegurado el top-K si en TODOS los escenarios termina en el
 * top-K (resolviendo a su favor lo indeterminable); está eliminado si en
 * NINGÚN escenario entra al top 6.
 *
 * Los criterios de diferencia de carreras entre empatados no se pueden prever
 * (los márgenes futuros son libres), así que esos empates residuales se tratan
 * en contra del equipo para "asegurar" y a favor para "eliminar": nunca se
 * afirma algo que no esté garantizado.
 */
export function computeClinch(rows, pending, h2h) {
  const n = rows.length;
  const out = new Map();
  if (n === 0) return out;

  const idx = new Map(rows.map((r, i) => [r.teamId, i]));
  const baseW = rows.map((r) => r.w);
  const games = rows.map((r) => r.g + r.rem); // juegos totales al terminar

  // Juegos pendientes como pares de índices (el primero "gana" si el bit=1).
  const rem = [];
  for (const p of pending) {
    const a = idx.get(p.home_team_id);
    const b = idx.get(p.away_team_id);
    if (a != null && b != null) rem.push([a, b]);
  }
  const R = rem.length;

  // Sin juegos pendientes: la temporada del grupo terminó. El orden ya está
  // totalmente decidido (incluida la diferencia de carreras), así que se marca
  // por la posición final con el desempate completo.
  if (R === 0) return finalRankClinch(rows, h2h);

  if (R > MAX_ENUM_GAMES) return conservativeClinch(rows);

  // Matriz densa de victorias directas ya jugadas: hW[i][j] = veces que i a j.
  const hW = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const rec = h2h.get(`${rows[i].teamId}:${rows[j].teamId}`);
      if (rec) hW[i][j] = rec.w;
    }
  }

  const worst = new Array(n).fill(0);        // peor posición posible
  const best = new Array(n).fill(Infinity);  // mejor posición posible
  const wins = new Array(n);
  const visited = new Uint8Array(n);
  const hw = new Array(n);  // victorias directas dentro del grupo empatado
  const hg = new Array(n);  // juegos directos dentro del grupo empatado

  // Compara pct de dos equipos por producto cruzado (sin coma flotante).
  const cmpPct = (y, x) => {
    const gy = games[y], gx = games[x];
    if (gy === 0 && gx === 0) return wins[y] - wins[x];
    if (gy === 0) return wins[x] > 0 ? -1 : 0;
    if (gx === 0) return wins[y] > 0 ? 1 : 0;
    return wins[y] * gx - wins[x] * gy;
  };
  // Compara promedio de enfrentamiento directo wo/go vs wm/gm.
  const cmpAvg = (wo, go, wm, gm) => {
    if (go === 0 && gm === 0) return 0;
    if (go === 0) return wm > 0 ? -1 : 0;
    if (gm === 0) return wo > 0 ? 1 : 0;
    return wo * gm - wm * go;
  };

  const total = 1 << R;
  for (let mask = 0; mask < total; mask++) {
    for (let i = 0; i < n; i++) wins[i] = baseW[i];
    for (let b = 0; b < R; b++) {
      const [a, c] = rem[b];
      if (mask & (1 << b)) wins[a]++; else wins[c]++;
    }

    visited.fill(0);
    for (let x = 0; x < n; x++) {
      if (visited[x]) continue;
      // Grupo de equipos con el mismo pct que x, y cuántos lo superan.
      const members = [];
      let aheadByPct = 0;
      for (let y = 0; y < n; y++) {
        const c = cmpPct(y, x);
        if (c > 0) aheadByPct++;
        else if (c === 0) { members.push(y); visited[y] = 1; }
      }

      if (members.length === 1) {
        const m = members[0];
        const rank = aheadByPct + 1;
        if (rank > worst[m]) worst[m] = rank;
        if (rank < best[m]) best[m] = rank;
        continue;
      }

      // Enfrentamiento directo entre los empatados (jugado + escenario).
      for (const m of members) { hw[m] = 0; hg[m] = 0; }
      for (let a = 0; a < members.length; a++) {
        for (let b = a + 1; b < members.length; b++) {
          const i = members[a], j = members[b];
          hw[i] += hW[i][j]; hg[i] += hW[i][j] + hW[j][i];
          hw[j] += hW[j][i]; hg[j] += hW[i][j] + hW[j][i];
        }
      }
      for (let b = 0; b < R; b++) {
        const [a, c] = rem[b];
        if (cmpPct(a, x) === 0 && cmpPct(c, x) === 0) {
          hg[a]++; hg[c]++;
          if (mask & (1 << b)) hw[a]++; else hw[c]++;
        }
      }

      // Posición de cada miembro según su promedio directo.
      for (const m of members) {
        let ahead = 0, equal = 0;
        for (const o of members) {
          if (o === m) continue;
          const c = cmpAvg(hw[o], hg[o], hw[m], hg[m]);
          if (c > 0) ahead++;
          else if (c === 0) equal++;
        }
        const rankBest = aheadByPct + ahead + 1;
        const rankWorst = aheadByPct + ahead + equal + 1;
        if (rankWorst > worst[m]) worst[m] = rankWorst;
        if (rankBest < best[m]) best[m] = rankBest;
      }
    }
  }

  for (let i = 0; i < n; i++) {
    if (worst[i] <= DIRECT_SPOTS) out.set(rows[i].teamId, 'directo');
    else if (worst[i] <= PLAYOFF_SPOTS) out.set(rows[i].teamId, 'comodin');
    else if (best[i] > PLAYOFF_SPOTS) out.set(rows[i].teamId, 'eliminado');
  }
  return out;
}

/**
 * Clasificación cuando el grupo ya no tiene juegos pendientes: ordena con el
 * desempate completo (igual que la tabla) y marca por posición final.
 */
function finalRankClinch(rows, h2h) {
  const out = new Map();
  const rank = fullRank(rows, h2h);
  for (const r of rows) {
    const rk = rank.get(r.teamId);
    if (rk <= DIRECT_SPOTS) out.set(r.teamId, 'directo');
    else if (rk <= PLAYOFF_SPOTS) out.set(r.teamId, 'comodin');
    else out.set(r.teamId, 'eliminado');
  }
  return out;
}

/**
 * Ordena los equipos con el sistema de desempate completo (el mismo de la
 * tabla) y devuelve un Map teamId -> posición (1 = primero). Robusto a filas
 * sin rs/ra/name (usa 0 / cadena vacía).
 */
function fullRank(rows, h2h) {
  const pct = (r) => (r.g > 0 ? r.w / r.g : 0);
  const agg = (teamId, others) => {
    let w = 0, l = 0, rs = 0, ra = 0;
    for (const o of others) {
      if (o === teamId) continue;
      const rec = h2h.get(`${teamId}:${o}`);
      if (rec) { w += rec.w; l += rec.l; rs += rec.rs; ra += rec.ra; }
    }
    const t = w + l;
    return { pct: t ? w / t : 0, diff: rs - ra, rs };
  };
  const sorted = [...rows].sort((a, b) => {
    const pa = pct(a), pb = pct(b);
    if (pb !== pa) return pb - pa;
    const tied = rows.filter((r) => pct(r) === pa).map((r) => r.teamId);
    const A = agg(a.teamId, tied), B = agg(b.teamId, tied);
    if (B.pct !== A.pct) return B.pct - A.pct;
    if (B.diff !== A.diff) return B.diff - A.diff;
    if (B.rs !== A.rs) return B.rs - A.rs;
    const da = (a.rs || 0) - (a.ra || 0), db = (b.rs || 0) - (b.ra || 0);
    if (db !== da) return db - da;
    if ((b.rs || 0) !== (a.rs || 0)) return (b.rs || 0) - (a.rs || 0);
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
  const m = new Map();
  sorted.forEach((r, i) => m.set(r.teamId, i + 1));
  return m;
}

/**
 * Cota conservadora (cuando hay demasiados juegos para enumerar): usa victorias
 * mínimas/máximas por equipo sin resolver empates. Nunca afirma algo que no esté
 * garantizado; a lo sumo tarda en marcar un cupo que ya es seguro.
 */
function conservativeClinch(rows) {
  const out = new Map();
  for (const x of rows) {
    const xMin = x.w;
    const xMax = x.w + x.rem;
    let threats = 0, above = 0;
    for (const y of rows) {
      if (y.teamId === x.teamId) continue;
      if (y.w + y.rem >= xMin) threats++;
      if (y.w > xMax) above++;
    }
    if (threats < DIRECT_SPOTS) out.set(x.teamId, 'directo');
    else if (threats < PLAYOFF_SPOTS) out.set(x.teamId, 'comodin');
    else if (above >= PLAYOFF_SPOTS) out.set(x.teamId, 'eliminado');
  }
  return out;
}
