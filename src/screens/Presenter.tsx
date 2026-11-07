import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import { createQueue } from '../queue'
import { createSerialRunner } from '../serialRunner'
import { addTick, syncPresenter, type Cached, type Tick } from '../presenterSync'
import { formatDate } from '../format'
import { OfflinePill, Skeleton } from '../ui'
import { normalizeKey } from '../../server/normalize'

const ticks = createQueue<Tick>('pending-group-ticks', (t) => t.groupId)
const CACHE = 'last-list'

const loadCache = (): Cached | null => {
  try {
    const v = JSON.parse(localStorage.getItem(CACHE) ?? '') as Cached
    return v && Array.isArray(v.groups) ? v : null
  } catch {
    return null
  }
}

export function Presenter() {
  const [cache] = useState(loadCache) // mostra a última lista na hora, sem tela de carregando
  const [data, setData] = useState<Cached>(cache ?? { event: null, groups: [] })
  const lastJson = useRef(cache ? JSON.stringify(cache) : '')
  const [loaded, setLoaded] = useState(false)
  const [online, setOnline] = useState(true)
  const [pendingTicks, setPendingTicks] = useState<Tick[]>(ticks.items())

  // Nunca roda dois ciclos ao mesmo tempo: assim uma resposta velha não sobrescreve a nova.
  const poll = useMemo(
    () =>
      createSerialRunner(async () => {
        try {
          const { data: next, pending } = await syncPresenter({
            ticks,
            sendTick: async (t) => {
              await api(`/api/groups/${t.groupId}/presented`, { method: 'PUT', body: { presented: t.presented } })
            },
            // uma chamada só traz o evento aberto e a lista
            fetchList: () => api<Cached>('/api/list'),
          })
          // lista e pendências mudam juntas, para a caixinha não piscar; sem mudança real, nada é redesenhado
          const json = JSON.stringify(next)
          if (json !== lastJson.current) {
            lastJson.current = json
            localStorage.setItem(CACHE, json)
            setData(next)
          }
          setPendingTicks((prev) => (JSON.stringify(prev) === JSON.stringify(pending) ? prev : pending))
          setOnline(true)
        } catch (e) {
          if (e instanceof TypeError) setOnline(false)
        } finally {
          setLoaded(true)
        }
      }),
    [],
  )

  useEffect(() => {
    void poll()
    const id = setInterval(() => void poll(), 3000)
    return () => clearInterval(id)
  }, [poll])

  function toggle(groupId: string, presented: boolean) {
    const tick = { groupId, presented }
    ticks.enqueue(tick)
    // soma ao que já está na tela (não troca pela fila, que já perdeu o que foi enviado e ainda não voltou na lista)
    setPendingTicks((prev) => addTick(prev, tick))
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

  // Sem lista guardada, mostra um esqueleto até a primeira resposta (nada de "Nenhum evento" piscando antes da hora).
  if (!cache && !loaded)
    return (
      <>
        <OfflinePill online={online} />
        <Skeleton rows={3} />
      </>
    )
  if (data.event === null)
    return (
      <>
        <OfflinePill online={online} text="Sem conexão: última lista" />
        <p className="empty">Nenhum evento aberto.</p>
      </>
    )

  return (
    <>
      <OfflinePill online={online} text="Sem conexão: mostrando a última lista" />
      <h1>{data.event.name}</h1>
      <p className="sub" aria-live="polite">
        {formatDate(data.event.event_date)} · {done} de {total} grupo(s) apresentados
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
      {groups.length === 0 && <p className="empty">Nenhum visitante ainda.</p>}
      {blocks.map((b) => (
        <section className="card city-block" key={b.city} aria-label={`Cidade ${b.city}`}>
          <h2 className="city-title">De {b.city},</h2>
          {b.churches.map((ch) => (
            <div className="church-block" key={ch.church} role="group" aria-label={`Igreja ${ch.church}`}>
              <h3 className="church-title">da {ch.church}</h3>
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
