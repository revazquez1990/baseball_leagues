import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import TeamLogo from './TeamLogo.jsx';

export default function Schedule({ leagueId, teams = [], isAdmin }) {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [showAdd, setShowAdd] = useState(false);

  // Refresco silencioso: actualiza los datos sin pasar por "Cargando…", para no
  // re-renderizar todo el calendario ni cerrar el acordeón al agregar un juego.
  const refresh = useCallback(
    () => api.get(`/leagues/${leagueId}/games`).then(setGames),
    [leagueId]
  );
  useEffect(() => {
    setLoading(true);
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  if (loading) return <div className="empty">Cargando…</div>;

  // El calendario muestra solo la temporada regular; los playoffs van aparte.
  const regular = games.filter((g) => g.stage !== 'playoff');
  const shown = regular.filter((g) =>
    filter === 'all' ? true : filter === 'final' ? g.status === 'final' : g.status === 'scheduled'
  );

  const byRound = {};
  for (const g of shown) (byRound[g.round] ||= []).push(g);
  const rounds = Object.keys(byRound).map(Number).sort((a, b) => a - b);
  const lastRound = regular.length ? Math.max(...regular.map((g) => g.round)) : 1;
  const nextRound = regular.length ? lastRound + 1 : 1;

  return (
    <div>
      <div className="spread">
        <div className="tabs" style={{ border: 'none', marginBottom: 10 }}>
          {[['all', 'Todos'], ['scheduled', 'Pendientes'], ['final', 'Jugados']].map(([k, l]) => (
            <div key={k} className={`tab ${filter === k ? 'active' : ''}`} onClick={() => setFilter(k)}>{l}</div>
          ))}
        </div>
        {isAdmin && (
          <button className="btn" onClick={() => setShowAdd((s) => !s)}>
            {showAdd ? 'Cancelar' : '+ Agregar juego'}
          </button>
        )}
      </div>

      {isAdmin && showAdd && (
        <AddGameForm leagueId={leagueId} teams={teams} defaultRound={nextRound}
                     onAdded={() => { setShowAdd(false); refresh(); }} />
      )}

      {regular.length === 0 ? (
        <div className="empty">
          Aún no hay calendario. {isAdmin && 'Genéralo desde el panel de administración o agrega juegos manualmente.'}
        </div>
      ) : (
        rounds.map((r) => (
          <div className="panel" key={r}>
            <h3 style={{ marginTop: 0 }}>Jornada {r}</h3>
            {byRound[r].map((g) => (
              <GameRow key={g.id} game={g} isAdmin={isAdmin} onChange={refresh} />
            ))}
          </div>
        ))
      )}

      <MissingGames leagueId={leagueId} isAdmin={isAdmin} targetRound={lastRound} onChanged={refresh} />
    </div>
  );
}

// Acordeón con los juegos que faltan por programar (deducidos del
// todos-contra-todos). Para cada uno el admin elige local y fecha, y lo
// agrega al calendario de una.
function MissingGames({ leagueId, isAdmin, targetRound, onChanged }) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState(null);

  const load = useCallback(() => {
    api.get(`/leagues/${leagueId}/missing-games`).then((d) => setList(d.missing || []));
  }, [leagueId]);
  useEffect(load, [load]);

  if (!list) return null;

  return (
    <div className="panel">
      <div className="spread" style={{ cursor: 'pointer' }} onClick={() => setOpen((o) => !o)}>
        <h3 style={{ margin: 0 }}>{open ? '▾' : '▸'} Juegos por jugar ({list.length})</h3>
        <span className="muted" style={{ fontSize: 13 }}>
          {list.length ? 'Faltan por programar' : 'Todos programados'}
        </span>
      </div>

      {open && (
        list.length === 0 ? (
          <div className="empty" style={{ marginTop: 10 }}>No falta ningún juego por programar.</div>
        ) : (
          <div style={{ marginTop: 6 }}>
            {list.map((m, i) => (
              <MissingRow
                key={`${m.teamA.id}-${m.teamB.id}-${i}`}
                m={m} leagueId={leagueId} isAdmin={isAdmin} targetRound={targetRound}
                onAdded={() => { load(); onChanged && onChanged(); }}
              />
            ))}
          </div>
        )
      )}
    </div>
  );
}

function MissingRow({ m, leagueId, isAdmin, targetRound, onAdded }) {
  const [home, setHome] = useState(String(m.teamA.id));
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const homeId = Number(home);
  const awayId = homeId === m.teamA.id ? m.teamB.id : m.teamA.id;

  async function add() {
    setBusy(true); setError('');
    try {
      await api.post(`/leagues/${leagueId}/games`, {
        home_team_id: homeId, away_team_id: awayId,
        round: Number(targetRound) || 1, game_date: date || null, group_id: m.groupId ?? null,
      });
      onAdded();
    } catch (err) { setError(err.message); setBusy(false); }
  }

  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <div className="spread" style={{ gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          {m.groupName && <span className="pill" style={{ marginRight: 8 }}>{m.groupName}</span>}
          <TeamLogo logoUrl={m.teamA.logoUrl} color={m.teamA.color} name={m.teamA.name} size={18} />{m.teamA.name}
          <span className="muted"> vs </span>
          <TeamLogo logoUrl={m.teamB.logoUrl} color={m.teamB.color} name={m.teamB.name} size={18} />{m.teamB.name}
        </div>
        {isAdmin && (
          <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ maxWidth: 160 }}>
              <label style={{ fontSize: 11 }}>Local</label>
              <select value={home} onChange={(e) => setHome(e.target.value)}>
                <option value={m.teamA.id}>{m.teamA.name}</option>
                <option value={m.teamB.id}>{m.teamB.name}</option>
              </select>
            </div>
            <div style={{ maxWidth: 160 }}>
              <label style={{ fontSize: 11 }}>Fecha</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <button className="btn small" onClick={add} disabled={busy}>Agregar al calendario</button>
          </div>
        )}
      </div>
      {error && <div className="error">{error}</div>}
    </div>
  );
}

