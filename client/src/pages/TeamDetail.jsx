import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import TeamLogo from '../components/TeamLogo.jsx';
import { validateCarnet } from '../carnet.js';

export default function TeamDetail() {
  const { id } = useParams();
  const { isAdmin } = useAuth();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('batting');
  const [editingPlayer, setEditingPlayer] = useState(null); // objeto jugador o null
  const [showTeamEdit, setShowTeamEdit] = useState(false);
  const [importing, setImporting] = useState(false);

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
        <div className="row">
          <TeamLogo logoUrl={team.logo_url} color={team.color} name={team.name} size={44} />
          <div>
            <h1 className="title" style={{ margin: 0 }}>{team.name}</h1>
            <p className="subtitle" style={{ margin: 0 }}>
              {team.group_name || 'Sin grupo'}{team.city ? ` · ${team.city}` : ''} · Récord {record.w}-{record.l}
            </p>
          </div>
        </div>
        {isAdmin && (
          <button className="btn secondary small" onClick={() => setShowTeamEdit((s) => !s)}>
            {showTeamEdit ? 'Cerrar' : 'Editar equipo'}
          </button>
        )}
      </div>

      {isAdmin && showTeamEdit && (
        <TeamEditor team={team} onSaved={() => { setShowTeamEdit(false); load(); }} />
      )}

      {isAdmin && !editingPlayer && (
        <div className="row" style={{ margin: '8px 0' }}>
          <button className="btn secondary small" onClick={() => setImporting((i) => !i)}>
            {importing ? 'Cerrar importador' : '⤵ Importar lista de jugadores'}
          </button>
        </div>
      )}

      {isAdmin && importing && !editingPlayer && (
        <ImportPlayers teamId={id} onDone={() => { setImporting(false); load(); }} />
      )}

      {isAdmin && !importing && (
        <PlayerForm
          key={editingPlayer?.id || 'new'}
          teamId={id}
          player={editingPlayer}
          onSaved={() => { setEditingPlayer(null); load(); }}
          onCancel={() => setEditingPlayer(null)}
        />
      )}

      <div className="tabs">
        <div className={`tab ${tab === 'batting' ? 'active' : ''}`} onClick={() => setTab('batting')}>Bateo</div>
        <div className={`tab ${tab === 'pitching' ? 'active' : ''}`} onClick={() => setTab('pitching')}>Pitcheo</div>
      </div>

      {tab === 'batting' ? (
        <BattingTable rows={roster} isAdmin={isAdmin} onEdit={setEditingPlayer} onChange={load} />
      ) : (
        <PitchingTable rows={pitching} />
      )}
    </div>
  );
}

function TeamEditor({ team, onSaved }) {
  const [form, setForm] = useState({
    name: team.name, city: team.city || '', color: team.color || '#1e5aa8',
    logo_url: team.logo_url || '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function save() {
    setBusy(true);
    try { await api.put(`/teams/${team.id}`, form); onSaved(); }
    finally { setBusy(false); }
  }

  return (
    <div className="panel" style={{ borderColor: 'var(--accent-2)' }}>
      <h4 style={{ marginTop: 0 }}>Editar equipo</h4>
      <div className="form-row">
        <div style={{ flex: 2 }}><label>Nombre</label>
          <input value={form.name} onChange={set('name')} /></div>
        <div><label>Ciudad / barrio</label>
          <input value={form.city} onChange={set('city')} /></div>
        <div style={{ maxWidth: 120 }}><label>Color</label>
          <input type="color" value={form.color} onChange={set('color')} style={{ height: 38, padding: 2 }} /></div>
      </div>
      <div className="form-row">
        <div style={{ flex: 3 }}>
          <label>URL del logo (opcional)</label>
          <input value={form.logo_url} onChange={set('logo_url')}
                 placeholder="https://…/logo.png" />
        </div>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <TeamLogo logoUrl={form.logo_url} color={form.color} name={form.name} size={40} />
          <span className="muted" style={{ fontSize: 12 }}>Vista previa</span>
        </div>
      </div>
      <button className="btn" onClick={save} disabled={busy}>Guardar</button>
    </div>
  );
}

function BattingTable({ rows, isAdmin, onEdit, onChange }) {
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
            <th>#</th><th>Jugador</th><th>Carné</th><th>Pos</th><th>JJ</th><th>VB</th><th>C</th><th>H</th>
            <th>2B</th><th>3B</th><th>HR</th><th>CI</th><th>BB</th><th>K</th><th>SB</th>
            <th>AVG</th><th>OBP</th><th>SLG</th><th>OPS</th>{isAdmin && <th></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td>{p.number ?? ''}</td>
              <td>{p.name}</td>
              <td className="muted" style={{ fontSize: 12 }}>{p.carnet || '—'}</td>
              <td>{p.position || ''}</td>
              <td>{p.gp}</td><td>{p.ab}</td><td>{p.r}</td><td>{p.h}</td>
              <td>{p.b2}</td><td>{p.b3}</td><td>{p.hr}</td><td>{p.rbi}</td>
              <td>{p.bb}</td><td>{p.so}</td><td>{p.sb}</td>
              <td>{p.avg.toFixed(3)}</td><td>{p.obp.toFixed(3)}</td>
              <td>{p.slg.toFixed(3)}</td><td style={{ fontWeight: 700 }}>{p.ops.toFixed(3)}</td>
              {isAdmin && (
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn secondary small" onClick={() => onEdit(p)}>✎</button>{' '}
                  <button className="btn danger small" onClick={() => delPlayer(p)}>×</button>
                </td>
              )}
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

// Interpreta una lista pegada. Por cada línea detecta el CI (11 dígitos); si
// no hay CI, la línea se ignora (encabezados como "Equipo X:"). También saca
// el número inicial ("1-") y una etiqueta entre paréntesis ("(DT)", "(Cap)").
function parseRoster(text) {
  const rows = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const ci = line.match(/\d{11}/);
    if (!ci) continue; // encabezado / comentario
    const carnet = ci[0];
    let rest = line.replace(carnet, ' ');

    let position = '';
    const paren = rest.match(/\(([^)]+)\)/);
    if (paren) { position = paren[1].trim().slice(0, 10); rest = rest.replace(paren[0], ' '); }

    let number = '';
    const num = rest.match(/^\s*(\d{1,3})\s*[-.)]\s*/);
    if (num) { number = num[1]; rest = rest.slice(num[0].length); }

    let name = rest.replace(/[-–—]/g, ' ').replace(/\s+/g, ' ').trim();
    // Quita un número suelto al inicio (índice de fila de una hoja de cálculo).
    name = name.replace(/^\d{1,3}\s+/, '').trim();
    // Quita símbolos iniciales que deja el OCR (comillas, puntos, etc.).
    name = name.replace(/^[^\p{L}]+/u, '').trim();
    rows.push({ number, name, carnet, position });
  }
  return rows;
}

