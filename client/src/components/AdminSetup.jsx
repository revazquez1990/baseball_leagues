import { useState } from 'react';
import { api } from '../api.js';

export default function AdminSetup({ league, groups, teams, onChange }) {
  const [open, setOpen] = useState(teams.length === 0);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  // Form equipo individual / lote
  const [teamName, setTeamName] = useState('');
  const [bulkCount, setBulkCount] = useState(8);
  const [startDate, setStartDate] = useState('');

  async function run(fn, okMsg) {
    setBusy(true); setMsg(null);
    try {
      await fn();
      if (okMsg) setMsg({ type: 'ok', text: okMsg });
      onChange();
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  const addTeam = () => run(async () => {
    if (!teamName.trim()) throw new Error('Escribe un nombre');
    await api.post(`/leagues/${league.id}/teams`, { name: teamName.trim() });
    setTeamName('');
  }, 'Equipo agregado');

  const addBulk = () => run(
    () => api.post(`/leagues/${league.id}/teams/bulk`, { count: Number(bulkCount) }),
    `${bulkCount} equipos creados`
  );

  const sortear = () => run(
    () => api.post(`/leagues/${league.id}/assign-groups`),
    'Equipos repartidos en grupos aleatoriamente'
  );

  const generar = () => run(
    () => api.post(`/leagues/${league.id}/schedule`, { startDate: startDate || null }),
    'Calendario generado'
  );

  const delTeam = (t) => run(() => api.del(`/teams/${t.id}`));

  return (
    <div className="panel" style={{ borderColor: 'var(--accent-2)' }}>
      <div className="spread">
        <strong>⚙ Administración</strong>
        <button className="btn secondary small" onClick={() => setOpen((o) => !o)}>
          {open ? 'Ocultar' : 'Mostrar'}
        </button>
      </div>

      {open && (
        <div style={{ marginTop: 14 }}>
          {msg && <div className={msg.type}>{msg.text}</div>}

          {/* Paso 1: equipos */}
          <h4>1. Equipos ({teams.length})</h4>
          <div className="form-row">
            <div style={{ flex: 2 }}>
              <label>Agregar equipo</label>
              <div className="row">
                <input value={teamName} onChange={(e) => setTeamName(e.target.value)}
                       placeholder="Nombre del equipo"
                       onKeyDown={(e) => e.key === 'Enter' && addTeam()} />
                <button className="btn" onClick={addTeam} disabled={busy}>Agregar</button>
              </div>
            </div>
            <div>
              <label>Crear en lote (cantidad)</label>
              <div className="row">
                <input type="number" min="1" max="64" value={bulkCount}
                       onChange={(e) => setBulkCount(e.target.value)} />
                <button className="btn secondary" onClick={addBulk} disabled={busy}>Crear</button>
              </div>
            </div>
          </div>

          {teams.length > 0 && (
            <div className="row" style={{ gap: 8 }}>
              {teams.map((t) => (
                <span key={t.id} className="badge" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  <span className="tag" style={{ background: t.color, margin: 0 }} />
                  {t.name}
                  {t.group_name && <em className="muted">({t.group_name})</em>}
                  <button className="btn danger small" style={{ padding: '0 6px' }}
                          onClick={() => delTeam(t)} title="Eliminar">×</button>
                </span>
              ))}
            </div>
          )}

          {/* Paso 2: sorteo */}
          {league.format === 'groups' && (
            <>
              <h4 style={{ marginTop: 20 }}>2. Sortear grupos ({league.num_groups})</h4>
              <p className="muted" style={{ marginTop: 0 }}>
                Reparte los {teams.length} equipos al azar en {league.num_groups} grupos.
              </p>
              <button className="btn" onClick={sortear} disabled={busy || teams.length < 2}>
                🎲 Sortear grupos
              </button>
              {groups.length > 0 && (
                <div className="row" style={{ marginTop: 10 }}>
                  {groups.map((g) => (
                    <span key={g.id} className="pill">{g.name}</span>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Paso 3: calendario */}
          <h4 style={{ marginTop: 20 }}>
            {league.format === 'groups' ? '3' : '2'}. Generar calendario
          </h4>
          <p className="muted" style={{ marginTop: 0 }}>
            Round-robin justo: todos juegan la misma cantidad ({league.rounds} vuelta/s).
            Vuelve a generarlo y se reemplaza (los boxscores de temporada regular se borran).
          </p>
          <div className="form-row">
            <div>
              <label>Fecha de inicio (opcional)</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
          </div>
          <button className="btn" onClick={generar} disabled={busy || teams.length < 2}>
            📅 Generar calendario
          </button>
        </div>
      )}
    </div>
  );
}
