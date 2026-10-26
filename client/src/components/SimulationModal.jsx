import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import TeamLogo from './TeamLogo.jsx';

const ZONE = {
  directo: { label: 'Directo', bg: 'rgba(63,185,80,0.18)', fg: 'var(--green)' },
  comodin: { label: 'Comodín', bg: 'rgba(56,139,253,0.18)', fg: '#58a6ff' },
};

// Calcula posiciones (mismo desempate que el servidor) a partir de una lista de
// juegos { aId, bId, aScore, bScore }. a/b son solo los dos lados del juego.
function computeSimStandings(teams, allGames) {
  const stats = new Map();
  for (const t of teams) {
    stats.set(t.id, {
      teamId: t.id, name: t.name, color: t.color, logoUrl: t.logoUrl,
      groupId: t.groupId, groupName: t.groupName,
      g: 0, w: 0, l: 0, rs: 0, ra: 0,
    });
  }
  const h2h = new Map();
  const bump = (x, y, rsX, raX, xWon) => {
    const k = `${x}:${y}`;
    const r = h2h.get(k) || { w: 0, l: 0, rs: 0, ra: 0 };
    r.w += xWon ? 1 : 0; r.l += xWon ? 0 : 1; r.rs += rsX; r.ra += raX;
    h2h.set(k, r);
  };

  for (const gm of allGames) {
    const A = stats.get(gm.aId), B = stats.get(gm.bId);
    if (!A || !B) continue;
    A.g++; B.g++;
    A.rs += gm.aScore; A.ra += gm.bScore;
    B.rs += gm.bScore; B.ra += gm.aScore;
    const aWon = gm.aScore > gm.bScore;
    (aWon ? A : B).w++;
    (aWon ? B : A).l++;
    bump(A.teamId, B.teamId, gm.aScore, gm.bScore, aWon);
    bump(B.teamId, A.teamId, gm.bScore, gm.aScore, !aWon);
  }
  for (const s of stats.values()) { s.pct = s.g > 0 ? s.w / s.g : 0; s.diff = s.rs - s.ra; }

  const h2hAgg = (teamId, others) => {
    let w = 0, l = 0, rs = 0, ra = 0;
    for (const o of others) {
      if (o === teamId) continue;
      const r = h2h.get(`${teamId}:${o}`);
      if (r) { w += r.w; l += r.l; rs += r.rs; ra += r.ra; }
    }
    const tot = w + l;
    return { pct: tot ? w / tot : 0, diff: rs - ra, rs };
  };

  const groups = new Map();
  for (const s of stats.values()) {
    if (!groups.has(s.groupId)) groups.set(s.groupId, { groupId: s.groupId, groupName: s.groupName, rows: [] });
    groups.get(s.groupId).rows.push(s);
  }

  const out = [];
  for (const grp of groups.values()) {
    const rows = grp.rows;
    rows.sort((a, b) => {
      if (b.pct !== a.pct) return b.pct - a.pct;
      const tied = rows.filter((r) => r.pct === a.pct).map((r) => r.teamId);
      const A = h2hAgg(a.teamId, tied), B = h2hAgg(b.teamId, tied);
      if (B.pct !== A.pct) return B.pct - A.pct;
      if (B.diff !== A.diff) return B.diff - A.diff;
      if (B.rs !== A.rs) return B.rs - A.rs;
      if (b.diff !== a.diff) return b.diff - a.diff;
      if (b.rs !== a.rs) return b.rs - a.rs;
      return a.name.localeCompare(b.name);
    });
    rows.forEach((r, i) => { r.rank = i + 1; });
    out.push(grp);
  }
  out.sort((a, b) => String(a.groupName).localeCompare(String(b.groupName)));
  return out;
}

