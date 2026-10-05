import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

export default function Home() {
  const { isAdmin } = useAuth();
  const [leagues, setLeagues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  function load() {
    setLoading(true);
    api.get('/leagues').then(setLeagues).finally(() => setLoading(false));
  }
  useEffect(load, []);

  return (
    <div>
      <div className="spread" style={{ marginTop: 18 }}>
        <div>
          <h1 className="title" style={{ margin: 0 }}>Ligas</h1>
          <p className="subtitle" style={{ margin: 0 }}>Campeonatos de béisbol de barrio</p>
        </div>
        {isAdmin && (
          <button className="btn" onClick={() => setShowForm((s) => !s)}>
            {showForm ? 'Cancelar' : '+ Nueva liga'}
          </button>
        )}
      </div>

      {showForm && <NewLeagueForm onCreated={() => { setShowForm(false); load(); }} />}

      {loading ? (
        <div className="empty">Cargando…</div>
      ) : leagues.length === 0 ? (
        <div className="empty">Aún no hay ligas. {isAdmin && 'Crea la primera.'}</div>
      ) : (
        <div className="card-grid" style={{ marginTop: 18 }}>
          {leagues.map((l) => (
            <Link to={`/leagues/${l.id}`} key={l.id} className="card">
              <div className="spread">
                <strong style={{ fontSize: 17 }}>{l.name}</strong>
                <span className="pill">{statusLabel(l.status)}</span>
              </div>
              <div className="muted" style={{ marginTop: 6 }}>{l.season || 'Sin temporada'}</div>
              <div className="row" style={{ marginTop: 12, gap: 16 }}>
                <span className="muted">{l.team_count} equipos</span>
                <span className="muted">{l.game_count} juegos</span>
                <span className="badge">{l.format === 'groups' ? `${l.num_groups} grupo(s)` : 'Tabla única'}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function statusLabel(s) {
  return { setup: 'En armado', scheduled: 'Calendario listo', in_progress: 'En curso', finished: 'Finalizada' }[s] || s;
}

function NewLeagueForm({ onCreated }) {
  const [form, setForm] = useState({ name: '', season: '', format: 'groups', num_groups: 2, rounds: 1 });
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/leagues', {
        ...form,
        num_groups: Number(form.num_groups),
        rounds: Number(form.rounds),
      });
      onCreated();
    } catch (err) { setError(err.message); }
  }

  return (
    <form className="panel" onSubmit={submit} style={{ marginTop: 18 }}>
      <h3 style={{ marginTop: 0 }}>Nueva liga</h3>
      <div className="form-row">
        <div>
          <label>Nombre</label>
          <input value={form.name} onChange={set('name')} required />
        </div>
        <div>
          <label>Temporada</label>
          <input value={form.season} onChange={set('season')} placeholder="2026" />
        </div>
      </div>
      <div className="form-row">
        <div>
          <label>Formato</label>
          <select value={form.format} onChange={set('format')}>
            <option value="groups">Grupos + playoffs</option>
            <option value="single">Tabla única</option>
          </select>
        </div>
        <div>
          <label>Nº de grupos</label>
          <input type="number" min="1" value={form.num_groups} onChange={set('num_groups')}
                 disabled={form.format !== 'groups'} />
        </div>
        <div>
          <label>Vueltas (veces que se enfrentan)</label>
          <input type="number" min="1" value={form.rounds} onChange={set('rounds')} />
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      <button className="btn">Crear liga</button>
    </form>
  );
}
