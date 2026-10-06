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

    let name = rest
      .replace(/[|_\[\]{}<>·•]/g, ' ')   // ruido de bordes de tabla (fotos de hojas de cálculo)
      .replace(/[-–—]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    // Quita un número suelto al inicio (índice de fila de una hoja de cálculo).
    name = name.replace(/^\d{1,3}\s+/, '').trim();
    // Quita símbolos sobrantes al inicio y al final que deja el OCR.
    name = name.replace(/^[^\p{L}]+/u, '').replace(/[^\p{L}\s]+$/u, '').trim();
    rows.push({ number, name, carnet, position });
  }
  return rows;
}

// Preprocesa la imagen para mejorar el OCR en fotos: la amplía, pasa a escala
// de grises y estira el contraste. Devuelve un <canvas>.
function preprocessImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(2.5, Math.max(1, 1800 / img.width));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      try {
        const imgData = ctx.getImageData(0, 0, w, h);
        const d = imgData.data;
        let min = 255, max = 0;
        for (let i = 0; i < d.length; i += 4) {
          const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          d[i] = d[i + 1] = d[i + 2] = g;
          if (g < min) min = g;
          if (g > max) max = g;
        }
        const range = Math.max(1, max - min);
        for (let i = 0; i < d.length; i += 4) {
          const v = ((d[i] - min) * 255) / range; // estiramiento de contraste
          d[i] = d[i + 1] = d[i + 2] = v;
        }
        ctx.putImageData(imgData, 0, 0);
      } catch {
        /* getImageData puede fallar por seguridad; se usa el canvas sin filtro */
      }
      URL.revokeObjectURL(img.src);
      resolve(canvas);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function ImportPlayers({ teamId, onDone }) {
  const [text, setText] = useState('');
  const [rows, setRows] = useState([]);      // filas editables
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrStatus, setOcrStatus] = useState('');
  const [ocrError, setOcrError] = useState('');

  // Re-parsea cada vez que cambia el texto (pegado u OCR). Las ediciones en la
  // tabla no tocan el texto; si se vuelve a editar el texto, la tabla se regenera.
  useEffect(() => { setRows(parseRoster(text)); setResult(null); }, [text]);

  async function onImage(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setOcrBusy(true); setOcrProgress(0); setOcrError(''); setOcrStatus('Preparando…');
    try {
      const Tesseract = await import('tesseract.js');
      const canvas = await preprocessImage(file);
      const worker = await Tesseract.createWorker('spa', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') { setOcrStatus('Reconociendo'); setOcrProgress(Math.round(m.progress * 100)); }
          else setOcrStatus(m.status);
        },
      });
      await worker.setParameters({ tessedit_pageseg_mode: '6' }); // tabla / bloque uniforme
      const { data } = await worker.recognize(canvas);
      await worker.terminate();
      setText((prev) => (prev.trim() ? `${prev}\n${data.text}` : data.text));
    } catch (err) {
      setOcrError(`No se pudo leer la imagen: ${err.message}`);
    } finally {
      setOcrBusy(false);
    }
  }

  const checked = rows.map((r) => ({ ...r, check: validateCarnet(r.carnet), noName: !r.name?.trim() }));
  const validCount = checked.filter((r) => r.check.ok && !r.noName).length;

  const editRow = (i, key, val) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [key]: val } : r)));
  const removeRow = (i) => setRows((rs) => rs.filter((_, idx) => idx !== i));

  async function importar() {
    setBusy(true); setResult(null);
    try {
      const payload = rows
        .filter((r) => r.name?.trim() && /^\d{11}$/.test(String(r.carnet)))
        .map((r) => ({
          name: r.name.trim(), carnet: String(r.carnet),
          number: r.number === '' || r.number == null ? null : Number(r.number),
          position: r.position || null,
        }));
      const res = await api.post(`/teams/${teamId}/players/bulk`, { players: payload });
      setResult(res);
      if (res.createdCount > 0 && res.errors.length === 0) onDone();
    } finally { setBusy(false); }
  }

  return (
    <div className="panel" style={{ borderColor: 'var(--accent-2)' }}>
      <h4 style={{ marginTop: 0 }}>Importar jugadores</h4>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        Pega una línea por jugador, o sube una <strong>imagen</strong> (foto o
        captura). El texto se extrae abajo y, en la tabla, puedes <strong>corregir
        cada fila</strong> antes de importar. Se detecta el CI (11 dígitos); el
        número inicial y lo que esté entre paréntesis (DT/Cap) son opcionales.
      </p>

      <div className="row" style={{ marginBottom: 10 }}>
        <label className="btn secondary small" style={{ cursor: 'pointer', margin: 0 }}>
          🖼️ Subir imagen (OCR)
          <input type="file" accept="image/*" onChange={onImage} style={{ display: 'none' }} disabled={ocrBusy} />
        </label>
        {ocrBusy && <span className="muted" style={{ fontSize: 13 }}>
          {ocrStatus}{ocrStatus === 'Reconociendo' ? ` ${ocrProgress}%` : '…'}
        </span>}
      </div>
      {ocrError && <div className="error">{ocrError}</div>}

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        placeholder={'1-Rafael Vázquez - 90102507865 (DT)\n2-Nelson Rodríguez - 92111042189 (Cap)'}
        style={{ width: '100%', fontFamily: 'monospace', fontSize: 13, padding: 10,
                 borderRadius: 8, border: '1px solid var(--border)',
                 background: 'var(--panel-2)', color: 'var(--text)', resize: 'vertical' }}
      />

      {rows.length > 0 && (
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table>
            <thead><tr><th>#</th><th>Nombre</th><th>CI</th><th>Etiq.</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {checked.map((r, i) => {
                const ok = r.check.ok && !r.noName;
                return (
                  <tr key={i}>
                    <td><input value={r.number ?? ''} onChange={(e) => editRow(i, 'number', e.target.value)}
                               style={{ width: 44 }} /></td>
                    <td><input value={r.name ?? ''} onChange={(e) => editRow(i, 'name', e.target.value)}
                               style={{ minWidth: 180 }} /></td>
                    <td><input value={r.carnet ?? ''} inputMode="numeric"
                               onChange={(e) => editRow(i, 'carnet', e.target.value.replace(/\D/g, '').slice(0, 11))}
                               style={{ width: 120, fontFamily: 'monospace' }} /></td>
                    <td><input value={r.position ?? ''} onChange={(e) => editRow(i, 'position', e.target.value)}
                               style={{ width: 56 }} /></td>
                    <td style={{ color: ok ? 'var(--green)' : '#ff7a7a', fontSize: 12 }}>
                      {ok ? `✓ ${r.check.birth}` : `⚠ ${r.noName ? 'Sin nombre' : r.check.error}`}
                    </td>
                    <td><button className="btn danger small" onClick={() => removeRow(i)}>×</button></td>
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
          {rows.length} fila(s), {validCount} válida(s). Corrige las marcadas con ⚠.
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