export default function SimulationModal({ leagueId, onClose }) {
  const [data, setData] = useState(null);
  const [results, setResults] = useState({}); // idx -> { a, b }

  useEffect(() => {
    api.get(`/leagues/${leagueId}/simulation`).then(setData);
  }, [leagueId]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const standings = useMemo(() => {
    if (!data) return [];
    const base = data.played.map((g) => ({
      aId: g.homeId, bId: g.awayId, aScore: g.homeScore, bScore: g.awayScore,
    }));
    const sim = [];
    data.remaining.forEach((m, i) => {
      const r = results[i];
      if (!r) return;
      const a = Number(r.a), b = Number(r.b);
      if (r.a === '' || r.b === '' || Number.isNaN(a) || Number.isNaN(b) || a === b) return;
      sim.push({ aId: m.teamA.id, bId: m.teamB.id, aScore: a, bScore: b });
    });
    return computeSimStandings(data.teams, base.concat(sim));
  }, [data, results]);

  const filled = useMemo(() => {
    if (!data) return 0;
    let n = 0;
    data.remaining.forEach((m, i) => {
      const r = results[i];
      if (r && r.a !== '' && r.b !== '' && Number(r.a) !== Number(r.b)
          && !Number.isNaN(Number(r.a)) && !Number.isNaN(Number(r.b))) n++;
    });
    return n;
  }, [data, results]);

  const setScore = (i, side, val) =>
    setResults((prev) => ({ ...prev, [i]: { a: '', b: '', ...prev[i], [side]: val } }));

  // Agrupa los juegos que faltan por grupo, conservando su índice original.
  const remainingByGroup = useMemo(() => {
    if (!data) return [];
    const m = new Map();
    data.remaining.forEach((g, i) => {
      if (!m.has(g.groupName)) m.set(g.groupName, []);
      m.get(g.groupName).push({ ...g, idx: i });
    });
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [data]);

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <div className="spread" style={{ marginBottom: 6 }}>
          <h2 style={{ margin: 0 }}>Simulación de resultados</h2>
          <button className="btn secondary small" onClick={onClose}>✕ Cerrar</button>
        </div>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          Pon los resultados de los juegos que faltan y mira cómo quedaría la tabla.
          Es solo una proyección: <b>no se guarda nada</b>.
        </p>

        {!data ? (
          <div className="empty">Cargando…</div>
        ) : data.remaining.length === 0 ? (
          <div className="empty">No faltan juegos por jugar; la temporada ya está completa.</div>
        ) : (
          <div style={grid}>
            {/* Juegos que faltan */}
            <div style={col}>
              <div className="spread" style={{ marginBottom: 6 }}>
                <h3 style={{ margin: 0 }}>Juegos que faltan</h3>
                <span className="muted" style={{ fontSize: 13 }}>{filled}/{data.remaining.length} simulados</span>
              </div>
              {remainingByGroup.map(([groupName, list]) => (
                <div key={groupName} className="panel" style={{ padding: 12 }}>
                  <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>{groupName}</div>
                  {list.map((g) => (
                    <div key={g.idx} style={gameRow}>
                      <span style={teamCell} title={g.teamA.name}>
                        <TeamLogo logoUrl={g.teamA.logoUrl} color={g.teamA.color} name={g.teamA.name} size={16} />
                        <span style={ellip}>{g.teamA.name}</span>
                      </span>
                      <input type="number" min="0" style={scoreInput}
                        value={results[g.idx]?.a ?? ''} onChange={(e) => setScore(g.idx, 'a', e.target.value)} />
                      <span className="muted">-</span>
                      <input type="number" min="0" style={scoreInput}
                        value={results[g.idx]?.b ?? ''} onChange={(e) => setScore(g.idx, 'b', e.target.value)} />
                      <span style={{ ...teamCell, justifyContent: 'flex-end' }} title={g.teamB.name}>
                        <span style={ellip}>{g.teamB.name}</span>
                        <TeamLogo logoUrl={g.teamB.logoUrl} color={g.teamB.color} name={g.teamB.name} size={16} />
                      </span>
                    </div>
                  ))}
                </div>
              ))}
              {filled > 0 && (
                <button className="btn secondary small" onClick={() => setResults({})} style={{ marginTop: 4 }}>
                  Reiniciar simulación
                </button>
              )}
            </div>

            {/* Tabla proyectada */}
            <div style={col}>
              <h3 style={{ marginTop: 0 }}>Tabla proyectada</h3>
              {standings.map((grp) => (
                <div key={grp.groupId} className="panel" style={{ padding: 12 }}>
                  <h4 style={{ margin: '0 0 8px' }}>{grp.groupName}</h4>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr><th>#</th><th>Equipo</th><th>JJ</th><th>G</th><th>P</th><th>PCT</th><th>DIF</th></tr>
                      </thead>
                      <tbody>
                        {grp.rows.map((r) => {
                          const zone = r.rank <= 2 ? ZONE.directo : r.rank <= 6 ? ZONE.comodin : null;
                          return (
                            <tr key={r.teamId}>
                              <td>
                                <span style={{
                                  display: 'inline-block', minWidth: 18, textAlign: 'center', borderRadius: 4,
                                  background: zone ? zone.bg : 'transparent', color: zone ? zone.fg : 'inherit',
                                  fontWeight: zone ? 700 : 400,
                                }}>{r.rank}</span>
                              </td>
                              <td>
                                <TeamLogo logoUrl={r.logoUrl} color={r.color} name={r.name} size={18} />{r.name}
                              </td>
                              <td>{r.g}</td><td>{r.w}</td><td>{r.l}</td>
                              <td>{r.pct.toFixed(3)}</td>
                              <td style={{ color: r.diff > 0 ? 'var(--green)' : r.diff < 0 ? '#ff7a7a' : 'inherit' }}>
                                {r.diff > 0 ? `+${r.diff}` : r.diff}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
              <p className="muted" style={{ fontSize: 12 }}>
                Posición proyectada: <span style={{ color: ZONE.directo.fg }}>1-2 = Directo</span> ·{' '}
                <span style={{ color: ZONE.comodin.fg }}>3-6 = Comodín</span> (por grupo).
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const overlay = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000,
  display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
  overflow: 'auto', padding: 16,
};
const modal = {
  background: 'var(--panel, #11161d)', border: '1px solid var(--border, #273040)',
  borderRadius: 12, padding: 18, width: '100%', maxWidth: 1040, margin: 'auto',
};
const grid = { display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' };
const col = { flex: '1 1 340px', minWidth: 0 };
const gameRow = {
  display: 'grid', gridTemplateColumns: '1fr 52px 10px 52px 1fr',
  alignItems: 'center', gap: 6, padding: '5px 0',
};
const teamCell = { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, fontSize: 14 };
const ellip = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const scoreInput = { width: 52, textAlign: 'center', padding: '4px 2px' };
