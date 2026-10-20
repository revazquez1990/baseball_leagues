import { useEffect, useState, useCallback, useMemo } from 'react';
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
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try { await exportTeamPdf(data); }
    catch (e) { alert(`No se pudo generar el PDF: ${e.message}`); }
    finally { setExporting(false); }
  }

  const load = useCallback(() => {
    api.get(`/teams/${id}`).then(setData);
  }, [id]);
  useEffect(load, [load]);

  if (!data) return <div className="empty">Cargando…</div>;
  const { team, record, roster, pitching, battingTotal, pitchingTotal } = data;

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
        <div className="row">
          <button className="btn secondary small" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Generando…' : '⬇ Exportar PDF'}
          </button>
          {isAdmin && (
            <button className="btn secondary small" onClick={() => setShowTeamEdit((s) => !s)}>
              {showTeamEdit ? 'Cerrar' : 'Editar equipo'}
            </button>
          )}
        </div>
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
        <BattingTable rows={roster} totals={battingTotal} isAdmin={isAdmin} onEdit={setEditingPlayer} onChange={load} />
      ) : (
        <PitchingTable rows={pitching} totals={pitchingTotal} />
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

// Columnas de la tabla de bateo. `key` es el campo por el que se ordena;
// `render` (opcional) formatea la celda. Por defecto muestra p[key].
const BAT_COLS = [
  { key: 'number', label: '#', render: (p) => p.number ?? '' },
  { key: 'name', label: 'Jugador' },
  { key: 'carnet', label: 'Carné', render: (p) => p.carnet || '—', cellClass: 'muted', cellStyle: { fontSize: 12 } },
  { key: 'position', label: 'Pos', render: (p) => p.position || '' },
  { key: 'gp', label: 'JJ' }, { key: 'ab', label: 'VB' }, { key: 'r', label: 'C' }, { key: 'h', label: 'H' },
  { key: 'b2', label: '2B' }, { key: 'b3', label: '3B' }, { key: 'hr', label: 'HR' }, { key: 'rbi', label: 'CI' },
  { key: 'bb', label: 'BB' }, { key: 'so', label: 'K' }, { key: 'sb', label: 'SB' },
  { key: 'avg', label: 'AVG', render: (p) => p.avg.toFixed(3) },
  { key: 'obp', label: 'OBP', render: (p) => p.obp.toFixed(3) },
  { key: 'slg', label: 'SLG', render: (p) => p.slg.toFixed(3) },
  { key: 'ops', label: 'OPS', render: (p) => p.ops.toFixed(3), cellStyle: { fontWeight: 700 } },
];

// Columnas de pitcheo. IP se muestra como texto (p.ip) pero se ORDENA por
// `outs` para que el orden sea numéricamente correcto (3.1 < 3.2 < 4.0).
const PIT_COLS = [
  { key: 'number', label: '#', render: (p) => p.number ?? '' },
  { key: 'name', label: 'Lanzador' },
  { key: 'gp', label: 'JJ' },
  { key: 'outs', label: 'IP', render: (p) => p.ip },
  { key: 'h', label: 'H' }, { key: 'r', label: 'C' }, { key: 'er', label: 'CL' },
  { key: 'bb', label: 'BB' }, { key: 'so', label: 'K' }, { key: 'hr', label: 'HR' },
  { key: 'w', label: 'G' }, { key: 'l', label: 'P' }, { key: 'sv', label: 'SV' },
  { key: 'era', label: 'ERA', render: (p) => p.era.toFixed(2), cellStyle: { fontWeight: 700 } },
  { key: 'whip', label: 'WHIP', render: (p) => p.whip.toFixed(2) },
];

// Columnas que describen al jugador (no son estadísticas acumulables): en la
// fila de totales y en el PDF van vacías.
const DESCRIPTIVE_KEYS = new Set(['number', 'carnet', 'position', 'gp']);

function sortRows(rows, { key, dir }) {
  if (!key) return rows;
  const arr = [...rows];
  arr.sort((a, b) => {
    const av = a[key], bv = b[key];
    let cmp;
    if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
    else cmp = String(av ?? '').localeCompare(String(bv ?? ''), 'es', { numeric: true });
    return dir === 'asc' ? cmp : -cmp;
  });
  return arr;
}

// Hook de ordenamiento por columna. El primer clic ordena descendente (para
// ver primero a los líderes); el segundo invierte a ascendente.
function useColumnSort(rows) {
  const [sort, setSort] = useState({ key: null, dir: 'desc' });
  const sorted = useMemo(() => sortRows(rows, sort), [rows, sort]);
  const onSort = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' }));
  return { sorted, sort, onSort };
}

// Fila de encabezados clickeables con indicador de orden (▼/▲).
function SortHeaders({ cols, sort, onSort, trailingEmpty = false }) {
  return (
    <tr>
      {cols.map((c) => (
        <th
          key={c.key}
          onClick={() => onSort(c.key)}
          style={{ cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none' }}
          title="Clic para ordenar"
        >
          {c.label}{sort.key === c.key ? (sort.dir === 'desc' ? ' ▼' : ' ▲') : ''}
        </th>
      ))}
      {trailingEmpty && <th></th>}
    </tr>
  );
}

// Fila de totales del equipo (en el <tfoot>). Las columnas descriptivas
// (número, carné, posición, JJ) van vacías; en la de nombre se pone "TOTALES".
function TotalsRow({ cols, totals, labelKey = 'name', trailingEmpty = false }) {
  return (
    <tr style={{ fontWeight: 700, borderTop: '2px solid var(--accent-2)' }}>
      {cols.map((c) => {
        if (c.key === labelKey) return <td key={c.key}>TOTALES</td>;
        if (DESCRIPTIVE_KEYS.has(c.key)) return <td key={c.key}></td>;
        return <td key={c.key} style={c.cellStyle}>{c.render ? c.render(totals) : totals[c.key]}</td>;
      })}
      {trailingEmpty && <td></td>}
    </tr>
  );
}

function StatRow({ cols, p, children }) {
  return (
    <tr>
      {cols.map((c) => (
        <td key={c.key} className={c.cellClass} style={c.cellStyle}>
          {c.render ? c.render(p) : p[c.key]}
        </td>
      ))}
      {children}
    </tr>
  );
}

function BattingTable({ rows, totals, isAdmin, onEdit, onChange }) {
  const { sorted, sort, onSort } = useColumnSort(rows);
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
          <SortHeaders cols={BAT_COLS} sort={sort} onSort={onSort} trailingEmpty={isAdmin} />
        </thead>
        <tbody>
          {sorted.map((p) => (
            <StatRow key={p.id} cols={BAT_COLS} p={p}>
              {isAdmin && (
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn secondary small" onClick={() => onEdit(p)}>✎</button>{' '}
                  <button className="btn danger small" onClick={() => delPlayer(p)}>×</button>
                </td>
              )}
            </StatRow>
          ))}
        </tbody>
        {totals && (
          <tfoot>
            <TotalsRow cols={BAT_COLS} totals={totals} trailingEmpty={isAdmin} />
          </tfoot>
        )}
      </table>
    </div>
  );
}

function PitchingTable({ rows, totals }) {
  const { sorted, sort, onSort } = useColumnSort(rows);
  if (!rows.length) return <div className="empty">Ningún lanzador con entradas registradas.</div>;
  return (
    <div className="panel table-wrap">
      <table>
        <thead>
          <SortHeaders cols={PIT_COLS} sort={sort} onSort={onSort} />
        </thead>
        <tbody>
          {sorted.map((p) => (
            <StatRow key={p.id} cols={PIT_COLS} p={p} />
          ))}
        </tbody>
        {totals && (
          <tfoot>
            <TotalsRow cols={PIT_COLS} totals={totals} />
          </tfoot>
        )}
      </table>
    </div>
  );
}

// Texto de una celda a partir de la definición de columna (reutiliza el mismo
// `render` que la tabla en pantalla, así el PDF coincide con lo visible).
function cellText(col, obj) {
  const v = col.render ? col.render(obj) : obj[col.key];
  return v == null ? '' : String(v);
}

// Arma head/body/foot para jspdf-autotable desde una definición de columnas.
function colsToTable(cols, rows, totals) {
  const head = [cols.map((c) => c.label)];
  const body = rows.map((p) => cols.map((c) => cellText(c, p)));
  const foot = totals
    ? [cols.map((c) => (c.key === 'name' ? 'TOTALES' : DESCRIPTIVE_KEYS.has(c.key) ? '' : cellText(c, totals)))]
    : undefined;
  return { head, body, foot };
}

// Fecha local en formato AAAA-MM-DD (para el nombre del archivo; ordena bien).
function isoToday() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Exporta las estadísticas del equipo a un PDF. Nombre: "Equipo - AAAA-MM-DD.pdf".
async function exportTeamPdf({ team, record, roster, pitching, battingTotal, pitchingTotal }) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const margin = 40;
  const dateReadable = new Date().toLocaleDateString('es');

  // Encabezado.
  doc.setFontSize(15);
  doc.text(team.name, margin, 44);
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text(
    `${team.league_name} · ${team.group_name || 'Sin grupo'} · Récord ${record.w}-${record.l}`,
    margin, 60
  );
  doc.text(`Estadísticas al ${dateReadable}`, margin, 74);
  doc.setTextColor(0);

  const tableOpts = {
    styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak' },
    headStyles: { fillColor: [30, 90, 168], textColor: 255, fontSize: 7 },
    footStyles: { fillColor: [232, 236, 242], textColor: 0, fontStyle: 'bold' },
    theme: 'grid',
    margin: { left: margin, right: margin },
  };

  // Bateo.
  doc.setFontSize(11);
  doc.text('Bateo', margin, 96);
  const bat = colsToTable(BAT_COLS, roster, battingTotal);
  autoTable(doc, { startY: 102, head: bat.head, body: bat.body, foot: bat.foot, ...tableOpts });

  // Pitcheo.
  let y = doc.lastAutoTable.finalY + 22;
  doc.setFontSize(11);
  doc.text('Pitcheo', margin, y);
  if (pitching.length) {
    const pit = colsToTable(PIT_COLS, pitching, pitchingTotal);
    autoTable(doc, { startY: y + 6, head: pit.head, body: pit.body, foot: pit.foot, ...tableOpts });
  } else {
    doc.setFontSize(9);
    doc.setTextColor(110);
    doc.text('Ningún lanzador con entradas registradas.', margin, y + 18);
    doc.setTextColor(0);
  }

  // Nombre de archivo: quita caracteres no válidos en nombres de archivo.
  const safeName = team.name.replace(/[\\/:*?"<>|]/g, '').trim() || 'Equipo';
  doc.save(`${safeName} - ${isoToday()}.pdf`);
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

// Lee un archivo Excel (.xlsx/.xls) o CSV y extrae { name, carnet } por fila.
// Detecta automáticamente la columna de CI (la que más celdas de 8-11 dígitos
// tiene) y arma el nombre con las demás columnas de texto (une Nombre + 1er y
// 2do apellido si vienen separados). Recupera ceros a la izquierda del CI que
// Excel pudo perder al guardarlo como número.
async function parseSpreadsheet(file) {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
  const grid = aoa.map((r) => (Array.isArray(r) ? r.map((c) => (c == null ? '' : String(c).trim())) : []));
  const ncols = grid.reduce((m, r) => Math.max(m, r.length), 0);
  if (ncols === 0) return [];

  const digitsOf = (s) => String(s).replace(/\D/g, '');
  const looksCI = (s) => {
    const d = digitsOf(s);
    const compact = String(s).replace(/\s/g, '');
    return d.length >= 8 && d.length <= 11 && d.length >= compact.length - 2;
  };

  // Columna de CI: la que más celdas tipo CI contiene.
  let ciCol = -1, best = 0;
  for (let c = 0; c < ncols; c++) {
    let count = 0;
    for (const row of grid) if (looksCI(row[c] || '')) count++;
    if (count > best) { best = count; ciCol = c; }
  }
  if (ciCol === -1) return [];

  const dataRows = grid.filter((row) => looksCI(row[ciCol] || ''));

  // Columnas de nombre: las demás con letras en las filas de datos (excluye
  // columnas de índice numérico).
  const hasLetter = (s) => /\p{L}/u.test(String(s));
  const nameCols = [];
  for (let c = 0; c < ncols; c++) {
    if (c === ciCol) continue;
    let letters = 0;
    for (const row of dataRows) if (hasLetter(row[c] || '')) letters++;
    if (letters >= Math.max(1, dataRows.length * 0.5)) nameCols.push(c);
  }

  const normCI = (s) => {
    let d = digitsOf(s);
    if (d.length >= 8 && d.length < 11) d = d.padStart(11, '0'); // recupera ceros a la izquierda
    return d.slice(0, 11);
  };

  const rows = [];
  for (const row of dataRows) {
    const name = nameCols.map((c) => row[c] || '').filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    const carnet = normCI(row[ciCol] || '');
    if (!name && !carnet) continue;
    rows.push({ name, carnet, number: '', position: '' });
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

  // Aplica texto (pegado u OCR) y regenera las filas editables.
  function applyText(t) { setText(t); setRows(parseRoster(t)); setResult(null); }

  // Importar desde Excel/CSV.
  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setOcrError('');
    try {
      const parsed = await parseSpreadsheet(file);
      if (parsed.length === 0) { setOcrError('No se detectaron filas con CI en el archivo.'); return; }
      setText('');
      setRows(parsed);
      setResult(null);
    } catch (err) {
      setOcrError(`No se pudo leer el archivo: ${err.message}`);
    }
  }

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
      await worker.setParameters({ tessedit_pageseg_mode: '4' }); // columna de texto (listas/tablas)
      const { data } = await worker.recognize(canvas);
      await worker.terminate();
      applyText(text.trim() ? `${text}\n${data.text}` : data.text);
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
        Tres formas: sube un <strong>Excel/CSV</strong> (lo más exacto), pega el
        texto, o sube una <strong>imagen</strong> (OCR). En la tabla puedes
        <strong> corregir cada fila</strong> antes de importar. Por ahora solo se
        guardan <strong>nombre y CI</strong>.
      </p>

      <div className="row" style={{ marginBottom: 10 }}>
        <label className="btn secondary small" style={{ cursor: 'pointer', margin: 0 }}>
          📄 Importar Excel / CSV
          <input type="file" accept=".xlsx,.xls,.csv,.tsv" onChange={onFile} style={{ display: 'none' }} />
        </label>
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
        onChange={(e) => applyText(e.target.value)}
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
