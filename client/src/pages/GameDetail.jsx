import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

// Conversión entre entradas (notación béisbol "6.2") y outs.
function ipToOuts(ip) {
  if (ip === '' || ip == null) return 0;
  const n = Number(ip);
  if (Number.isNaN(n)) return 0;
  const whole = Math.floor(n);
  const frac = Math.round((n - whole) * 10); // 0,1,2
  return whole * 3 + Math.min(2, Math.max(0, frac));
}
function outsToIp(outs) {
  return `${Math.floor(outs / 3)}.${outs % 3}`;
}

// Formatea fecha (y horario opcional) para mostrar.
function fmtDateTime(d, t) {
  let out = '';
  if (d) {
    const date = new Date(`${String(d).slice(0, 10)}T12:00:00`);
    out = Number.isNaN(date.getTime())
      ? String(d).slice(0, 10)
      : date.toLocaleDateString('es', { weekday: 'short', day: '2-digit', month: 'short' });
  }
  if (t) out += `${out ? ' · ' : ''}${String(t).slice(0, 5)}`;
  return out;
}

// Columnas de bateo visibles en el boxscore. Las demás (C, 2B, 3B, K, HBP,
// SF, SB) no se anotan por ahora y quedan ocultas (se guardan en 0).
const BAT_COLS = [
  ['ab', 'VB'], ['h', 'H'], ['hr', 'HR'], ['rbi', 'CI'], ['bb', 'BB'],
];
// Columnas de pitcheo visibles en el boxscore. Las demás (H, C, BB, HR, BE)
// no se anotan por ahora y quedan ocultas (se guardan en 0).
const PIT_COLS = [
  ['er', 'CL'], ['so', 'K'],
];

// Campos completos (para guardar todo lo que se parsee, aunque algunas
// columnas estén ocultas en la vista).
const ALL_BAT = ['ab', 'r', 'h', 'b2', 'b3', 'hr', 'rbi', 'bb', 'so', 'hbp', 'sf', 'sb'];
const ALL_PIT = ['h', 'r', 'er', 'bb', 'so', 'hr', 'bf'];

// Códigos de estadística aceptados en el texto pegado.
const CODE_MAP = {
  CI: 'rbi', RBI: 'rbi', BB: 'bb', HR: 'hr', '2B': 'b2', '3B': 'b3',
  K: 'so', SO: 'so', HBP: 'hbp', SF: 'sf', SB: 'sb', C: 'r', R: 'r', H: 'h',
};

