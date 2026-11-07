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
  it('erro permanente descarta o item e segue para o próximo', async () => {
    q.enqueue({ id: 'a', v: 1 })
    q.enqueue({ id: 'b', v: 2 })
    const sent: string[] = []
    await q.flush(async (i) => {
      if (i.id === 'a') throw new PermanentError('inválido')
      sent.push(i.id)
    })
    expect(sent).toEqual(['b'])
    expect(q.count()).toBe(0)
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
