// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { createQueue } from './queue'
import { syncPresenter, addTick, type Tick, type Cached } from './presenterSync'

const empty: Cached = { event: null, groups: [] }
let ticks: ReturnType<typeof createQueue<Tick>>

beforeEach(() => {
  localStorage.clear()
  ticks = createQueue<Tick>('t', (t) => t.groupId)
})

describe('addTick', () => {
  it('guarda os toques anteriores, mesmo os já enviados, até a próxima lista chegar', () => {
    const antes: Tick[] = [{ groupId: 'A', presented: true }]
    expect(addTick(antes, { groupId: 'B', presented: true })).toEqual([
      { groupId: 'A', presented: true },
      { groupId: 'B', presented: true },
    ])
  })
  it('novo toque no mesmo grupo substitui o anterior', () => {
    const antes: Tick[] = [
      { groupId: 'A', presented: true },
      { groupId: 'B', presented: true },
    ]
    expect(addTick(antes, { groupId: 'A', presented: false })).toEqual([
      { groupId: 'B', presented: true },
      { groupId: 'A', presented: false },
    ])
  })
  it('não altera a lista original', () => {
    const antes: Tick[] = [{ groupId: 'A', presented: true }]
    addTick(antes, { groupId: 'B', presented: false })
    expect(antes).toEqual([{ groupId: 'A', presented: true }])
  })
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