function ImportPlayers({ teamId, onDone }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrError, setOcrError] = useState('');

  async function onImage(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite volver a elegir la misma imagen
    if (!file) return;
    setOcrBusy(true); setOcrProgress(0); setOcrError('');
    try {
      const Tesseract = await import('tesseract.js');
      const { data } = await Tesseract.recognize(file, 'spa', {
        logger: (m) => {
          if (m.status === 'recognizing text') setOcrProgress(Math.round(m.progress * 100));
        },
      });
      setText((prev) => (prev.trim() ? `${prev}\n${data.text}` : data.text));
    } catch (err) {
      setOcrError(`No se pudo leer la imagen: ${err.message}`);
    } finally {
      setOcrBusy(false);
    }
  }

  const rows = parseRoster(text);
  const checked = rows.map((r) => ({ ...r, check: validateCarnet(r.carnet), noName: !r.name }));
  const validCount = checked.filter((r) => r.check.ok && !r.noName).length;

  async function importar() {
    setBusy(true); setResult(null);
    try {
      const payload = rows.map((r) => ({
        name: r.name, carnet: r.carnet,
        number: r.number === '' ? null : Number(r.number),
        position: r.position || null,
      }));
      const res = await api.post(`/teams/${teamId}/players/bulk`, { players: payload });
      setResult(res);
      if (res.createdCount > 0 && res.errors.length === 0) {
        onDone(); // todo bien: cierra y recarga
      }
    } finally { setBusy(false); }
  }

  return (
    <div className="panel" style={{ borderColor: 'var(--accent-2)' }}>
      <h4 style={{ marginTop: 0 }}>Importar jugadores (pegar lista)</h4>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        Pega una línea por jugador, o sube una <strong>imagen</strong> (foto o
        captura) y el texto se extraerá aquí para que lo revises. Se detecta el
        CI (11 dígitos); el número inicial y lo que esté entre paréntesis
        (p. ej. DT, Cap) son opcionales. Las líneas sin CI se ignoran.
      </p>

      <div className="row" style={{ marginBottom: 10 }}>
        <label className="btn secondary small" style={{ cursor: 'pointer', margin: 0 }}>
          🖼️ Subir imagen (OCR)
          <input type="file" accept="image/*" onChange={onImage} style={{ display: 'none' }} disabled={ocrBusy} />
        </label>
        {ocrBusy && <span className="muted" style={{ fontSize: 13 }}>Leyendo imagen… {ocrProgress}%</span>}
      </div>
      {ocrError && <div className="error">{ocrError}</div>}

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        placeholder={'1-Rafael Vázquez - 90102507865 (DT)\n2-Nelson Rodríguez - 92111042189 (Cap)'}
        style={{ width: '100%', fontFamily: 'monospace', fontSize: 13, padding: 10,
                 borderRadius: 8, border: '1px solid var(--border)',
                 background: 'var(--panel-2)', color: 'var(--text)', resize: 'vertical' }}
      />

      {rows.length > 0 && (
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table>
            <thead><tr><th>#</th><th>Nombre</th><th>CI</th><th>Etiqueta</th><th>Estado</th></tr></thead>
            <tbody>
              {checked.map((r, i) => {
                const ok = r.check.ok && !r.noName;
                return (
                  <tr key={i}>
                    <td>{r.number}</td>
                    <td>{r.name || <span className="muted">(sin nombre)</span>}</td>
                    <td className="muted" style={{ fontSize: 12 }}>{r.carnet}</td>
                    <td>{r.position}</td>
                    <td style={{ color: ok ? 'var(--green)' : '#ff7a7a' }}>
                      {ok ? `✓ ${r.check.birth}` : `⚠ ${r.noName ? 'Sin nombre' : r.check.error}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {result && (
        <div style={{ marginTop: 12 }}>
          {result.createdCount > 0 && <div className="ok">Agregados: {result.createdCount}</div>}
          {result.errors.length > 0 && (
            <div className="error">
              No se agregaron {result.errors.length}:
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {result.errors.map((e, i) => (
                  <li key={i}>{e.name} ({e.carnet}): {e.error}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn" onClick={importar} disabled={busy || validCount === 0}>
          {busy ? 'Importando…' : `Importar ${validCount} jugador(es)`}
        </button>
        <span className="muted" style={{ fontSize: 13 }}>
          {rows.length} línea(s) detectada(s), {validCount} válida(s).
        </span>
      </div>
    </div>
  );
}

// Formulario que sirve tanto para agregar como para editar un jugador.
function PlayerForm({ teamId, player, onSaved, onCancel }) {
  const editing = !!player;
  const [form, setForm] = useState({
    name: player?.name || '',
    carnet: player?.carnet || '',
    number: player?.number ?? '',
    position: player?.position || '',
    bats: player?.bats || 'R',
    throws: player?.throws || 'R',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const carnetCheck = validateCarnet(form.carnet);

  async function submit() {
    setError('');
    if (!form.name.trim()) { setError('El nombre es obligatorio'); return; }
    if (!carnetCheck.ok) { setError(`Carné: ${carnetCheck.error}`); return; }
    setBusy(true);
    const payload = {
      ...form,
      carnet: carnetCheck.carnet,
      number: form.number === '' ? null : Number(form.number),
    };
    try {
      if (editing) await api.put(`/players/${player.id}`, payload);
      else await api.post(`/teams/${teamId}/players`, payload);
      if (!editing) setForm({ name: '', carnet: '', number: '', position: '', bats: 'R', throws: 'R' });
      onSaved();
    } catch (err) {
      setError(err.message); // p.ej. carné duplicado en la liga (409)
    } finally { setBusy(false); }
  }

  // Solo dígitos en el carné, máximo 11.
  const onCarnet = (e) =>
    setForm({ ...form, carnet: e.target.value.replace(/\D/g, '').slice(0, 11) });

  return (
    <div className="panel" style={{ borderColor: editing ? 'var(--accent)' : 'var(--accent-2)' }}>
      <h4 style={{ marginTop: 0 }}>
        {editing ? `Editar jugador: ${player.name}` : 'Agregar jugador a la nómina'}
      </h4>
      <div className="form-row">
        <div style={{ flex: 2 }}><label>Nombre</label>
          <input value={form.name} onChange={set('name')}
                 onKeyDown={(e) => e.key === 'Enter' && submit()} /></div>
        <div style={{ maxWidth: 200 }}>
          <label>CI</label>
          <input value={form.carnet} onChange={onCarnet} inputMode="numeric"
                 placeholder="aammdd#####"
                 style={{ borderColor: form.carnet && !carnetCheck.ok ? 'var(--accent)' : undefined }} />
          {form.carnet !== '' && (
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
              {carnetCheck.ok ? `✓ Nacimiento: ${carnetCheck.birth}` : `⚠ ${carnetCheck.error}`}
            </div>
          )}
        </div>
        <div style={{ maxWidth: 90 }}><label>Número</label>
          <input type="number" value={form.number} onChange={set('number')} /></div>
        <div style={{ maxWidth: 110 }}><label>Posición</label>
          <input value={form.position} onChange={set('position')} placeholder="SS" /></div>
        <div style={{ maxWidth: 90 }}><label>Batea</label>
          <select value={form.bats} onChange={set('bats')}><option>R</option><option>L</option><option>S</option></select></div>
        <div style={{ maxWidth: 90 }}><label>Lanza</label>
          <select value={form.throws} onChange={set('throws')}><option>R</option><option>L</option></select></div>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="row">
        <button className="btn" onClick={submit} disabled={busy || !carnetCheck.ok}>
          {editing ? 'Guardar cambios' : 'Agregar'}
        </button>
        {editing && <button className="btn secondary" onClick={onCancel}>Cancelar</button>}
      </div>
    </div>
  );
}
