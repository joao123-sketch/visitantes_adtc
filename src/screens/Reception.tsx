import { useCallback, useEffect, useState } from 'react'
import { api, ApiError, type EventInfo, type GroupItem } from '../api'
import { createQueue, PermanentError } from '../queue'

type PendingGroup = {
  clientId: string
  eventId: string
  city: string
  church: string
  names: string[]
  observation: string
}

const queue = createQueue<PendingGroup>('pending-groups', (g) => g.clientId)

type Notice = { kind: 'ok' | 'warn' | 'err'; text: string } | null

export function Reception() {
  const [event, setEvent] = useState<EventInfo | null | undefined>(undefined)
  const [mine, setMine] = useState<GroupItem[]>([])
  const [pending, setPending] = useState<PendingGroup[]>(queue.items())
  const [city, setCity] = useState('')
  const [church, setChurch] = useState('')
  const [names, setNames] = useState<string[]>([''])
  const [observation, setObservation] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice>(null)
  const [online, setOnline] = useState(true)

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
        else setNotice({ kind: 'ok', text: 'Enviado!' })
      } catch (e) {
        if (e instanceof ApiError && (e.status === 400 || e.status === 404)) throw new PermanentError(e.message)
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
    setNames([''])
    setObservation('')
    setEditingId(null)
  }

  async function submit() {
    if (!event) return
    const cleaned = names.map((n) => n.trim()).filter(Boolean)
    if (!city.trim() || !church.trim() || cleaned.length === 0) {
      setNotice({ kind: 'err', text: 'Preencha cidade, igreja e pelo menos um nome.' })
      return
    }
    if (editingId) {
      try {
        await api(`/api/groups/${editingId}`, {
          method: 'PUT',
          body: { city, church, names: cleaned, observation: observation || null },
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
    queue.enqueue({ clientId: crypto.randomUUID(), eventId: event.id, city, church, names: cleaned, observation })
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
    setNames(g.people.map((p) => p.name))
    setObservation(g.observation ?? '')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function remove(g: GroupItem) {
    if (!confirm(`Apagar ${g.people.map((p) => p.name).join(', ')}?`)) return
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
        {!online && <div className="banner">Sem conexão.</div>}
        <p className="empty">Nenhum evento aberto.</p>
      </>
    )

  return (
    <>
      <h1>{event.name}</h1>
      <p className="sub">
        {event.event_date}
        {pending.length > 0 && <span className="tag">{pending.length} pendente(s)</span>}
      </p>
      {!online && <div className="banner">Sem conexão. O que você anotar fica guardado e é enviado quando a internet voltar.</div>}
      {notice && <div className={`banner ${notice.kind === 'ok' ? 'ok' : notice.kind === 'err' ? 'err' : ''}`}>{notice.text}</div>}

      <div className="card">
        <strong>{editingId ? 'Editar visitante' : 'Novo visitante'}</strong>
        <label htmlFor="cidade">Cidade</label>
        <input id="cidade" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ex: Ipueiras" />
        <label htmlFor="igreja">Igreja</label>
        <input id="igreja" value={church} onChange={(e) => setChurch(e.target.value)} placeholder="Ex: ADTC" />
        <label>Pessoas</label>
        {names.map((n, i) => (
          <div className="row" key={i}>
            <input
              value={n}
              placeholder={`Nome ${i + 1}`}
              onChange={(e) => setNames(names.map((x, j) => (j === i ? e.target.value : x)))}
            />
            {names.length > 1 && (
              <button className="x" aria-label="Remover" onClick={() => setNames(names.filter((_, j) => j !== i))}>
                ✕
              </button>
            )}
          </div>
        ))}
        <button className="link" onClick={() => setNames([...names, ''])}>
          ＋ Adicionar pessoa
        </button>
        <label htmlFor="obs">Observações (opcional)</label>
        <textarea id="obs" value={observation} onChange={(e) => setObservation(e.target.value)} />
        <button className="btn" onClick={submit}>
          {editingId ? 'Salvar alteração' : 'Enviar'}
        </button>
        {editingId && (
          <button className="btn ghost" onClick={resetForm}>
            Cancelar
          </button>
        )}
      </div>

      <h3>Enviados por mim</h3>
      {pending.length === 0 && mine.length === 0 && <p className="empty">Nada enviado ainda.</p>}
      {pending.map((g) => (
        <div className="card" key={g.clientId}>
          <div className="group-title">
            {g.city} · {g.church} <span className="tag">pendente</span>
          </div>
          {g.names.join(', ')}
        </div>
      ))}
      {[...mine].reverse().map((g) => (
        <div className="card" key={g.id}>
          <div className="group-title">
            {g.city} · {g.church}
          </div>
          {g.people.map((p) => p.name).join(', ')}
          {g.observation && <div className="obs">{g.observation}</div>}
          <div className="actions">
            <button className="link" onClick={() => startEdit(g)}>
              Editar
            </button>
            <button className="link" style={{ color: 'var(--red)' }} onClick={() => remove(g)}>
              Apagar
            </button>
          </div>
        </div>
      ))}
    </>
  )
}
