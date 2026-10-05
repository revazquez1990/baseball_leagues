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

  const crearGrupos = () => run(
    () => api.post(`/leagues/${league.id}/groups`),
    'Grupos creados. Asigna cada equipo abajo.'
  );

  // Asignación manual: sin mensaje para que sea fluido al cambiar el select.
  const asignarGrupo = (teamId, groupId) =>
    run(() => api.put(`/teams/${teamId}/group`, { group_id: groupId || null }));

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

          {/* Paso 2: grupos (sorteo aleatorio o asignación manual) */}
          {league.format === 'groups' && (
            <>
              <h4 style={{ marginTop: 20 }}>2. Grupos ({league.num_groups})</h4>
              <p className="muted" style={{ marginTop: 0 }}>
                Sortea los {teams.length} equipos al azar, o asígnalos tú mismo.
                Puedes combinar: sortear y luego ajustar manualmente.
              </p>
              <div className="row">
                <button className="btn" onClick={sortear} disabled={busy || teams.length < 2}>
                  🎲 Sortear grupos
                </button>
                <button className="btn secondary" onClick={crearGrupos}
                        disabled={busy || groups.length >= league.num_groups}>
                  ✎ Crear grupos para asignar manual
                </button>
              </div>

              {groups.length > 0 && (
                <div className="table-wrap" style={{ marginTop: 14 }}>
                  <table>
                    <thead>
                      <tr><th>Equipo</th><th style={{ textAlign: 'left' }}>Grupo</th></tr>
                    </thead>
                    <tbody>
                      {teams.map((t) => (
                        <tr key={t.id}>
                          <td>
                            <span className="tag" style={{ background: t.color }} />{t.name}
                          </td>
                          <td style={{ textAlign: 'left' }}>
                            <select
                              value={t.group_id ?? ''}
                              onChange={(e) => asignarGrupo(t.id, e.target.value)}
                              disabled={busy}
                              style={{ maxWidth: 200 }}
                            >
                              <option value="">— Sin grupo —</option>
                              {groups.map((g) => (
                                <option key={g.id} value={g.id}>{g.name}</option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="row" style={{ marginTop: 10 }}>
                    {groups.map((g) => {
                      const n = teams.filter((t) => t.group_id === g.id).length;
                      return <span key={g.id} className="pill">{g.name}: {n}</span>;
                    })}
                  </div>
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
