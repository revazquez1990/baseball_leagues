import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

export default function Playoffs({ league, isAdmin }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [qualifiers, setQualifiers] = useState(2);
  const [bestOf, setBestOf] = useState(5);

  const load = useCallback(() => {
    api.get(`/leagues/${league.id}/playoffs`).then(setData);
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

  if (!data) return <div className="empty">Cargando…</div>;

  const { rounds = [], auto, regularComplete, provisional, persisted, editable } = data;
  const hasBracket = rounds.length > 0;

  return (
    <div>
      {/* Aviso: los cruces todavía no son definitivos. */}
      {provisional && hasBracket && (
        <div className="panel" style={{ borderColor: '#d2a106', background: 'rgba(210,161,6,0.08)' }}>
          <strong style={{ color: '#e3b341' }}>⚠️ Cruces provisionales</strong>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
            {regularComplete
              ? 'El bracket se armó con la tabla actual. Aún no se ha generado oficialmente.'
              : 'La fase clasificatoria aún no ha terminado. Los equipos se ubican según la tabla de posiciones de este momento y pueden cambiar; todavía no es definitivo.'}
          </p>
        </div>
      )}

      {/* Panel de administración. */}
      {isAdmin && (
        <div className="panel" style={{ borderColor: 'var(--accent-2)' }}>
          <h4 style={{ marginTop: 0 }}>Bracket de playoffs</h4>

          {auto ? (
            <>
              <p className="muted" style={{ marginTop: 0 }}>
                Se arma automáticamente con la tabla: 6 clasificados por grupo
                (play-in de 3º-6º y 4º-5º, luego cuartos, semifinal y final).
                {persisted
                  ? ' Ya está generado: puedes ponerle fecha, horario y boxscore a cada juego.'
                  : regularComplete
                    ? ' La fase clasificatoria terminó: genera el bracket para habilitar fechas, horarios y boxscores.'
                    : ' Podrás generarlo (y habilitar fechas/boxscores) cuando termine la fase clasificatoria.'}
              </p>
              {error && <div className="error">{error}</div>}
              <div className="row">
                <button className="btn" onClick={generate} disabled={busy || !regularComplete}>
                  {persisted ? '🔄 Regenerar bracket' : '🏆 Generar bracket'}
                </button>
                {persisted && <button className="btn danger" onClick={remove}>Eliminar</button>}
              </div>
              {!regularComplete && (
                <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>
                  El botón se habilita al terminar todos los juegos de la fase clasificatoria.
                </p>
              )}
              {persisted && (
                <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>
                  Regenerar vuelve a sembrar con la tabla actual y borra los juegos de playoffs ya cargados.
                </p>
              )}
            </>
          ) : (
            <>
              <p className="muted" style={{ marginTop: 0 }}>
                Se siembra desde la tabla de posiciones actual.
                {league.format === 'groups' ? ' Clasificados por cada grupo:' : ' Clasificados en total:'}
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
                  {persisted ? '🔄 Regenerar bracket' : '🏆 Generar bracket'}
                </button>
                {persisted && <button className="btn danger" onClick={remove}>Eliminar</button>}
              </div>
            </>
          )}
        </div>
      )}

      {!hasBracket ? (
        <div className="empty">
          Aún no hay playoffs. {isAdmin
            ? 'Genera el bracket cuando termine la fase clasificatoria.'
            : 'El bracket se publicará al cerrar la fase regular.'}
        </div>
      ) : (
        <div className="bracket">
          {rounds.map((r) => (
            <div className="bracket-round" key={r.round}>
              <h4 className="bracket-round-title">{r.title || `Ronda ${r.round}`}</h4>
              {r.series.map((s) => (
                <SeriesCard key={s.id} series={s} isAdmin={isAdmin} editable={editable} onChange={load} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SeriesCard({ series: s, isAdmin, editable, onChange }) {
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const bothSet = s.high.teamId && s.low.teamId;
  const done = !!s.winnerTeamId;
  const canEdit = isAdmin && editable;

  async function addGame() {
    setBusy(true);
    try {
      await api.post(`/series/${s.id}/games`, { game_date: date || null, game_time: time || null });
      setAdding(false); setDate(''); setTime('');
      onChange();
    } finally { setBusy(false); }
  }

  const side = (team, isWinner) => (
    <div className={`bracket-team ${isWinner ? 'win' : ''}`}>
      <span>
        {team.teamId
          ? <Link to={`/teams/${team.teamId}`}>
              <span className="tag" style={{ background: team.color }} />{team.name}
            </Link>
          : <span className="muted">{team.label || team.name}</span>}
      </span>
      <strong>{team.wins}</strong>
    </div>
  );

  return (
    <div className="card bracket-series">
      <div className="spread">
        <span className="muted" style={{ fontSize: 12 }}>{s.name}</span>
        <span className="pill">{s.bestOf === 1 ? 'Juego único' : `Al mejor de ${s.bestOf}`}</span>
      </div>
      {side(s.high, s.winnerTeamId === s.high.teamId)}
      {side(s.low, s.winnerTeamId === s.low.teamId)}

      {done && <div className="ok" style={{ fontSize: 13 }}>🏆 {s.winnerName}</div>}

      {s.games.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {s.games.map((g, i) => (
            <PlayoffGame key={g.id} game={g} index={i} canEdit={canEdit} onChange={onChange} />
          ))}
        </div>
      )}

      {canEdit && bothSet && !done && (
        adding ? (
          <div style={{ marginTop: 8, padding: 10, background: 'var(--panel-2)', borderRadius: 8 }}>
            <div className="form-row" style={{ marginBottom: 6 }}>
              <div style={{ maxWidth: 150 }}><label style={{ fontSize: 11 }}>Fecha</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
              <div style={{ maxWidth: 120 }}><label style={{ fontSize: 11 }}>Horario</label>
                <input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
            </div>
            <div className="row">
              <button className="btn small" onClick={addGame} disabled={busy}>Crear juego</button>
              <button className="btn secondary small" onClick={() => setAdding(false)}>Cancelar</button>
            </div>
          </div>
        ) : (
          <button className="btn secondary small" style={{ marginTop: 8 }} onClick={() => setAdding(true)}>
            + Agregar juego
          </button>
        )
      )}
    </div>
  );
}

// Un juego dentro de una serie: enlace al boxscore + edición de fecha/horario.
function PlayoffGame({ game: g, index, canEdit, onChange }) {
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(g.game_date ? String(g.game_date).slice(0, 10) : '');
  const [time, setTime] = useState(g.game_time ? String(g.game_time).slice(0, 5) : '');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await api.put(`/games/${g.id}`, { game_date: date || null, game_time: time || null });
      setEditing(false); onChange();
    } finally { setBusy(false); }
  }

  return (
    <div>
      <div className="bracket-game">
        <Link to={`/games/${g.id}`} style={{ flex: 1, display: 'flex', justifyContent: 'space-between' }}>
          <span className="muted">
            Juego {index + 1}
            {(g.game_date || g.game_time) && (
              <span style={{ marginLeft: 6 }}>· {fmtDateTime(g.game_date, g.game_time)}</span>
            )}
          </span>
          <span>{g.status === 'final' ? `${g.away_score}-${g.home_score}` : 'Pend.'}</span>
        </Link>
        {canEdit && (
          <button className="btn secondary small" style={{ marginLeft: 6 }} onClick={() => setEditing((e) => !e)}>⚙</button>
        )}
      </div>
      {canEdit && editing && (
        <div style={{ margin: '6px 0', padding: 8, background: 'var(--panel-2)', borderRadius: 8 }}>
          <div className="form-row" style={{ marginBottom: 6 }}>
            <div style={{ maxWidth: 150 }}><label style={{ fontSize: 11 }}>Fecha</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div style={{ maxWidth: 120 }}><label style={{ fontSize: 11 }}>Horario</label>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
          </div>
          <button className="btn small" onClick={save} disabled={busy}>Guardar</button>
        </div>
      )}
    </div>
  );
}

function fmtDateTime(d, t) {
  let out = '';
  if (d) {
    const date = new Date(`${String(d).slice(0, 10)}T12:00:00`);
    out = Number.isNaN(date.getTime())
      ? String(d).slice(0, 10)
      : date.toLocaleDateString('es', { day: '2-digit', month: 'short' });
  }
  if (t) out += `${out ? ' ' : ''}${String(t).slice(0, 5)}`;
  return out;
}
