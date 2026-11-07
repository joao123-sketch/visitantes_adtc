import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError, type EventInfo, type GroupItem } from '../api'
import { createQueue, PermanentError } from '../queue'
import { formatDate } from '../format'
import { OfflinePill, Skeleton, useToast } from '../ui'

type PendingGroup = {
  clientId: string
  eventId: string
  city: string
  church: string
  names: string[]
  observation: string
}
type Row = { id?: string; name: string }
type Cached = { event: EventInfo | null; groups: GroupItem[] }

const queue = createQueue<PendingGroup>('pending-groups', (g) => g.clientId)
const CACHE = 'reception-cache'
const emptyRows = (): Row[] => [{ name: '' }]

const loadCache = (): Cached | null => {
  try {
    const v = JSON.parse(localStorage.getItem(CACHE) ?? '') as Cached
    return v && Array.isArray(v.groups) ? v : null
  } catch {
    return null
  }
}

/** Mantém a referência antiga quando nada mudou, para o React não redesenhar à toa. */
const keep = <T,>(prev: T, next: T): T => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next)

export function Reception() {
  const [cache] = useState(loadCache) // mostra o último estado na hora, sem tela de carregando
  const [event, setEvent] = useState<EventInfo | null | undefined>(cache ? cache.event : undefined)
  const [mine, setMine] = useState<GroupItem[]>(cache?.groups ?? [])
  const [pending, setPending] = useState<PendingGroup[]>(queue.items())
  const [failed, setFailed] = useState(queue.failed())
  const [city, setCity] = useState('')
  const [church, setChurch] = useState('')
  const [rows, setRows] = useState<Row[]>(emptyRows())
  const [observation, setObservation] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [online, setOnline] = useState(true)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const { toast, show } = useToast(96) // acima da barra fixa de envio
  const lastJson = useRef(cache ? JSON.stringify(cache) : '')

  // Uma chamada só traz o evento aberto e os envios deste aparelho; a tela só muda se algo mudou de verdade.
  const refresh = useCallback(async () => {
    try {
      const r = await api<Cached>('/api/groups/mine')
      const json = JSON.stringify(r)
      if (json !== lastJson.current) {
        lastJson.current = json
        localStorage.setItem(CACHE, json)
        setEvent(r.event)
        setMine(r.groups)
      }
      setOnline(true)
    } catch (e) {
      if (e instanceof TypeError) setOnline(false)
    }
  }, [])

  const sync = useCallback(async () => {
    await queue.flush(async (g) => {
      try {
        const r = await api<{ added: string[]; duplicates: string[] }>('/api/groups', { method: 'POST', body: g })
        if (r.added.length === 0) show('warn', `Já estava na lista: ${r.duplicates.join(', ')}`)
        else if (r.duplicates.length) show('ok', `Enviado. Já estavam na lista: ${r.duplicates.join(', ')}`)
        else show('ok', 'Enviado com sucesso.')
      } catch (e) {
        if (e instanceof ApiError && (e.status === 400 || e.status === 404)) {
          show('err', 'Um envio foi recusado. Veja em "Não enviados".')
          throw new PermanentError(e.message) // vai para "Não enviados", sem perder o que foi digitado
        }
        throw e
      }
    })
    setPending((prev) => keep(prev, queue.items()))
    setFailed((prev) => keep(prev, queue.failed()))
    await refresh()
  }, [refresh, show])

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
      show('err', 'Preencha cidade, igreja e pelo menos um nome.')
      return
    }
    if (editingId) {
      try {
        await api(`/api/groups/${editingId}`, {
          method: 'PUT',
          body: { city, church, people: filled.map((r) => ({ id: r.id, name: r.name.trim() })), observation: observation || null },
        })
        show('ok', 'Alteração salva.')
        resetForm()
        await refresh()
      } catch (e) {
        show('err', e instanceof TypeError ? 'Sem conexão. Para editar é preciso internet.' : (e as Error).message)
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
    await sync() // o aviso final ("Enviado" ou "Sem conexão") aparece uma vez só, sem avisos intermediários
    if (queue.count() > 0) show('warn', 'Sem conexão: ficou pendente e será enviado sozinho.')
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
      show('err', e instanceof TypeError ? 'Sem conexão. Para apagar é preciso internet.' : (e as Error).message)
    }
  }

  function retryFailed(id: string) {
    if (!event) {
      show('err', 'Não há evento aberto para reenviar.')
      return
    }
    queue.retry(id, (g) => ({ ...g, eventId: event.id })) // reenvia para o evento que está aberto agora
    setFailed(queue.failed())
    setPending(queue.items())
    void sync()
  }

  function discardFailed(id: string) {
    queue.discard(id)
    setFailed(queue.failed())
  }

  if (event === undefined)
    return (
      <>
        <OfflinePill online={online} />
        <Skeleton rows={3} />
      </>
    )
  if (event === null)
    return (
      <>
        <OfflinePill online={online} />
        <p className="empty">Nenhum evento aberto.</p>
        {toast}
      </>
    )

  return (
    <>
      <OfflinePill online={online} text="Sem conexão: o que você anotar fica guardado" />
      <h1>{event.name}</h1>
      <p className="sub">
        {formatDate(event.event_date)}
        {pending.length > 0 && <span className="tag">{pending.length} pendente(s)</span>}
      </p>

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

      {failed.length > 0 && (
        <>
          <h2>Não enviados</h2>
          {failed.map((f) => (
            <div className="card" key={f.item.clientId}>
              <div className="group-head">
                {f.item.city} · {f.item.church} <span className="tag">recusado</span>
              </div>
              {f.item.names.join(', ')}
              <div className="obs">{f.error}</div>
              <div className="actions">
                <button className="link" onClick={() => retryFailed(f.item.clientId)}>
                  Tentar de novo
                </button>
                <button className="link danger" onClick={() => discardFailed(f.item.clientId)}>
                  Descartar
                </button>
              </div>
            </div>
          ))}
        </>
      )}

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
      {toast}
    </>
  )
}
