import { useCallback, useEffect, useState } from 'react'
import { api, type EventInfo, type GroupItem } from '../api'
import { createQueue } from '../queue'
import { normalizeKey } from '../../server/normalize'

type Tick = { groupId: string; presented: boolean }
const ticks = createQueue<Tick>('pending-group-ticks', (t) => t.groupId)
const CACHE = 'last-list'

type Cached = { event: EventInfo | null; groups: GroupItem[] }
const loadCache = (): Cached => {
  try {
    return JSON.parse(localStorage.getItem(CACHE) ?? '') as Cached
  } catch {
    return { event: null, groups: [] }
  }
}

export function Presenter() {
  const [data, setData] = useState<Cached>(loadCache())
  const [loaded, setLoaded] = useState(false)
  const [online, setOnline] = useState(true)
  const [pendingTicks, setPendingTicks] = useState<Tick[]>(ticks.items())

  const poll = useCallback(async () => {
    try {
      await ticks.flush(async (t) => {
        await api(`/api/groups/${t.groupId}/presented`, { method: 'PUT', body: { presented: t.presented } })
      })
      setPendingTicks(ticks.items())
      const { event } = await api<{ event: EventInfo | null }>('/api/events/current')
      const groups = event ? (await api<{ groups: GroupItem[] }>(`/api/list?eventId=${event.id}`)).groups : []
      const next = { event, groups }
      localStorage.setItem(CACHE, JSON.stringify(next))
      setData(next)
      setOnline(true)
    } catch (e) {
      if (e instanceof TypeError) setOnline(false)
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    void poll()
    const id = setInterval(() => void poll(), 3000)
    return () => clearInterval(id)
  }, [poll])

  function toggle(groupId: string, presented: boolean) {
    ticks.enqueue({ groupId, presented })
    setPendingTicks(ticks.items())
    void poll()
  }

  // Um grupo conta como apresentado quando todas as pessoas dele estão marcadas.
  const overlay = new Map(pendingTicks.map((t) => [t.groupId, t.presented]))
  const groups = data.groups.map((g) => ({
    ...g,
    presented: overlay.get(g.id) ?? (g.people.length > 0 && g.people.every((p) => p.presented)),
  }))
  const total = groups.length
  const done = groups.filter((g) => g.presented).length

  // Blocos por cidade e, dentro, por igreja, na ordem em que chegaram (sem repetir por acento ou caixa).
  type Block = { city: string; churches: { church: string; groups: typeof groups }[] }
  const blocks: Block[] = []
  for (const g of groups) {
    let b = blocks.find((x) => normalizeKey(x.city) === normalizeKey(g.city))
    if (!b) blocks.push((b = { city: g.city, churches: [] }))
    let ch = b.churches.find((x) => normalizeKey(x.church) === normalizeKey(g.church))
    if (!ch) b.churches.push((ch = { church: g.church, groups: [] }))
    ch.groups.push(g)
  }

  if (!loaded && data.event === null && data.groups.length === 0) return <p className="empty">Carregando...</p>
  if (data.event === null) return <p className="empty">Nenhum evento aberto.</p>

  return (
    <>
      <h1>{data.event.name}</h1>
      <p className="sub" aria-live="polite">
        {done} de {total} grupo(s) apresentados
      </p>
      <div
        className="progress"
        role="progressbar"
        aria-label="Grupos apresentados"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
      >
        <i style={{ width: total ? `${(done / total) * 100}%` : '0%' }} />
      </div>
      {!online && (
        <div className="banner" role="status">
          Sem conexão. Mostrando a última lista carregada.
        </div>
      )}
      {groups.length === 0 && <p className="empty">Nenhum visitante ainda.</p>}
      {blocks.map((b) => (
        <section className="card city-block" key={b.city} aria-label={`Cidade ${b.city}`}>
          <h2 className="city-title">{b.city}</h2>
          {b.churches.map((ch) => (
            <div className="church-block" key={ch.church} role="group" aria-label={`Igreja ${ch.church}`}>
              <h3 className="church-title">{ch.church}</h3>
              {ch.groups.map((g) => (
                <label key={g.id} className={`group-card ${g.presented ? 'done' : ''}`}>
                  <input type="checkbox" checked={g.presented} onChange={(e) => toggle(g.id, e.target.checked)} />
                  <div className="group-body">
                    <ul className="names">
                      {g.people.map((p) => (
                        <li key={p.id}>{p.name}</li>
                      ))}
                    </ul>
                    {g.observation && <div className="obs">{g.observation}</div>}
                  </div>
                </label>
              ))}
            </div>
          ))}
        </section>
      ))}
    </>
  )
}
