import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import TeamLogo from './TeamLogo.jsx';

export default function Standings({ leagueId }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get(`/leagues/${leagueId}/standings`).then(setData);
  }, [leagueId]);

  if (!data) return <div className="empty">Cargando…</div>;
  if (!data.groups.length) return <div className="empty">Sin datos de posiciones todavía.</div>;

  return (
    <div>
      {data.groups.map((g) => (
        <div className="panel" key={g.groupId}>
          <h3 style={{ marginTop: 0 }}>{g.groupName}</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th><th>Equipo</th><th>JJ</th><th>G</th><th>P</th>
                  <th>PCT</th><th>DIF</th><th>CF</th><th>CC</th><th>Racha</th><th>Últ. 10</th>
                </tr>
              </thead>
              <tbody>
                {g.rows.map((r) => (
                  <tr key={r.teamId}>
                    <td>{r.rank}</td>
                    <td>
                      <Link to={`/teams/${r.teamId}`}>
                        <TeamLogo logoUrl={r.logoUrl} color={r.color} name={r.name} size={20} />{r.name}
                      </Link>
                    </td>
                    <td>{r.g}</td>
                    <td>{r.w}</td>
                    <td>{r.l}</td>
                    <td>{r.pct.toFixed(3)}</td>
                    <td style={{ color: r.diff > 0 ? 'var(--green)' : r.diff < 0 ? '#ff7a7a' : 'inherit' }}>
                      {r.diff > 0 ? `+${r.diff}` : r.diff}
                    </td>
                    <td>{r.rs}</td>
                    <td>{r.ra}</td>
                    <td>{r.streak}</td>
                    <td>{r.last10}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      <p className="muted" style={{ fontSize: 13 }}>
        Desempate (estilo MLB): 1) PCT · 2) enfrentamiento directo · 3) diferencia de carreras · 4) carreras a favor.
        JJ=jugados, CF=carreras a favor, CC=carreras en contra, DIF=diferencia.
      </p>
    </div>
  );
}
