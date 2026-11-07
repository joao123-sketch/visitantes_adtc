// @vitest-environment jsdom
// Simulação aleatória do apresentador: toques rápidos em vários grupos com rede lenta e variável.
// Usa o código real (fila, execução serial e ciclo de sincronização) com um servidor falso.
import { describe, it, expect, beforeEach } from 'vitest'
import { createQueue } from './queue'
import { createSerialRunner } from './serialRunner'
import { addTick, syncPresenter, type Tick, type Cached } from './presenterSync'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function makeWorld(n: number, rnd: () => number, maxLatency: number, key: string) {
  const server: boolean[] = Array(n).fill(false)
  const ticks = createQueue<Tick>(key, (t) => t.groupId)
  const delay = () => sleep(rnd() * maxLatency)
  const snapshot = (): Cached => ({
    event: null,
    groups: server.map((v, i) => ({
      id: String(i),
      city: 'c',
      church: 'i',
      observation: null,
      people: [{ id: `p${i}`, name: 'x', presented: v }],
    })),
  })
  let data: Cached = snapshot()
  let pending: Tick[] = []

  const poll = createSerialRunner(async () => {
    const r = await syncPresenter({
      ticks,
      sendTick: async (t) => {
        await delay()
        server[Number(t.groupId)] = t.presented
        await delay()
      },
      fetchList: async () => {
        await delay()
        const snap = snapshot()
        await delay()
        return snap
      },
    })
    data = r.data
    pending = r.pending
  })

  const displayed = (i: number) => {
    const o = pending.find((t) => t.groupId === String(i))
    return o ? o.presented : data.groups[i].people.every((p) => p.presented)
  }
  const tap = (i: number) => {
    const tick = { groupId: String(i), presented: !displayed(i) }
    ticks.enqueue(tick)
    pending = addTick(pending, tick)
    void poll()
  }
  return { server, displayed, tap, poll }
}

describe('apresentador: toques aleatórios com rede lenta', () => {
  beforeEach(() => localStorage.clear())

  for (let seed = 1; seed <= 12; seed++) {
    it(`sequência ${seed}: sem piscar, sem perder toque, servidor igual à tela`, async () => {
      const rnd = mulberry32(seed)
      const n = 4
      const w = makeWorld(n, rnd, 12, `sim-${seed}`)
      const intended: (boolean | undefined)[] = Array(n).fill(undefined)
      const violations: string[] = []
      let sampling = true
      const t0 = Date.now()
      const sampler = (async () => {
        while (sampling) {
          for (let i = 0; i < n; i++) {
            const want = intended[i]
            if (want !== undefined && w.displayed(i) !== want) violations.push(`g${i} mostrou ${w.displayed(i)} em vez de ${want} aos ${Date.now() - t0}ms`)
          }
          await sleep(1)
        }
      })()
      const interval = setInterval(() => void w.poll(), 30)

      for (let k = 0; k < 14; k++) {
        const i = Math.floor(rnd() * n)
        const next = !w.displayed(i)
        w.tap(i)
        intended[i] = next
        await sleep(rnd() < 0.4 ? 0 : rnd() * 25) // toques quase simultâneos e espaçados
      }
      await sleep(600) // deixa tudo sincronizar
      clearInterval(interval)
      sampling = false
      await sampler

      expect(violations).toEqual([])
      for (let i = 0; i < n; i++) if (intended[i] !== undefined) expect(w.server[i]).toBe(intended[i])
    }, 30000)
  }
})