// Normaliza un nombre para comparar (minúsculas, sin acentos ni signos).
function normName(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Distancia de edición (Levenshtein) para tolerar errores de tipeo.
function lev(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n; if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

// Coste de emparejar dos palabras (0 = iguales; Infinity = demasiado distintas).
function wordCost(qw, pw) {
  if (qw === pw) return 0;
  const tol = qw.length >= 5 ? 2 : qw.length >= 4 ? 1 : 0;
  const d = lev(qw, pw);
  return d <= tol ? d : Infinity;
}

// Empareja un nombre con el jugador de la nómina: cada palabra del nombre debe
// coincidir (con tolerancia a erratas) con alguna palabra del jugador. Elige el
// de menor coste. Tolera "Yasniel"≈"Yasnier", "Montesinos"≈"Montesino", etc.
function matchPlayer(name, players) {
  const qWords = normName(name).split(' ').filter(Boolean);
  if (qWords.length === 0) return null;
  let best = null, bestCost = Infinity;
  for (const p of players) {
    const pWords = normName(p.name).split(' ').filter(Boolean);
    let cost = 0, ok = true;
    for (const qw of qWords) {
      let min = Infinity;
      for (const pw of pWords) min = Math.min(min, wordCost(qw, pw));
      if (min === Infinity) { ok = false; break; }
      cost += min;
    }
    if (ok && cost < bestCost) { bestCost = cost; best = p; }
  }
  return best;
}

// Parsea el texto del boxscore al formato rápido.
function parseBoxscorePaste(text) {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const batting = [], pitching = [];
  let mode = 'bat', current = null;

  for (const line of lines) {
    if (/lanzador/i.test(line)) { mode = 'pit'; current = null; continue; }

    if (mode === 'bat') {
      // Nombre : [VB-H] [, extras]. El VB-H es opcional: un bateador puede no
      // tener vez al bate oficial (p. ej. solo BB/CI) y aun así registrarse.
      const m = line.match(/^-?\s*(.+?)\s*:\s*(.*)$/);
      if (!m) continue;
      let rest = m[2].trim();
      const stats = { ab: 0, h: 0 };
      // ¿Comienza con VB-H? (dos números separados por guion).
      const vbh = rest.match(/^(\d+)\s*-\s*(\d+)\s*(.*)$/);
      let hadVbh = false;
      if (vbh) {
        stats.ab = Number(vbh[1]);
        stats.h = Number(vbh[2]);
        rest = vbh[3];
        hadVbh = true;
      }
      for (const ex of rest.split(',').map((s) => s.trim()).filter(Boolean)) {
        const em = ex.match(/^(\d+)\s*([A-Za-z0-9]+)$/);
        if (!em) continue;
        const field = CODE_MAP[em[2].toUpperCase()];
        if (field) stats[field] = (stats[field] || 0) + Number(em[1]);
      }
      // Con VB-H se registra siempre (incluso 0-0). Sin VB-H, solo si hay algún
      // dato que anotar (BB, CI, etc.); así una línea vacía no crea registro.
      if (hadVbh || Object.values(stats).some((v) => Number(v) > 0)) {
        batting.push({ name: m[1], stats });
      }
    } else {
      if (/^-/.test(line) && !line.includes(':')) {
        let name = line.replace(/^-\s*/, '');
        let decision = null;
        const dm = name.match(/\(([^)]+)\)/);
        if (dm) {
          const d = dm[1].toLowerCase();
          if (/gana/.test(d)) decision = 'win';
          else if (/pierde|perded/.test(d)) decision = 'loss';
          else if (/salv/.test(d)) decision = 'save';
          name = name.replace(dm[0], '').trim();
        }
        current = { name, ip: '', er: 0, so: 0, decision };
        pitching.push(current);
      } else if (current) {
        const em = line.match(/entrada[s]?\s*:\s*([\d.]+)/i);
        const cm = line.match(/limpia[s]?\s*:\s*(\d+)/i);
        const pm = line.match(/ponche[s]?\s*:\s*(\d+)/i);
        if (em) current.ip = em[1];
        else if (cm) current.er = Number(cm[1]);
        else if (pm) current.so = Number(pm[1]);
      }
    }
  }
  return { batting, pitching };
}

export default function GameDetail() {
  const { id } = useParams();
  const { isAdmin } = useAuth();
  const [game, setGame] = useState(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(() => {
    api.get(`/games/${id}`).then((d) => setGame(d));
  }, [id]);
  useEffect(load, [load]);

  if (!game) return <div className="empty">Cargando…</div>;
  const g = game.game;

  return (
    <div>
      <div style={{ marginTop: 18 }}>
        <Link to={`/leagues/${g.league_id}`} className="muted">← Volver a la liga</Link>
      </div>
      <div className="spread" style={{ marginTop: 8 }}>
        <h1 className="title" style={{ margin: 0 }}>
          <span className="tag" style={{ background: g.away_color }} />{g.away_name}
          <span className="muted"> @ </span>
          <span className="tag" style={{ background: g.home_color }} />{g.home_name}
        </h1>
        {g.status === 'final'
          ? <span className="score">{g.away_score} - {g.home_score}</span>
          : <span className="pill sched">Pendiente</span>}
      </div>
      <p className="subtitle">
        {g.stage === 'playoff' ? 'Playoff' : `Jornada ${g.round}`}
        {(g.game_date || g.game_time) ? ` · ${fmtDateTime(g.game_date, g.game_time)}` : ''}
      </p>

      {isAdmin && (
        <button className="btn" onClick={() => setEditing((e) => !e)} style={{ marginBottom: 16 }}>
          {editing ? 'Cancelar edición' : (g.status === 'final' ? 'Editar boxscore' : 'Cargar boxscore')}
        </button>
      )}

      {editing ? (
        <BoxscoreEditor game={g} existing={game} onSaved={() => { setEditing(false); load(); }} />
      ) : (
        <BoxscoreView game={game} />
      )}
    </div>
  );
}

// ---------- Vista de solo lectura ----------
function BoxscoreView({ game }) {
  const { game: g, batting, pitching } = game;
  if (g.status !== 'final') {
    return <div className="empty">Este juego aún no tiene boxscore cargado.</div>;
  }
  const teamBat = (teamId) => batting.filter((b) => b.team_id === teamId);
  const teamPit = (teamId) => pitching.filter((p) => p.team_id === teamId);

  return (
    <div>
      {[[g.away_team_id, g.away_name], [g.home_team_id, g.home_name]].map(([tid, name]) => (
        <div className="panel" key={tid}>
          <h3 style={{ marginTop: 0 }}>{name}</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Jugador</th>{BAT_COLS.map(([k, l]) => <th key={k}>{l}</th>)}</tr></thead>
              <tbody>
                {teamBat(tid).map((b) => (
                  <tr key={b.id}>
                    <td>{b.name}</td>
                    {BAT_COLS.map(([k]) => <td key={k}>{b[k]}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {teamPit(tid).length > 0 && (
            <div className="table-wrap" style={{ marginTop: 12 }}>
              <table>
                <thead><tr><th>Lanzador</th><th>IP</th>{PIT_COLS.map(([k, l]) => <th key={k}>{l}</th>)}<th>Dec.</th></tr></thead>
                <tbody>
                  {teamPit(tid).map((p) => (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td>{outsToIp(p.outs)}</td>
                      {PIT_COLS.map(([k]) => <td key={k}>{p[k]}</td>)}
                      <td>{p.win ? 'G' : p.loss ? 'P' : p.save ? 'S' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------- Editor ----------
function BoxscoreEditor({ game, existing, onSaved }) {
  const [rosters, setRosters] = useState({ home: [], away: [] });
  const [bat, setBat] = useState({});   // playerId -> {ab,r,...}
  const [pit, setPit] = useState({});   // playerId -> {ip,h,...}
  const [awayRuns, setAwayRuns] = useState(game.away_score ?? '');
  const [homeRuns, setHomeRuns] = useState(game.home_score ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [pasteResult, setPasteResult] = useState(null);

  function applyPaste() {
    const parsed = parseBoxscorePaste(pasteText);
    const all = [...rosters.away, ...rosters.home];
    const matched = [], unmatched = [];
    setBat((prev) => {
      const next = { ...prev };
      for (const b of parsed.batting) {
        const p = matchPlayer(b.name, all);
        if (!p) { unmatched.push(b.name); continue; }
        next[p.id] = { ...(next[p.id] || {}), ...b.stats };
        matched.push(b.name);
      }
      return next;
    });
    setPit((prev) => {
      const next = { ...prev };
      for (const pt of parsed.pitching) {
        const p = matchPlayer(pt.name, all);
        if (!p) { unmatched.push(pt.name); continue; }
        next[p.id] = {
          ...(next[p.id] || {}), ip: pt.ip, er: pt.er, so: pt.so,
          win: pt.decision === 'win', loss: pt.decision === 'loss', save: pt.decision === 'save',
        };
        matched.push(pt.name);
      }
      return next;
    });
    setPasteResult({ matched: matched.length, unmatched });
  }

  useEffect(() => {
    Promise.all([
      api.get(`/teams/${game.home_team_id}/players`),
      api.get(`/teams/${game.away_team_id}/players`),
    ]).then(([home, away]) => setRosters({ home, away }));

    // Precarga líneas existentes.
    const b = {};
    for (const line of existing.batting) {
      b[line.player_id] = Object.fromEntries(BAT_COLS.map(([k]) => [k, line[k]]));
    }
    const p = {};
    for (const line of existing.pitching) {
      p[line.player_id] = {
        ip: outsToIp(line.outs),
        ...Object.fromEntries(PIT_COLS.map(([k]) => [k, line[k]])),
        win: line.win, loss: line.loss, save: line.save,
      };
    }
    setBat(b); setPit(p);
  }, [game, existing]);

  const setBatVal = (pid, key, val) =>
    setBat((s) => ({ ...s, [pid]: { ...s[pid], [key]: val } }));
  const setPitVal = (pid, key, val) =>
    setPit((s) => ({ ...s, [pid]: { ...s[pid], [key]: val } }));

  async function save() {
    setBusy(true); setError('');
    try {
      const batting = [];
      const pitching = [];
      for (const side of ['home', 'away']) {
        const teamId = side === 'home' ? game.home_team_id : game.away_team_id;
        for (const player of rosters[side]) {
          const b = bat[player.id];
          if (b && ALL_BAT.some((k) => Number(b[k]) > 0)) {
            batting.push({ player_id: player.id, team_id: teamId,
              ...Object.fromEntries(ALL_BAT.map((k) => [k, Number(b[k]) || 0])) });
          }
          const p = pit[player.id];
          if (p && (ipToOuts(p.ip) > 0 || ALL_PIT.some((k) => Number(p[k]) > 0))) {
            pitching.push({ player_id: player.id, team_id: teamId,
              outs: ipToOuts(p.ip),
              ...Object.fromEntries(ALL_PIT.map((k) => [k, Number(p[k]) || 0])),
              win: p.win ? 1 : 0, loss: p.loss ? 1 : 0, save: p.save ? 1 : 0 });
          }
        }
      }
      await api.post(`/games/${game.id}/boxscore`, {
        batting, pitching,
        awayScore: awayRuns === '' ? 0 : Number(awayRuns),
        homeScore: homeRuns === '' ? 0 : Number(homeRuns),
      });
      onSaved();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <p className="muted">
        Escribe las estadísticas de cada jugador. El marcador (carreras) se pone aquí abajo.
        IP usa notación béisbol: 6.2 = 6 entradas y 2 outs.
      </p>
      {error && <div className="error">{error}</div>}

      <div className="panel" style={{ borderColor: 'var(--accent-2)' }}>
        <h3 style={{ marginTop: 0 }}>Pegar resultados (rápido)</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          Bateo: <code>-Nombre:VB-H,1CI,1BB</code> por línea. El VB-H es opcional
          si el bateador no tuvo veces al bate: <code>-Nombre:3BB,1CI</code>. Pitcheo: tras una
          línea con «lanzadores», <code>-Nombre(ganador)</code> y debajo
          <code> Entradas:2.1</code>, <code>Carreras limpias:5</code>,
          <code> Ponches:0</code>. Empareja por nombre con la nómina de ambos equipos.
        </p>
        <textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          rows={6}
          placeholder={'-Henry Llanes:3-2,1CI,1BB\n-Oscar Bencomo:4-0\nLabor de los lanzadores\n-Yairan Clavel(ganador)\nEntradas:3.2\nCarreras limpias:1\nPonches:0'}
          style={{ width: '100%', fontFamily: 'monospace', fontSize: 13, padding: 10,
                   borderRadius: 8, border: '1px solid var(--border)',
                   background: 'var(--panel-2)', color: 'var(--text)', resize: 'vertical' }}
        />
        <div className="row" style={{ marginTop: 8 }}>
          <button type="button" className="btn secondary" onClick={applyPaste} disabled={!pasteText.trim()}>
            Aplicar al boxscore
          </button>
          {pasteResult && (
            <span className="muted" style={{ fontSize: 13 }}>
              Aplicados: {pasteResult.matched}.
              {pasteResult.unmatched.length > 0 && (
                <span style={{ color: '#ff7a7a' }}> No encontrados: {pasteResult.unmatched.join(', ')}</span>
              )}
            </span>
          )}
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          Revisa las tablas de abajo y pon el marcador antes de guardar.
        </p>
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Marcador final</h3>
        <div className="form-row">
          <div style={{ maxWidth: 150 }}>
            <label>Carreras {game.away_name} (visitante)</label>
            <input type="number" min="0" value={awayRuns}
                   onChange={(e) => setAwayRuns(e.target.value)} />
          </div>
          <div style={{ maxWidth: 150 }}>
            <label>Carreras {game.home_name} (local)</label>
            <input type="number" min="0" value={homeRuns}
                   onChange={(e) => setHomeRuns(e.target.value)} />
          </div>
        </div>
      </div>

      {[['away', game.away_name, game.away_team_id], ['home', game.home_name, game.home_team_id]].map(
        ([side, name]) => (
          <div className="panel" key={side}>
            <h3 style={{ marginTop: 0 }}>{name} — Bateo</h3>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Jugador</th>{BAT_COLS.map(([k, l]) => <th key={k}>{l}</th>)}</tr></thead>
                <tbody>
                  {rosters[side].map((pl) => (
                    <tr key={pl.id}>
                      <td>{pl.number ? `${pl.number} ` : ''}{pl.name}</td>
                      {BAT_COLS.map(([k]) => (
                        <td key={k}>
                          <input type="number" min="0" style={{ width: 52 }}
                                 value={bat[pl.id]?.[k] ?? ''}
                                 onChange={(e) => setBatVal(pl.id, k, e.target.value)} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3>{name} — Pitcheo</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Lanzador</th><th>IP</th>{PIT_COLS.map(([k, l]) => <th key={k}>{l}</th>)}
                    <th>G</th><th>P</th><th>SV</th></tr>
                </thead>
                <tbody>
                  {rosters[side].map((pl) => (
                    <tr key={pl.id}>
                      <td>{pl.number ? `${pl.number} ` : ''}{pl.name}</td>
                      <td><input style={{ width: 52 }} placeholder="0.0"
                                 value={pit[pl.id]?.ip ?? ''}
                                 onChange={(e) => setPitVal(pl.id, 'ip', e.target.value)} /></td>
                      {PIT_COLS.map(([k]) => (
                        <td key={k}>
                          <input type="number" min="0" style={{ width: 52 }}
                                 value={pit[pl.id]?.[k] ?? ''}
                                 onChange={(e) => setPitVal(pl.id, k, e.target.value)} />
                        </td>
                      ))}
                      {['win', 'loss', 'save'].map((dec) => (
                        <td key={dec}>
                          <input type="checkbox" style={{ width: 'auto' }}
                                 checked={!!pit[pl.id]?.[dec]}
                                 onChange={(e) => setPitVal(pl.id, dec, e.target.checked)} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      <button className="btn" onClick={save} disabled={busy}>
        {busy ? 'Guardando…' : '💾 Guardar boxscore'}
      </button>
    </div>
  );
}
