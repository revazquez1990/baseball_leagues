import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

export default function Playoffs({ league, isAdmin }) {
  const [bracket, setBracket] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [qualifiers, setQualifiers] = useState(2);
  const [bestOf, setBestOf] = useState(5);

  const load = useCallback(() => {
    api.get(`/leagues/${league.id}/playoffs`).then(setBracket);
  }, [league.id]);
  useEffect(load, [load]);

  async function generate() {
    setBusy(true); setError('');
    try {
      await api.post(`/leagues/${league.id}/playoffs`, {
        qualifiers: Number(qualifiers), bestOf: Number(bestOf),
      });
      load();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!confirm('¿Eliminar todo el bracket de playoffs?')) return;
    await api.del(`/leagues/${league.id}/playoffs`);
    load();
  }

  if (!bracket) return <div className="empty">Cargando…</div>;

  const hasBracket = bracket.rounds.length > 0;

  return (
    <div>
      {isAdmin && (
        <div className="panel" style={{ borderColor: 'var(--accent-2)' }}>
          <h4 style={{ marginTop: 0 }}>Generar bracket de playoffs</h4>
          <p className="muted" style={{ marginTop: 0 }}>
            Se siembra desde la tabla de posiciones actual.
            {league.format === 'groups'
              ? ' Clasificados por cada grupo:'
              : ' Clasificados en total:'}
          </p>
          <div className="form-row">
            <div style={{ maxWidth: 160 }}>
              <label>{league.format === 'groups' ? 'Clasif. por grupo' : 'Clasificados'}</label>
              <input type="number" min="1" value={qualifiers}
                     onChange={(e) => setQualifiers(e.target.value)} />
            </div>
            <div style={{ maxWidth: 160 }}>
              <label>Serie al mejor de</label>
              <select value={bestOf} onChange={(e) => setBestOf(e.target.value)}>
                <option value="1">1 juego</option>
                <option value="3">3 juegos</option>
                <option value="5">5 juegos</option>
                <option value="7">7 juegos</option>
              </select>
            </div>
          </div>
          {error && <div className="error">{error}</div>}
          <div className="row">
            <button className="btn" onClick={generate} disabled={busy}>
              {hasBracket ? '🔄 Regenerar bracket' : '🏆 Generar bracket'}
            </button>
            {hasBracket && <button className="btn danger" onClick={remove}>Eliminar</button>}
          </div>
          {hasBracket && (
            <p className="muted" style={{ fontSize: 13 }}>
              Regenerar borra los juegos de playoffs ya cargados.
            </p>
          )}
        </div>
      )}

      {!hasBracket ? (
        <div className="empty">
          Aún no hay playoffs. {isAdmin
            ? 'Genera el bracket cuando termine (o avance) la temporada regular.'
            : 'El bracket se publicará al cerrar la fase regular.'}
        </div>
      ) : (
        <div className="bracket">
          {bracket.rounds.map((r) => (
            <div className="bracket-round" key={r.round}>
              <h4 className="bracket-round-title">{roundTitle(r, bracket.rounds.length)}</h4>
              {r.series.map((s) => (
                <SeriesCard key={s.id} series={s} isAdmin={isAdmin} onChange={load} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function roundTitle(r, total) {
  const remaining = total - (r.round - 1);
  if (remaining === 1) return 'Final';
  if (remaining === 2) return 'Semifinales';
  if (remaining === 3) return 'Cuartos de final';
  return `Ronda ${r.round}`;
}

function SeriesCard({ series: s, isAdmin, onChange }) {
  const [busy, setBusy] = useState(false);
  const bothSet = s.high.teamId && s.low.teamId;
  const done = !!s.winnerTeamId;

  async function addGame() {
    setBusy(true);
    try { await api.post(`/series/${s.id}/games`); onChange(); }
    finally { setBusy(false); }
  }

  const side = (team, isWinner) => (
    <div className={`bracket-team ${isWinner ? 'win' : ''}`}>
      <span>
        {team.teamId
          ? <Link to={`/teams/${team.teamId}`}>
              <span className="tag" style={{ background: team.color }} />{team.name}
            </Link>
          : <span className="muted">{team.name}{team.label ? ` (${team.label})` : ''}</span>}
      </span>
      <strong>{team.wins}</strong>
    </div>
  );

  return (
    <div className="card bracket-series">
      <div className="spread">
        <span className="muted" style={{ fontSize: 12 }}>{s.name}</span>
        <span className="pill">Al mejor de {s.bestOf}</span>
      </div>
      {side(s.high, s.winnerTeamId === s.high.teamId)}
      {side(s.low, s.winnerTeamId === s.low.teamId)}

      {done && <div className="ok" style={{ fontSize: 13 }}>🏆 {s.winnerName}</div>}

      {s.games.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {s.games.map((g, i) => (
            <Link key={g.id} to={`/games/${g.id}`} className="bracket-game">
              <span className="muted">Juego {i + 1}</span>
              <span>{g.status === 'final' ? `${g.away_score}-${g.home_score}` : 'Pend.'}</span>
            </Link>
          ))}
        </div>
      )}

      {isAdmin && bothSet && !done && (
        <button className="btn secondary small" style={{ marginTop: 8 }} onClick={addGame} disabled={busy}>
          + Agregar juego
        </button>
      )}
    </div>
  );
}