function AddGameForm({ leagueId, teams, defaultRound, onAdded }) {
  const [away, setAway] = useState('');
  const [home, setHome] = useState('');
  const [round, setRound] = useState(defaultRound);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError('');
    if (!home || !away || home === away) { setError('Elige dos equipos distintos'); return; }
    const h = teams.find((t) => String(t.id) === String(home));
    const a = teams.find((t) => String(t.id) === String(away));
    const groupId = h && a && h.group_id && h.group_id === a.group_id ? h.group_id : null;
    setBusy(true);
    try {
      await api.post(`/leagues/${leagueId}/games`, {
        home_team_id: Number(home), away_team_id: Number(away),
        round: Number(round) || 1, game_date: date || null, game_time: time || null, group_id: groupId,
      });
      onAdded();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="panel" style={{ borderColor: 'var(--accent-2)' }}>
      <h4 style={{ marginTop: 0 }}>Agregar juego</h4>
      <div className="form-row">
        <div><label>Visitante</label>
          <select value={away} onChange={(e) => setAway(e.target.value)}>
            <option value="">—</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div><label>Local</label>
          <select value={home} onChange={(e) => setHome(e.target.value)}>
            <option value="">—</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div style={{ maxWidth: 110 }}><label>Jornada</label>
          <input type="number" min="1" value={round} onChange={(e) => setRound(e.target.value)} /></div>
        <div style={{ maxWidth: 170 }}><label>Fecha (Vie/Sáb/Dom)</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div style={{ maxWidth: 120 }}><label>Horario</label>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
      </div>
      {error && <div className="error">{error}</div>}
      <button className="btn" onClick={submit} disabled={busy}>Agregar juego</button>
    </div>
  );
}

function GameRow({ game, isAdmin, onChange }) {
  const [editing, setEditing] = useState(false);
  const isFinal = game.status === 'final';
  const homeWin = isFinal && game.home_score > game.away_score;
  const awayWin = isFinal && game.away_score > game.home_score;

  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <div className="spread">
        <div style={{ flex: 1 }}>
          {game.group_name && <span className="pill" style={{ marginRight: 8 }}>{game.group_name}</span>}
          <span className={awayWin ? 'win' : ''}>
            <TeamLogo logoUrl={game.away_logo} color={game.away_color} name={game.away_name} size={18} />{game.away_name}
          </span>
          <span className="muted"> @ </span>
          <span className={homeWin ? 'win' : ''}>
            <TeamLogo logoUrl={game.home_logo} color={game.home_color} name={game.home_name} size={18} />{game.home_name}
          </span>
          {(game.game_date || game.game_time) && (
            <span className="muted" style={{ marginLeft: 10, fontSize: 13 }}>
              {game.game_date ? fmtDate(game.game_date) : ''}
              {game.game_time ? `${game.game_date ? ' · ' : ''}${String(game.game_time).slice(0, 5)}` : ''}
            </span>
          )}
        </div>
        <div className="row">
          {isFinal
            ? <span className="score">{game.away_score} - {game.home_score}</span>
            : <span className="pill sched">Pendiente</span>}
          <Link to={`/games/${game.id}`} className="btn secondary small">
            {isAdmin ? 'Boxscore' : 'Ver'}
          </Link>
          {isAdmin && (
            <button className="btn secondary small" onClick={() => setEditing((e) => !e)}>⚙</button>
          )}
        </div>
      </div>

      {isAdmin && editing && (
        <GameEditor game={game} onDone={() => { setEditing(false); onChange(); }} />
      )}
    </div>
  );
}

