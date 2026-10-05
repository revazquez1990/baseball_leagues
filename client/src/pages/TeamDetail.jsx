import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

export default function TeamDetail() {
  const { id } = useParams();
  const { isAdmin } = useAuth();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('batting');

  const load = useCallback(() => {
    api.get(`/teams/${id}`).then(setData);
  }, [id]);
  useEffect(load, [load]);

  if (!data) return <div className="empty">Cargando…</div>;
  const { team, record, roster, pitching } = data;

  return (
    <div>
      <div style={{ marginTop: 18 }}>
        <Link to={`/leagues/${team.league_id}`} className="muted">← {team.league_name}</Link>
      </div>
      <div className="spread">
        <div>
          <h1 className="title" style={{ margin: '8px 0 0' }}>
            <span className="tag" style={{ background: team.color, width: 16, height: 16 }} />
            {team.name}
          </h1>
          <p className="subtitle" style={{ margin: 0 }}>
            {team.group_name || 'Sin grupo'} · Récord {record.w}-{record.l}
          </p>
        </div>
      </div>

      {isAdmin && <AddPlayer teamId={id} onChange={load} />}

      <div className="tabs">
        <div className={`tab ${tab === 'batting' ? 'active' : ''}`} onClick={() => setTab('batting')}>Bateo</div>
        <div className={`tab ${tab === 'pitching' ? 'active' : ''}`} onClick={() => setTab('pitching')}>Pitcheo</div>
      </div>

      {tab === 'batting' ? (
        <BattingTable rows={roster} isAdmin={isAdmin} onChange={load} />
      ) : (
        <PitchingTable rows={pitching} />
      )}
    </div>
  );
}

function BattingTable({ rows, isAdmin, onChange }) {
  async function delPlayer(p) {
    if (!confirm(`¿Eliminar a ${p.name}?`)) return;
    await api.del(`/players/${p.id}`);
    onChange();
  }
  if (!rows.length) return <div className="empty">Sin jugadores en la nómina.</div>;
  return (
    <div className="panel table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th><th>Jugador</th><th>Pos</th><th>JJ</th><th>VB</th><th>C</th><th>H</th>
            <th>2B</th><th>3B</th><th>HR</th><th>CI</th><th>BB</th><th>K</th><th>SB</th>
            <th>AVG</th><th>OBP</th><th>SLG</th><th>OPS</th>{isAdmin && <th></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td>{p.number ?? ''}</td>
              <td>{p.name}</td>
              <td>{p.position || ''}</td>
              <td>{p.gp}</td><td>{p.ab}</td><td>{p.r}</td><td>{p.h}</td>
              <td>{p.b2}</td><td>{p.b3}</td><td>{p.hr}</td><td>{p.rbi}</td>
              <td>{p.bb}</td><td>{p.so}</td><td>{p.sb}</td>
              <td>{p.avg.toFixed(3)}</td><td>{p.obp.toFixed(3)}</td>
              <td>{p.slg.toFixed(3)}</td><td style={{ fontWeight: 700 }}>{p.ops.toFixed(3)}</td>
              {isAdmin && <td><button className="btn danger small" onClick={() => delPlayer(p)}>×</button></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PitchingTable({ rows }) {
  if (!rows.length) return <div className="empty">Ningún lanzador con entradas registradas.</div>;
  return (
    <div className="panel table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th><th>Lanzador</th><th>JJ</th><th>IP</th><th>H</th><th>C</th><th>CL</th>
            <th>BB</th><th>K</th><th>HR</th><th>G</th><th>P</th><th>SV</th><th>ERA</th><th>WHIP</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td>{p.number ?? ''}</td><td>{p.name}</td><td>{p.gp}</td><td>{p.ip}</td>
              <td>{p.h}</td><td>{p.r}</td><td>{p.er}</td><td>{p.bb}</td><td>{p.so}</td>
              <td>{p.hr}</td><td>{p.w}</td><td>{p.l}</td><td>{p.sv}</td>
              <td style={{ fontWeight: 700 }}>{p.era.toFixed(2)}</td><td>{p.whip.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AddPlayer({ teamId, onChange }) {
  const [form, setForm] = useState({ name: '', number: '', position: '', bats: 'R', throws: 'R' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function add() {
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      await api.post(`/teams/${teamId}/players`, {
        ...form,
        number: form.number ? Number(form.number) : null,
      });
      setForm({ name: '', number: '', position: '', bats: 'R', throws: 'R' });
      onChange();
    } finally { setBusy(false); }
  }

  return (
    <div className="panel" style={{ borderColor: 'var(--accent-2)' }}>
      <h4 style={{ marginTop: 0 }}>Agregar jugador a la nómina</h4>
      <div className="form-row">
        <div style={{ flex: 2 }}><label>Nombre</label>
          <input value={form.name} onChange={set('name')} onKeyDown={(e) => e.key === 'Enter' && add()} /></div>
        <div style={{ maxWidth: 90 }}><label>Número</label>
          <input type="number" value={form.number} onChange={set('number')} /></div>
        <div style={{ maxWidth: 110 }}><label>Posición</label>
          <input value={form.position} onChange={set('position')} placeholder="SS" /></div>
        <div style={{ maxWidth: 100 }}><label>Batea</label>
          <select value={form.bats} onChange={set('bats')}><option>R</option><option>L</option><option>S</option></select></div>
        <div style={{ maxWidth: 100 }}><label>Lanza</label>
          <select value={form.throws} onChange={set('throws')}><option>R</option><option>L</option></select></div>
      </div>
      <button className="btn" onClick={add} disabled={busy}>Agregar</button>
    </div>
  );
}
