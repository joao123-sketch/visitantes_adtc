import { useCallback, useEffect, useState } from 'react'
import { api, ApiError, type EventInfo, type GroupItem } from '../api'
import { createQueue, PermanentError } from '../queue'
import { formatDate } from '../format'

type PendingGroup = {
  clientId: string
  eventId: string
  city: string
  church: string
  names: string[]
  observation: string
}
type Row = { id?: string; name: string }

const queue = createQueue<PendingGroup>('pending-groups', (g) => g.clientId)

type Notice = { kind: 'ok' | 'warn' | 'err'; text: string } | null
const emptyRows = (): Row[] => [{ name: '' }]

export function Reception() {
  const [event, setEvent] = useState<EventInfo | null | undefined>(undefined)
  const [mine, setMine] = useState<GroupItem[]>([])
  const [pending, setPending] = useState<PendingGroup[]>(queue.items())
  const [city, setCity] = useState('')
  const [church, setChurch] = useState('')
  const [rows, setRows] = useState<Row[]>(emptyRows())
  const [observation, setObservation] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice>(null)
  const [online, setOnline] = useState(true)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const { event: ev } = await api<{ event: EventInfo | null }>('/api/events/current')
      setEvent(ev)
      setOnline(true)
      if (ev) setMine((await api<{ groups: GroupItem[] }>(`/api/groups/mine?eventId=${ev.id}`)).groups)
    } catch (e) {
      if (e instanceof TypeError) setOnline(false)
    }
  }, [])

  const sync = useCallback(async () => {
    await queue.flush(async (g) => {
      try {
        const r = await api<{ added: string[]; duplicates: string[] }>('/api/groups', { method: 'POST', body: g })
        if (r.added.length === 0) setNotice({ kind: 'warn', text: `Já estava na lista: ${r.duplicates.join(', ')}` })
        else if (r.duplicates.length)
          setNotice({ kind: 'ok', text: `Enviado. Já estavam na lista: ${r.duplicates.join(', ')}` })
        else setNotice({ kind: 'ok', text: 'Enviado com sucesso.' })
      } catch (e) {
        if (e instanceof ApiError && (e.status === 400 || e.status === 404)) {
          setNotice({ kind: 'err', text: `Um envio foi recusado e descartado: ${e.message}` })
          throw new PermanentError(e.message)
        }
        throw e
      }
    })
    setPending(queue.items())
    await refresh()
  }, [refresh])

  useEffect(() => {
    void sync()
    const id = setInterval(() => void sync(), 8000)
    const onOnline = () => void sync()
    window.addEventListener('online', onOnline)
    return () => {
      clearInterval(id)
      window.removeEventListener('online', onOnline)
    }
  }, [sync])

  const resetForm = () => {
    setCity('')
    setChurch('')
    setRows(emptyRows())
    setObservation('')
    setEditingId(null)
  }

  const filled = rows.filter((r) => r.name.trim())

  async function submit() {
    if (!event) return
    if (!city.trim() || !church.trim() || filled.length === 0) {
      setNotice({ kind: 'err', text: 'Preencha cidade, igreja e pelo menos um nome.' })
      return
    }
    if (editingId) {
      try {
        await api(`/api/groups/${editingId}`, {
          method: 'PUT',
          body: { city, church, people: filled.map((r) => ({ id: r.id, name: r.name.trim() })), observation: observation || null },
        })
        setNotice({ kind: 'ok', text: 'Alteração salva.' })
        resetForm()
        await refresh()
      } catch (e) {
        setNotice({
          kind: 'err',
          text: e instanceof TypeError ? 'Sem conexão. Para editar é preciso internet.' : (e as Error).message,
        })
      }
      return
    }
    queue.enqueue({
      clientId: crypto.randomUUID(),
      eventId: event.id,
      city,
      church,
      names: filled.map((r) => r.name.trim()),
      observation,
    })
    setPending(queue.items())
    resetForm()
    setNotice({ kind: 'warn', text: 'Guardado no celular. Enviando...' })
    await sync()
    if (queue.count() > 0) setNotice({ kind: 'warn', text: 'Sem conexão: ficou pendente e será enviado sozinho.' })
  }

  function startEdit(g: GroupItem) {
    setEditingId(g.id)
    setCity(g.city)
    setChurch(g.church)
    setRows(g.people.map((p) => ({ id: p.id, name: p.name })))
    setObservation(g.observation ?? '')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function remove(g: GroupItem) {
    setConfirmingId(null)
    try {
      await api(`/api/groups/${g.id}`, { method: 'DELETE' })
      await refresh()
    } catch (e) {
      setNotice({
        kind: 'err',
        text: e instanceof TypeError ? 'Sem conexão. Para apagar é preciso internet.' : (e as Error).message,
      })
    }
  }

  if (event === undefined) return <p className="empty">Carregando...</p>
  if (event === null)
    return (
      <>
        {!online && (
          <div className="banner" role="status">
            Sem conexão.
          </div>
        )}
        <p className="empty">Nenhum evento aberto.</p>
      </>
    )

  return (
    <>
      <h1>{event.name}</h1>
      <p className="sub">
        {formatDate(event.event_date)}
        {pending.length > 0 && <span className="tag">{pending.length} pendente(s)</span>}
      </p>
      {!online && (
        <div className="banner" role="status">
          Sem conexão. O que você anotar fica guardado e é enviado quando a internet voltar.
        </div>
      )}
      <div role="status" aria-live="polite">
        {notice && <div className={`banner ${notice.kind === 'ok' ? 'ok' : notice.kind === 'err' ? 'err' : ''}`}>{notice.text}</div>}
      </div>

      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <div className="card-title">{editingId ? 'Editar visitante' : 'Novo visitante'}</div>
        <label htmlFor="cidade">Cidade</label>
        <input id="cidade" value={city} onChange={(e) => setCity(e.target.value)} autoComplete="off" />
        <label htmlFor="igreja">Igreja</label>
        <input id="igreja" value={church} onChange={(e) => setChurch(e.target.value)} autoComplete="off" />
        <span className="label" id="pessoas-label">
          Pessoas
        </span>
        {rows.map((r, i) => (
          <div className="row" key={i}>
            <input
              aria-labelledby="pessoas-label"
              aria-label={`Nome da pessoa ${i + 1}`}
              value={r.name}
              autoComplete="off"
              onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
            />
            {rows.length > 1 && (
              <button type="button" className="x" aria-label={`Remover pessoa ${i + 1}`} onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                ✕
              </button>
            )}
          </div>
        ))}
        <button type="button" className="link" onClick={() => setRows([...rows, { name: '' }])}>
          ＋ Adicionar pessoa
        </button>
        <label htmlFor="obs">Observações (opcional)</label>
        <textarea id="obs" value={observation} onChange={(e) => setObservation(e.target.value)} />
        {editingId && (
          <button type="button" className="btn secondary" onClick={resetForm} style={{ marginTop: 14 }}>
            Cancelar edição
          </button>
        )}
        <button type="submit" className="sr-only">
          {editingId ? 'Salvar alteração' : 'Enviar'}
        </button>
      </form>

      <h2>Enviados por mim</h2>
      {pending.length === 0 && mine.length === 0 && <p className="empty">Nada enviado ainda.</p>}
      {pending.map((g) => (
        <div className="card" key={g.clientId}>
          <div className="group-head">
            {g.city} · {g.church} <span className="tag">pendente</span>
          </div>
          {g.names.join(', ')}
        </div>
      ))}
      {[...mine].reverse().map((g) => (
        <div className="card" key={g.id}>
          <div className="group-head">
            {g.city} · {g.church}
          </div>
          {g.people.map((p) => p.name).join(', ')}
          {g.observation && <div className="obs">{g.observation}</div>}
          <div className="actions">
            <button className="link" onClick={() => startEdit(g)}>
              Editar
            </button>
            {confirmingId === g.id ? (
              <>
                <button className="link danger" onClick={() => remove(g)}>
                  Sim, apagar
                </button>
                <button className="link" onClick={() => setConfirmingId(null)}>
                  Cancelar
                </button>
              </>
            ) : (
              <button className="link danger" onClick={() => setConfirmingId(g.id)}>
                Apagar
              </button>
            )}
          </div>
        </div>
      ))}

      <div className="bar">
        <div className="info">
          {filled.length} pessoa(s)
          <b>{editingId ? 'Editando' : 'Novo envio'}</b>
        </div>
        <button className="btn" onClick={() => void submit()}>
          {editingId ? 'Salvar alteração' : 'Enviar'}
        </button>
      </div>
    </>
  )
}
