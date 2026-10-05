import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import Standings from '../components/Standings.jsx';
import Leaders from '../components/Leaders.jsx';
import Schedule from '../components/Schedule.jsx';
import Playoffs from '../components/Playoffs.jsx';
import AdminSetup from '../components/AdminSetup.jsx';

const TABS = [
  { key: 'standings', label: 'Posiciones' },
  { key: 'schedule', label: 'Calendario' },
  { key: 'playoffs', label: 'Playoffs' },
  { key: 'teams', label: 'Equipos' },
  { key: 'leaders', label: 'Líderes' },
];

export default function LeagueDetail() {
  const { id } = useParams();
  const { isAdmin } = useAuth();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('standings');
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/leagues/${id}`).then(setData).finally(() => setLoading(false));
  }, [id]);

  useEffect(load, [load]);

  if (loading) return <div className="empty">Cargando…</div>;
  if (!data) return <div className="empty">Liga no encontrada</div>;

  const { league, groups, teams } = data;

  return (
    <div>
      <div style={{ marginTop: 18 }}>
        <Link to="/" className="muted">← Ligas</Link>
      </div>
      <div className="spread">
        <div>
          <h1 className="title" style={{ margin: '8px 0 0' }}>{league.name}</h1>
          <p className="subtitle" style={{ margin: 0 }}>
            {league.season || 'Sin temporada'} · {league.format === 'groups'
              ? `${league.num_groups} grupo(s)` : 'Tabla única'} · {league.rounds} vuelta(s)
          </p>
        </div>
        <span className="pill">{teams.length} equipos</span>
      </div>

      {isAdmin && (
        <AdminSetup league={league} groups={groups} teams={teams} onChange={load} />
      )}

      <div className="tabs">
        {TABS.map((t) => (
          <div key={t.key}
               className={`tab ${tab === t.key ? 'active' : ''}`}
               onClick={() => setTab(t.key)}>
            {t.label}
          </div>
        ))}
      </div>

      {tab === 'standings' && <Standings leagueId={id} />}
      {tab === 'schedule' && <Schedule leagueId={id} teams={teams} isAdmin={isAdmin} onChange={load} />}
      {tab === 'playoffs' && <Playoffs league={league} isAdmin={isAdmin} />}
      {tab === 'teams' && <TeamsTab teams={teams} />}
      {tab === 'leaders' && <Leaders leagueId={id} />}
    </div>
  );
}

function TeamsTab({ teams }) {
  if (teams.length === 0) return <div className="empty">Aún no hay equipos.</div>;
  return (
    <div className="card-grid">
      {teams.map((t) => (
        <Link to={`/teams/${t.id}`} key={t.id} className="card">
          <div className="row">
            <span className="tag" style={{ background: t.color }} />
            <strong style={{ fontSize: 16 }}>{t.name}</strong>
          </div>
          <div className="muted" style={{ marginTop: 8 }}>
            {t.group_name || 'Sin grupo'} · {t.player_count} jugadores
          </div>
        </Link>
      ))}
    </div>
  );
}
