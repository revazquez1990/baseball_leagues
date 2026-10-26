import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import TeamLogo from './TeamLogo.jsx';

const CLASIF = {
  directo: { label: '✓ Directo', bg: 'rgba(63,185,80,0.18)', fg: 'var(--green)' },
  comodin: { label: '✓ Comodín', bg: 'rgba(56,139,253,0.18)', fg: '#58a6ff' },
  eliminado: { label: 'Eliminado', bg: 'rgba(255,122,122,0.14)', fg: '#ff7a7a' },
};

function ClasifTag({ value }) {
  const c = CLASIF[value];
  if (!c) return null;
  return (
    <span
      style={{
        display: 'inline-block', padding: '1px 8px', borderRadius: 999,
        fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
        background: c.bg, color: c.fg,
      }}
    >
      {c.label}
    </span>
  );
}

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
                  <th>#</th><th>Equipo</th><th>Clasif.</th><th>JJ</th><th>G</th><th>P</th>
                  <th>PCT</th><th>JD</th><th>DIF</th><th>CF</th><th>CC</th>
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
                    <td><ClasifTag value={r.clasif} /></td>
                    <td>{r.g}</td>
                    <td>{r.w}</td>
                    <td>{r.l}</td>
                    <td>{r.pct.toFixed(3)}</td>
                    <td>{r.jd}</td>
                    <td style={{ color: r.diff > 0 ? 'var(--green)' : r.diff < 0 ? '#ff7a7a' : 'inherit' }}>
                      {r.diff > 0 ? `+${r.diff}` : r.diff}
                    </td>
                    <td>{r.rs}</td>
                    <td>{r.ra}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      <p className="muted" style={{ fontSize: 13 }}>
        Desempate: 1) enfrentamiento directo · 2) diferencia de carreras entre ellos ·
        3) carreras anotadas entre ellos · 4) diferencia de carreras del torneo ·
        5) carreras anotadas del torneo.
        <br />
        JJ=jugados, JD=juegos detrás del primer lugar, CF=carreras a favor,
        CC=carreras en contra, DIF=diferencia de carreras.
        Clasif. (por grupo): ✓ Directo = top 2 del grupo asegurado · ✓ Comodín = top 6 del grupo asegurado ·
        Eliminado = sin opción al top 6 del grupo (se muestran solo cuando ya es matemáticamente seguro, resolviendo empates por duelo particular).
      </p>
    </div>
  );
}
