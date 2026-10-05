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

const BAT_COLS = [
  ['ab', 'VB'], ['r', 'C'], ['h', 'H'], ['b2', '2B'], ['b3', '3B'], ['hr', 'HR'],
  ['rbi', 'CI'], ['bb', 'BB'], ['so', 'K'], ['hbp', 'HBP'], ['sf', 'SF'], ['sb', 'SB'],
];
const PIT_COLS = [
  ['h', 'H'], ['r', 'C'], ['er', 'CL'], ['bb', 'BB'], ['so', 'K'], ['hr', 'HR'], ['bf', 'BE'],
];

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
      <p className="subtitle">Jornada {g.round}{g.game_date ? ` · ${g.game_date}` : ''}</p>

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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
          if (b && BAT_COLS.some(([k]) => Number(b[k]) > 0)) {
            batting.push({ player_id: player.id, team_id: teamId,
              ...Object.fromEntries(BAT_COLS.map(([k]) => [k, Number(b[k]) || 0])) });
          }
          const p = pit[player.id];
          if (p && (ipToOuts(p.ip) > 0 || PIT_COLS.some(([k]) => Number(p[k]) > 0))) {
            pitching.push({ player_id: player.id, team_id: teamId,
              outs: ipToOuts(p.ip),
              ...Object.fromEntries(PIT_COLS.map(([k]) => [k, Number(p[k]) || 0])),
              win: p.win ? 1 : 0, loss: p.loss ? 1 : 0, save: p.save ? 1 : 0 });
          }
        }
      }
      await api.post(`/games/${game.id}/boxscore`, { batting, pitching });
      onSaved();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <p className="muted">
        Escribe las estadísticas de cada jugador. El marcador se calcula solo con las carreras (C).
        IP usa notación béisbol: 6.2 = 6 entradas y 2 outs.
      </p>
      {error && <div className="error">{error}</div>}

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
