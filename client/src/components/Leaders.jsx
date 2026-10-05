import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

const BAT_CATS = [
  { key: 'avg', label: 'Average (AVG)', fmt: (v) => v.avg.toFixed(3), rate: true },
  { key: 'hr', label: 'Jonrones (HR)', fmt: (v) => v.hr },
  { key: 'rbi', label: 'Impulsadas (RBI)', fmt: (v) => v.rbi },
  { key: 'h', label: 'Hits (H)', fmt: (v) => v.h },
  { key: 'r', label: 'Carreras (R)', fmt: (v) => v.r },
  { key: 'sb', label: 'Bases robadas (SB)', fmt: (v) => v.sb },
  { key: 'ops', label: 'OPS', fmt: (v) => v.ops.toFixed(3), rate: true },
];
const PIT_CATS = [
  { key: 'w', label: 'Victorias (W)', fmt: (v) => v.w },
  { key: 'era', label: 'Efectividad (ERA)', fmt: (v) => v.era.toFixed(2), rate: true },
  { key: 'so', label: 'Ponches (K)', fmt: (v) => v.so },
  { key: 'sv', label: 'Salvados (SV)', fmt: (v) => v.sv },
  { key: 'whip', label: 'WHIP', fmt: (v) => v.whip.toFixed(2), rate: true },
];

export default function Leaders({ leagueId }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get(`/leagues/${leagueId}/leaders`).then(setData);
  }, [leagueId]);

  if (!data) return <div className="empty">Cargando…</div>;

  return (
    <div>
      <h3>Bateo</h3>
      <div className="card-grid">
        {BAT_CATS.map((c) => (
          <LeaderBox key={c.key} title={c.label} rows={data.batting[c.key]} fmt={c.fmt} />
        ))}
      </div>
      <h3 style={{ marginTop: 24 }}>Pitcheo</h3>
      <div className="card-grid">
        {PIT_CATS.map((c) => (
          <LeaderBox key={c.key} title={c.label} rows={data.pitching[c.key]} fmt={c.fmt} />
        ))}
      </div>
      <p className="muted" style={{ fontSize: 13, marginTop: 16 }}>
        Mínimos para calificar en tasas: {data.thresholds.paThreshold} apariciones al plato (bateo),
        {' '}{data.thresholds.ipThreshold} entradas (pitcheo).
      </p>
    </div>
  );
}

function LeaderBox({ title, rows, fmt }) {
  return (
    <div className="card leader-box">
      <h4>{title}</h4>
      {(!rows || rows.length === 0) ? (
        <div className="muted" style={{ fontSize: 13 }}>Sin datos</div>
      ) : (
        <table>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id}>
                <td style={{ width: 20, color: 'var(--muted)' }}>{i + 1}</td>
                <td>
                  <Link to={`/teams/${r.teamId}`}>{r.name}</Link>
                  <div className="muted" style={{ fontSize: 11 }}>{r.teamName}</div>
                </td>
                <td style={{ fontWeight: 700 }}>{fmt(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