function GameEditor({ game, onDone }) {
  const [date, setDate] = useState(game.game_date ? game.game_date.slice(0, 10) : '');
  const [time, setTime] = useState(game.game_time ? String(game.game_time).slice(0, 5) : '');
  const [round, setRound] = useState(game.round);
  const [awayScore, setAwayScore] = useState(game.away_score ?? '');
  const [homeScore, setHomeScore] = useState(game.home_score ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function run(fn, okMsg) {
    setBusy(true); setMsg('');
    try { await fn(); setMsg(okMsg || ''); if (okMsg === 'done') onDone(); }
    finally { setBusy(false); }
  }

  const saveMeta = () => run(async () => {
    await api.put(`/games/${game.id}`, { game_date: date || null, game_time: time || null, round: Number(round) || 1 });
    onDone();
  }, 'done');

  const saveResult = () => run(async () => {
    await api.put(`/games/${game.id}/result`, {
      away_score: awayScore === '' ? 0 : Number(awayScore),
      home_score: homeScore === '' ? 0 : Number(homeScore),
    });
    onDone();
  }, 'done');

  const clearResult = () => run(async () => {
    await api.put(`/games/${game.id}/result`, { away_score: null, home_score: null });
    onDone();
  }, 'done');

  const del = () => {
    if (!confirm('¿Eliminar este juego?')) return;
    run(async () => { await api.del(`/games/${game.id}`); onDone(); }, 'done');
  };

  return (
    <div style={{ marginTop: 10, padding: 12, background: 'var(--panel-2)', borderRadius: 8 }}>
      <div className="form-row" style={{ marginBottom: 6 }}>
        <div style={{ maxWidth: 170 }}><label>Fecha</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div style={{ maxWidth: 120 }}><label>Horario</label>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
        <div style={{ maxWidth: 100 }}><label>Jornada</label>
          <input type="number" min="1" value={round} onChange={(e) => setRound(e.target.value)} /></div>
        <div style={{ alignSelf: 'flex-end' }}>
          <button className="btn secondary small" onClick={saveMeta} disabled={busy}>Guardar fecha/horario</button>
        </div>
      </div>

      <div className="form-row" style={{ marginBottom: 6 }}>
        <div style={{ maxWidth: 110 }}><label>Carreras visitante</label>
          <input type="number" min="0" value={awayScore} onChange={(e) => setAwayScore(e.target.value)} /></div>
        <div style={{ maxWidth: 110 }}><label>Carreras local</label>
          <input type="number" min="0" value={homeScore} onChange={(e) => setHomeScore(e.target.value)} /></div>
        <div style={{ alignSelf: 'flex-end' }} className="row">
          <button className="btn small" onClick={saveResult} disabled={busy}>Guardar resultado</button>
          {game.status === 'final' && (
            <button className="btn secondary small" onClick={clearResult} disabled={busy}>Marcar pendiente</button>
          )}
        </div>
      </div>

      <div className="spread">
        <span className="muted" style={{ fontSize: 12 }}>
          El resultado rápido actualiza posiciones. Para líderes y estadísticas de jugadores usa el boxscore.
        </span>
        <button className="btn danger small" onClick={del} disabled={busy}>Eliminar juego</button>
      </div>
    </div>
  );
}

function fmtDate(d) {
  // d viene como 'yyyy-mm-dd' o ISO; muestra con día de semana abreviado.
  const date = new Date(`${String(d).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return String(d);
  return date.toLocaleDateString('es', { weekday: 'short', day: '2-digit', month: 'short' });
}
