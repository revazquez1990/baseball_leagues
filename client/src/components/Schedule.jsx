import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import TeamLogo from './TeamLogo.jsx';

export default function Schedule({ leagueId, teams = [], isAdmin }) {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/leagues/${leagueId}/games`).then(setGames).finally(() => setLoading(false));
  }, [leagueId]);
  useEffect(load, [load]);

  if (loading) return <div className="empty">Cargando…</div>;

  // El calendario muestra solo la temporada regular; los playoffs van aparte.
  const regular = games.filter((g) => g.stage !== 'playoff');
  const shown = regular.filter((g) =>
    filter === 'all' ? true : filter === 'final' ? g.status === 'final' : g.status === 'scheduled'
  );

  const byRound = {};
  for (const g of shown) (byRound[g.round] ||= []).push(g);
  const rounds = Object.keys(byRound).map(Number).sort((a, b) => a - b);
  const nextRound = regular.length ? Math.max(...regular.map((g) => g.round)) + 1 : 1;

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
                     onAdded={() => { setShowAdd(false); load(); }} />
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
              <GameRow key={g.id} game={g} isAdmin={isAdmin} onChange={load} />
            ))}
          </div>
        ))
      )}
    </div>
  );
}

function AddGameForm({ leagueId, teams, defaultRound, onAdded }) {
  const [away, setAway] = useState('');
  const [home, setHome] = useState('');
  const [round, setRound] = useState(defaultRound);
  const [date, setDate] = useState('');
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
        round: Number(round) || 1, game_date: date || null, group_id: groupId,
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
          {game.game_date && <span className="muted" style={{ marginLeft: 10, fontSize: 13 }}>{fmtDate(game.game_date)}</span>}
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
    await api.put(`/games/${game.id}`, { game_date: date || null, round: Number(round) || 1 });
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
        <div style={{ maxWidth: 100 }}><label>Jornada</label>
          <input type="number" min="1" value={round} onChange={(e) => setRound(e.target.value)} /></div>
        <div style={{ alignSelf: 'flex-end' }}>
          <button className="btn secondary small" onClick={saveMeta} disabled={busy}>Guardar fecha/jornada</button>
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
