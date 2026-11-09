import { useCallback, useEffect, useState } from 'react'
import { api, type EventInfo } from '../api'
import { formatDate } from '../format'
import { DEPARTMENTS, deptKey, eventName } from '../presets'
import { useDept } from '../useDept'
import { isoDate, nextOccurrence, WEEKLY_SERVICES } from '../schedule'
import { Skeleton, useToast } from '../ui'

export function Admin() {
  const [events, setEvents] = useState<EventInfo[]>([])
  const [name, setName] = useState('')
  const [dept, setDept] = useState('')
  const [date, setDate] = useState(isoDate(new Date()))
  const [confirmClose, setConfirmClose] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const { toast, show } = useToast()

  const load = useCallback(async () => {
    try {
      setEvents((await api<{ events: EventInfo[] }>('/api/events')).events)
    } catch (e) {
      show('err', (e as Error).message)
    } finally {
      setLoaded(true)
    }
  }, [show])
  useEffect(() => void load(), [load])

  async function run(fn: () => Promise<unknown>, okText: string) {
    try {
      await fn()
      show('ok', okText)
      await load()
    } catch (e) {
      show('err', e instanceof TypeError ? 'Sem conexão.' : (e as Error).message)
    }
  }

  const open = events.find((e) => e.status === 'open')
  useDept(deptKey(open ? open.name : eventName(name, dept))) // mostra já o estilo do departamento escolhido

  // Confirmação dentro do app (a janela nativa do navegador pode ser bloqueada).
  const deleteBox = (ev: EventInfo) => (
    <div role="alertdialog" aria-label={`Confirmar exclusão do evento ${ev.name}`}>
      <div className="banner err">
        Excluir “{ev.name}” e todos os visitantes dele? Não dá para desfazer.
      </div>
      <button
        className="btn"
        onClick={async () => {
          setConfirmDeleteId(null)
          await run(() => api(`/api/events/${ev.id}`, { method: 'DELETE' }), 'Evento excluído.')
        }}
      >
        Sim, excluir
      </button>
      <button className="btn secondary" onClick={() => setConfirmDeleteId(null)}>
        Cancelar
      </button>
    </div>
  )

  // Até a primeira resposta, esqueleto no lugar do formulário (senão aparecia "Abrir evento" e logo trocava).
  if (!loaded)
    return (
      <>
        <h1>Administração</h1>
        <Skeleton rows={2} header={false} />
      </>
    )

  return (
    <>
      <h1>Administração</h1>

      <div className="card">
        <div className="card-title">Evento aberto</div>
        {open ? (
          <>
            <p>
              {open.name} · {formatDate(open.event_date)}
            </p>
            {!confirmClose ? (
              <button className="btn" onClick={() => setConfirmClose(true)}>
                Encerrar evento
              </button>
            ) : (
              <div role="alertdialog" aria-label="Confirmar encerramento do evento">
                <div className="banner">Encerrar este evento? A recepção não poderá mais editar nem apagar os envios.</div>
                <button
                  className="btn"
                  onClick={async () => {
                    setConfirmClose(false)
                    await run(() => api(`/api/events/${open.id}/close`, { method: 'POST' }), 'Evento encerrado.')
                  }}
                >
                  Sim, encerrar
                </button>
                <button className="btn secondary" onClick={() => setConfirmClose(false)}>
                  Cancelar
                </button>
              </div>
            )}
            {confirmDeleteId === open.id ? (
              deleteBox(open)
            ) : (
              <button className="btn secondary" onClick={() => setConfirmDeleteId(open.id)}>
                Excluir evento
              </button>
            )}
          </>
        ) : (
          <>
            <p className="sub">Nenhum evento aberto. Escolha um culto da semana ou crie outro evento.</p>
            <div className="agenda" role="group" aria-label="Cultos da semana">
              {WEEKLY_SERVICES.map((sv) => {
                const when = nextOccurrence(sv.weekday)
                const picked = name === sv.name && date === when
                const d = new Date(`${when}T12:00:00`)
                const wd = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').toUpperCase()
                const dm = `${String(d.getDate()).padStart(2, '0')}/${d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase()}`
                return (
                  <button
                    key={sv.id}
                    type="button"
                    className={`agenda-item${picked ? ' on' : ''}`}
                    aria-pressed={picked}
                    onClick={() => {
                      setName(sv.name)
                      setDate(when)
                    }}
                  >
                    <span className="agenda-date">
                      {wd}
                      <b>{dm}</b>
                    </span>
                    <span className="agenda-body">{sv.name}</span>
                  </button>
                )
              })}
            </div>
            <div className="open-form">
            <label htmlFor="ev-nome">Nome do evento</label>
            <input id="ev-nome" value={name} onChange={(e) => setName(e.target.value)} />
            <span className="label" id="ev-dep">
              Departamento
            </span>
            <div className="chips" role="group" aria-labelledby="ev-dep">
              {DEPARTMENTS.map((d) => (
                <button key={d} type="button" className={`chip${dept === d ? ' on' : ''}`} aria-pressed={dept === d} onClick={() => setDept(dept === d ? '' : d)}>
                  {d}
                </button>
              ))}
            </div>
            <label htmlFor="ev-data">Data</label>
            <input id="ev-data" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <button
              className="btn open-btn"
              disabled={!name.trim()}
              onClick={() =>
                run(async () => {
                  await api('/api/events', { method: 'POST', body: { name: eventName(name, dept), eventDate: date } })
                  setName('')
                  setDept('')
                }, 'Evento aberto.')
              }
            >
              Abrir evento
            </button>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <div className="card-title">Eventos anteriores</div>
        {events.filter((e) => e.status === 'closed').length === 0 && <p className="sub">Nenhum.</p>}
        {events
          .filter((e) => e.status === 'closed')
          .map((e) => (
            <div key={e.id} className="past-item">
              <div className="past-name">
                {e.name} · {formatDate(e.event_date)}
              </div>
              <div className="past-actions">
                {!open && (
                  <button className="btn secondary small" onClick={() => run(() => api(`/api/events/${e.id}/reopen`, { method: 'POST' }), 'Evento reaberto.')}>
                    Reabrir
                  </button>
                )}
                {confirmDeleteId !== e.id && (
                  <button className="btn secondary small" aria-label={`Excluir o evento ${e.name}`} onClick={() => setConfirmDeleteId(e.id)}>
                    Excluir
                  </button>
                )}
              </div>
              {confirmDeleteId === e.id && <div style={{ marginTop: 8 }}>{deleteBox(e)}</div>}
            </div>
          ))}
      </div>

      {toast}
    </>
  )
}
