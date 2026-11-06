// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { keepAwake } from './wakeLock'

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  setVisibility('visible')
  delete (navigator as unknown as { wakeLock?: unknown }).wakeLock
})

describe('keepAwake', () => {
  it('pede o bloqueio de tela ao chamar', async () => {
    const release = vi.fn(async () => {})
    const request = vi.fn(async () => ({ release }))
    ;(navigator as unknown as { wakeLock: unknown }).wakeLock = { request }
    keepAwake()
    await Promise.resolve()
    expect(request).toHaveBeenCalledWith('screen')
  })
  it('pede de novo quando o app volta a ficar visível', async () => {
    const request = vi.fn(async () => ({ release: async () => {} }))
    ;(navigator as unknown as { wakeLock: unknown }).wakeLock = { request }
    keepAwake()
    await Promise.resolve()
    setVisibility('hidden')
    setVisibility('visible')
    await Promise.resolve()
    expect(request).toHaveBeenCalledTimes(2)
  })
  it('a função devolvida libera o bloqueio e para de pedir', async () => {
    const release = vi.fn(async () => {})
    const request = vi.fn(async () => ({ release }))
    ;(navigator as unknown as { wakeLock: unknown }).wakeLock = { request }
    const stop = keepAwake()
    await Promise.resolve()
    await Promise.resolve()
    stop()
    expect(release).toHaveBeenCalled()
    setVisibility('hidden')
    setVisibility('visible')
    await Promise.resolve()
    expect(request).toHaveBeenCalledTimes(1)
  })
  it('sem suporte não lança erro', () => {
    expect(() => keepAwake()()).not.toThrow()
  })
  it('se o pedido for recusado não lança erro', async () => {
    const request = vi.fn(async () => {
      throw new Error('negado')
    })
    ;(navigator as unknown as { wakeLock: unknown }).wakeLock = { request }
    expect(() => keepAwake()).not.toThrow()
    await Promise.resolve()
  })
})
