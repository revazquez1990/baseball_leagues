import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

const BAT_CATS = [
  { key: 'avg', label: 'Average (AVG)', fmt: (v) => v.avg.toFixed(3) },
  { key: 'hr', label: 'Jonrones (HR)', fmt: (v) => v.hr },
  { key: 'rbi', label: 'Impulsadas (RBI)', fmt: (v) => v.rbi },
];
const PIT_CATS = [
  { key: 'w', label: 'Victorias (W)', fmt: (v) => v.w },
  { key: 'era', label: 'Efectividad (ERA)', fmt: (v) => v.era.toFixed(2) },
  { key: 'so', label: 'Ponches (K)', fmt: (v) => v.so },
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
        <ol className="leader-list">
          {rows.map((r, i) => (
            <li key={r.id}>
              <span className="rank">{i + 1}</span>
              <span className="who">
                <Link to={`/teams/${r.teamId}`} className="pname">{r.name}</Link>
                <span className="pteam">{r.teamName}</span>
              </span>
              <span className="val">{fmt(r)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
