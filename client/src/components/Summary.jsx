import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import TeamLogo from './TeamLogo.jsx';

export default function Summary({ league, teams, onGoTab }) {
  const [standings, setStandings] = useState(null);
  const [leaders, setLeaders] = useState(null);
  const [games, setGames] = useState([]);
  const [bracket, setBracket] = useState(null);

  useEffect(() => {
    api.get(`/leagues/${league.id}/standings`).then(setStandings);
    api.get(`/leagues/${league.id}/leaders`).then(setLeaders);
    api.get(`/leagues/${league.id}/games`).then(setGames);
    api.get(`/leagues/${league.id}/playoffs`).then(setBracket);
  }, [league.id]);

  const regular = games.filter((g) => g.stage !== 'playoff');
  const played = regular.filter((g) => g.status === 'final').length;
  const total = regular.length;
  const pct = total > 0 ? Math.round((played / total) * 100) : 0;

  // Campeón: ganador de la Final (última ronda) si existe.
  let champion = null;
  if (bracket?.rounds?.length) {
    const finalRound = bracket.rounds[bracket.rounds.length - 1];
    const finalSeries = finalRound.series[0];
    if (finalSeries?.winnerTeamId) {
      champion = { name: finalSeries.winnerName, teamId: finalSeries.winnerTeamId };
    }
  }

  const topHR = leaders?.batting?.hr?.[0];
  const topAVG = leaders?.batting?.avg?.[0];
  const topW = leaders?.pitching?.w?.[0];

  return (
    <div>
      {champion && (
        <div className="panel" style={{ borderColor: 'var(--green)', textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: 'var(--muted)' }}>🏆 CAMPEÓN</div>
          <Link to={`/teams/${champion.teamId}`} style={{ fontSize: 26, fontWeight: 800 }}>
            {champion.name}
          </Link>
        </div>
      )}

      {/* Indicadores */}
      <div className="tiles">
        <Tile label="Equipos" value={teams.length} />
        <Tile label="Grupos" value={league.format === 'groups' ? league.num_groups : 1} />
        <Tile label="Juegos jugados" value={`${played} / ${total}`} />
        <Tile label="Avance temporada" value={`${pct}%`} />
      </div>
      <div style={{ height: 8, background: 'var(--panel-2)', borderRadius: 6, overflow: 'hidden', margin: '4px 0 18px' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--green)' }} />
      </div>

      {/* Líderes de cada grupo */}
      {standings?.groups?.length > 0 && (
        <div className="panel">
          <div className="spread">
            <h3 style={{ margin: 0 }}>Punteros</h3>
            <button className="btn secondary small" onClick={() => onGoTab('standings')}>Ver posiciones →</button>
          </div>
          <div className="card-grid" style={{ marginTop: 12 }}>
            {standings.groups.map((g) => {
              const leader = g.rows[0];
              if (!leader) return null;
              return (
                <div className="card" key={g.groupId}>
                  <div className="muted" style={{ fontSize: 12 }}>{g.groupName}</div>
                  <Link to={`/teams/${leader.teamId}`} className="row" style={{ marginTop: 6 }}>
                    <TeamLogo logoUrl={leader.logoUrl} color={leader.color} name={leader.name} size={26} />
                    <strong>{leader.name}</strong>
                  </Link>
                  <div className="muted" style={{ marginTop: 6 }}>
                    {leader.w}-{leader.l} · PCT {leader.pct.toFixed(3)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Destacados */}
      <div className="panel">
        <div className="spread">
          <h3 style={{ margin: 0 }}>Destacados</h3>
          <button className="btn secondary small" onClick={() => onGoTab('leaders')}>Ver líderes →</button>
        </div>
        <div className="card-grid" style={{ marginTop: 12 }}>
          <Highlight title="Más jonrones" player={topHR} value={topHR && `${topHR.hr} HR`} />
          <Highlight title="Mejor average" player={topAVG} value={topAVG && topAVG.avg.toFixed(3)} />
          <Highlight title="Más victorias (P)" player={topW} value={topW && `${topW.w} G`} />
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value }) {
  return (
    <div className="tile">
      <div className="tile-value">{value}</div>
      <div className="tile-label">{label}</div>
    </div>
  );
}

function Highlight({ title, player, value }) {
  return (
    <div className="card">
      <div className="muted" style={{ fontSize: 12 }}>{title}</div>
      {player ? (
        <>
          <Link to={`/teams/${player.teamId}`} style={{ fontWeight: 700, fontSize: 16, display: 'block', marginTop: 6 }}>
            {player.name}
          </Link>
          <div className="muted" style={{ fontSize: 13 }}>{player.teamName}</div>
          <div className="score" style={{ marginTop: 6 }}>{value}</div>
        </>
      ) : (
        <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>Sin datos aún</div>
      )}
    </div>
  );
}
