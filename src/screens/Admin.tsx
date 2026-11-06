import { useCallback, useEffect, useState } from 'react'
import { api, type EventInfo, type Role } from '../api'
import { formatDate } from '../format'

const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administrador',
  reception: 'Recepção',
  presenter: 'Apresentador',
}

export function Admin() {
  const [events, setEvents] = useState<EventInfo[]>([])
  const [name, setName] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [pins, setPins] = useState<Record<Role, string>>({ admin: '', reception: '', presenter: '' })
  const [confirmClose, setConfirmClose] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    try {
      setEvents((await api<{ events: EventInfo[] }>('/api/events')).events)
    } catch (e) {
      setNotice({ ok: false, text: (e as Error).message })
    }
  }, [])
  useEffect(() => void load(), [load])

  async function run(fn: () => Promise<unknown>, okText: string) {
    try {
      await fn()
      setNotice({ ok: true, text: okText })
      await load()
    } catch (e) {
      setNotice({ ok: false, text: e instanceof TypeError ? 'Sem conexão.' : (e as Error).message })
    }
  }

  const open = events.find((e) => e.status === 'open')

  return (
    <>
      <h1>Administração</h1>
      {notice && <div role="status" aria-live="polite"><div className={`banner ${notice.ok ? 'ok' : 'err'}`}>{notice.text}</div></div>}

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
          </>
        ) : (
          <>
            <p className="sub">Nenhum evento aberto.</p>
            <label htmlFor="ev-nome">Nome do evento</label>
            <input id="ev-nome" value={name} onChange={(e) => setName(e.target.value)} />
            <label htmlFor="ev-data">Data</label>
            <input id="ev-data" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <button
              className="btn"
              disabled={!name.trim()}
              onClick={() =>
                run(async () => {
                  await api('/api/events', { method: 'POST', body: { name, eventDate: date } })
                  setName('')
                }, 'Evento aberto.')
              }
            >
              Abrir evento
            </button>
          </>
        )}
      </div>

      <div className="card">
        <div className="card-title">Eventos anteriores</div>
        {events.filter((e) => e.status === 'closed').length === 0 && <p className="sub">Nenhum.</p>}
        {events
          .filter((e) => e.status === 'closed')
          .map((e) => (
            <div className="row" key={e.id} style={{ marginTop: 8 }}>
              <span style={{ flex: 1 }}>
                {e.name} · {formatDate(e.event_date)}
              </span>
              {!open && (
                <button className="btn secondary small" onClick={() => run(() => api(`/api/events/${e.id}/reopen`, { method: 'POST' }), 'Evento reaberto.')}>
                  Reabrir
                </button>
              )}
            </div>
          ))}
      </div>

      <div className="card">
        <div className="card-title">Códigos de acesso</div>
        {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
          <div key={r}>
            <label htmlFor={`pin-${r}`}>{ROLE_LABEL[r]}</label>
            <div className="row">
              <input
                id={`pin-${r}`}
                inputMode="numeric"
                maxLength={8}
                value={pins[r]}
                onChange={(e) => setPins({ ...pins, [r]: e.target.value.replace(/\D/g, '') })}
              />
              <button
                className="btn small"
                disabled={pins[r].length < 3}
                onClick={() =>
                  run(async () => {
                    await api(`/api/pins/${r}`, { method: 'PUT', body: { pin: pins[r] } })
                    setPins({ ...pins, [r]: '' })
                  }, `Código de ${ROLE_LABEL[r]} alterado.`)
                }
              >
                Trocar
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
