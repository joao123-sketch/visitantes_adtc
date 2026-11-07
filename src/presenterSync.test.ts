// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { createQueue } from './queue'
import { syncPresenter, type Tick, type Cached } from './presenterSync'

const empty: Cached = { event: null, groups: [] }
let ticks: ReturnType<typeof createQueue<Tick>>

beforeEach(() => {
  localStorage.clear()
  ticks = createQueue<Tick>('t', (t) => t.groupId)
})

describe('syncPresenter', () => {
  it('envia os toques pendentes antes de buscar a lista', async () => {
    ticks.enqueue({ groupId: 'g1', presented: true })
    const log: string[] = []
    const r = await syncPresenter({
      ticks,
      sendTick: async () => {
        log.push('envia')
      },
      fetchList: async () => {
        log.push('busca')
        return empty
      },
    })
    expect(log).toEqual(['envia', 'busca'])
    expect(r.pending).toEqual([])
  })
  it('toque feito durante a busca continua pendente no resultado', async () => {
    const r = await syncPresenter({
      ticks,
      sendTick: async () => {},
      fetchList: async () => {
        ticks.enqueue({ groupId: 'g1', presented: false })
        return empty
      },
    })
    expect(r.pending).toEqual([{ groupId: 'g1', presented: false }])
  })
  it('sem conexão para enviar mantém o toque pendente', async () => {
    ticks.enqueue({ groupId: 'g1', presented: true })
    const r = await syncPresenter({
      ticks,
      sendTick: async () => {
        throw new TypeError('Failed to fetch')
      },
      fetchList: async () => empty,
    })
    expect(r.pending).toEqual([{ groupId: 'g1', presented: true }])
  })
})
