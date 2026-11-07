// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createQueue, PermanentError } from './queue'

type Item = { id: string; v: number }
let q: ReturnType<typeof createQueue<Item>>

beforeEach(() => {
  localStorage.clear()
  q = createQueue<Item>('teste', (i) => i.id)
})

describe('fila offline', () => {
  it('flush envia cada item uma vez, em ordem, e esvazia', async () => {
    q.enqueue({ id: 'a', v: 1 })
    q.enqueue({ id: 'b', v: 2 })
    const send = vi.fn(async () => {})
    await q.flush(send)
    expect(send.mock.calls.map((c) => (c as unknown as [Item])[0].id)).toEqual(['a', 'b'])
    expect(q.count()).toBe(0)
  })
  it('erro de rede mantém o item e interrompe', async () => {
    q.enqueue({ id: 'a', v: 1 })
    q.enqueue({ id: 'b', v: 2 })
    const send = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    await q.flush(send)
    expect(send).toHaveBeenCalledTimes(1)
    expect(q.count()).toBe(2)
  })
  it('flush em paralelo não reenvia o mesmo item', async () => {
    q.enqueue({ id: 'a', v: 1 })
    const send = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })
    await Promise.all([q.flush(send), q.flush(send)])
    expect(send).toHaveBeenCalledTimes(1)
  })
  it('sessão expirada (401) mantém a fila', async () => {
    q.enqueue({ id: 'a', v: 1 })
    const send = vi.fn(async () => {
      throw Object.assign(new Error('Sessão inválida'), { status: 401 })
    })
    await q.flush(send)
    expect(q.count()).toBe(1)
  })
  it('item recusado vai para a lista de recusados, com o motivo, e não trava os outros', async () => {
    q.enqueue({ id: 'a', v: 1 })
    q.enqueue({ id: 'b', v: 2 })
    const sent: string[] = []
    await q.flush(async (i) => {
      if (i.id === 'a') throw new PermanentError('Evento não encontrado')
      sent.push(i.id)
    })
    expect(sent).toEqual(['b'])
    expect(q.count()).toBe(0)
    expect(q.failed()).toEqual([{ item: { id: 'a', v: 1 }, error: 'Evento não encontrado' }])
  })
  it('um item recusado nunca é reenviado sozinho', async () => {
    q.enqueue({ id: 'a', v: 1 })
    const send = vi.fn(async () => {
      throw new PermanentError('recusado')
    })
    await q.flush(send)
    await q.flush(send)
    expect(send).toHaveBeenCalledTimes(1)
  })
  it('retry devolve o recusado à fila (podendo corrigir o item) e discard remove de vez', async () => {
    q.enqueue({ id: 'a', v: 1 })
    q.enqueue({ id: 'b', v: 2 })
    await q.flush(async () => {
      throw new PermanentError('recusado')
    })
    expect(q.failed().map((f) => f.item.id)).toEqual(['a', 'b'])
    q.retry('a', (i) => ({ ...i, v: 99 }))
    expect(q.items()).toEqual([{ id: 'a', v: 99 }])
    expect(q.failed().map((f) => f.item.id)).toEqual(['b'])
    q.discard('b')
    expect(q.failed()).toEqual([])
  })
  it('os recusados sobrevivem a recarregar a página', async () => {
    q.enqueue({ id: 'a', v: 1 })
    await q.flush(async () => {
      throw new PermanentError('recusado')
    })
    const again = createQueue<Item>('teste', (i) => i.id)
    expect(again.failed()).toHaveLength(1)
  })
  it('enqueue do mesmo id substitui o anterior (última escrita vale)', async () => {
    q.enqueue({ id: 'a', v: 1 })
    q.enqueue({ id: 'a', v: 2 })
    expect(q.count()).toBe(1)
    expect(q.items()[0].v).toBe(2)
  })
  it('toque novo durante o envio não é perdido e é enviado logo depois', async () => {
    q.enqueue({ id: 'a', v: 1 })
    const sent: number[] = []
    let first = true
    await q.flush(async (i) => {
      sent.push(i.v)
      if (first) {
        first = false
        q.enqueue({ id: 'a', v: 2 })
      }
    })
    expect(sent).toEqual([1, 2])
    expect(q.count()).toBe(0)
  })
  it('flush chamado durante outro flush também envia o item novo', async () => {
    q.enqueue({ id: 'a', v: 1 })
    const sent: number[] = []
    const slow = async (i: Item) => {
      sent.push(i.v)
      await new Promise((r) => setTimeout(r, 10))
    }
    const first = q.flush(slow)
    q.enqueue({ id: 'b', v: 2 })
    await q.flush(slow)
    await first
    expect(sent).toEqual([1, 2])
    expect(q.count()).toBe(0)
  })
  it('a fila sobrevive a recarregar a página', () => {
    q.enqueue({ id: 'a', v: 1 })
    const again = createQueue<Item>('teste', (i) => i.id)
    expect(again.count()).toBe(1)
  })
})
