import { describe, it, expect } from 'vitest'
import { createSerialRunner } from './serialRunner'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('createSerialRunner', () => {
  it('sem execução em andamento roda na hora', async () => {
    let n = 0
    const run = createSerialRunner(async () => {
      n++
    })
    await run()
    expect(n).toBe(1)
  })
  it('nunca roda duas ao mesmo tempo', async () => {
    let active = 0
    let max = 0
    const run = createSerialRunner(async () => {
      active++
      max = Math.max(max, active)
      await wait(10)
      active--
    })
    await Promise.all([run(), run(), run()])
    expect(max).toBe(1)
  })
  it('pedidos durante a execução viram uma única execução extra depois', async () => {
    let n = 0
    const run = createSerialRunner(async () => {
      n++
      await wait(10)
    })
    await Promise.all([run(), run(), run(), run()])
    expect(n).toBe(2)
  })
  it('a promessa só resolve depois da execução extra', async () => {
    const log: string[] = []
    const run = createSerialRunner(async () => {
      log.push('inicio')
      await wait(5)
      log.push('fim')
    })
    const first = run()
    await run()
    expect(log).toEqual(['inicio', 'fim', 'inicio', 'fim'])
    await first
  })
  it('erro numa execução não trava as próximas', async () => {
    let n = 0
    const run = createSerialRunner(async () => {
      n++
      if (n === 1) throw new Error('falhou')
    })
    await run().catch(() => {})
    await run()
    expect(n).toBe(2)
  })
})
