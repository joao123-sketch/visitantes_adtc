import { useCallback, useEffect, useState } from 'react'
import { api, type EventInfo, type GroupItem } from '../api'
import { createQueue } from '../queue'

type Tick = { personId: string; presented: boolean }
const ticks = createQueue<Tick>('pending-ticks', (t) => t.personId)
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
        await api(`/api/people/${t.personId}/presented`, { method: 'PUT', body: { presented: t.presented } })
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

  function toggle(personId: string, presented: boolean) {
    ticks.enqueue({ personId, presented })
    setPendingTicks(ticks.items())
    void poll()
  }

  const overlay = new Map(pendingTicks.map((t) => [t.personId, t.presented]))
  const groups = data.groups.map((g) => ({
    ...g,
    people: g.people.map((p) => ({ ...p, presented: overlay.get(p.id) ?? p.presented })),
  }))
  const total = groups.reduce((n, g) => n + g.people.length, 0)
  const done = groups.reduce((n, g) => n + g.people.filter((p) => p.presented).length, 0)

  if (!loaded && data.event === null && data.groups.length === 0) return <p className="empty">Carregando...</p>
  if (data.event === null) return <p className="empty">Nenhum evento aberto.</p>

  return (
    <>
      <h1>{data.event.name}</h1>
      <p className="sub">
        {groups.length} grupo(s) · {done} de {total} apresentados
      </p>
      {!online && <div className="banner">Sem conexão. Mostrando a última lista carregada.</div>}
      {groups.length === 0 && <p className="empty">Nenhum visitante ainda.</p>}
      {groups.map((g) => (
        <div className="card" key={g.id}>
          <div className="group-title">
            {g.city} · {g.church}
          </div>
          {g.people.map((p) => (
            <label key={p.id} className={`person ${p.presented ? 'done' : ''}`} style={{ margin: 0, color: 'inherit' }}>
              <input type="checkbox" checked={p.presented} onChange={(e) => toggle(p.id, e.target.checked)} />
              <span>{p.name}</span>
            </label>
          ))}
          {g.observation && <div className="obs">{g.observation}</div>}
        </div>
      ))}
    </>
  )
}
