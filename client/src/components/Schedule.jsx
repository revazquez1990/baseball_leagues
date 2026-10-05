import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

export default function Schedule({ leagueId, isAdmin }) {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/leagues/${leagueId}/games`).then(setGames).finally(() => setLoading(false));
  }, [leagueId]);
  useEffect(load, [load]);

  if (loading) return <div className="empty">Cargando…</div>;
  if (games.length === 0) return <div className="empty">Aún no hay calendario. {isAdmin && 'Genéralo desde el panel de administración.'}</div>;

  // El calendario muestra solo la temporada regular; los playoffs tienen su
  // propia pestaña.
  const regular = games.filter((g) => g.stage !== 'playoff');
  const shown = regular.filter((g) =>
    filter === 'all' ? true : filter === 'final' ? g.status === 'final' : g.status === 'scheduled'
  );

  // Agrupa por jornada (round).
  const byRound = {};
  for (const g of shown) (byRound[g.round] ||= []).push(g);
  const rounds = Object.keys(byRound).map(Number).sort((a, b) => a - b);

  return (
    <div>
      <div className="tabs" style={{ border: 'none', marginBottom: 10 }}>
        {[['all', 'Todos'], ['scheduled', 'Pendientes'], ['final', 'Finalizados']].map(([k, l]) => (
          <div key={k} className={`tab ${filter === k ? 'active' : ''}`} onClick={() => setFilter(k)}>{l}</div>
        ))}
      </div>

      {rounds.map((r) => (
        <div className="panel" key={r}>
          <h3 style={{ marginTop: 0 }}>Jornada {r}</h3>
          {byRound[r].map((g) => (
            <GameRow key={g.id} game={g} isAdmin={isAdmin} />
          ))}
        </div>
      ))}
    </div>
  );
}

function GameRow({ game, isAdmin }) {
  const isFinal = game.status === 'final';
  const homeWin = isFinal && game.home_score > game.away_score;
  const awayWin = isFinal && game.away_score > game.home_score;
  return (
    <div className="spread" style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ flex: 1 }}>
        {game.group_name && <span className="pill" style={{ marginRight: 8 }}>{game.group_name}</span>}
        <span className={awayWin ? 'win' : ''}>
          <span className="tag" style={{ background: game.away_color }} />{game.away_name}
        </span>
        <span className="muted"> @ </span>
        <span className={homeWin ? 'win' : ''}>
          <span className="tag" style={{ background: game.home_color }} />{game.home_name}
        </span>
        {game.game_date && <span className="muted" style={{ marginLeft: 10, fontSize: 13 }}>{game.game_date}</span>}
      </div>
      <div className="row">
        {isFinal
          ? <span className="score">{game.away_score} - {game.home_score}</span>
          : <span className="pill sched">Pendiente</span>}
        <Link to={`/games/${game.id}`} className="btn secondary small">
          {isAdmin ? (isFinal ? 'Editar' : 'Cargar boxscore') : 'Ver'}
        </Link>
      </div>
    </div>
  );
}
