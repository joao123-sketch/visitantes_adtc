import { describe, it, expect } from 'vitest'
import { normalizeKey } from './normalize'

describe('normalizeKey', () => {
  it('remove acentos e espaços nas pontas', () => {
    expect(normalizeKey('  João  ')).toBe('joao')
  })
  it('ignora maiúsculas', () => {
    expect(normalizeKey('IPUEIRAS')).toBe('ipueiras')
  })
  it('colapsa espaços internos', () => {
    expect(normalizeKey('Maria   da  Silva')).toBe('maria da silva')
  })
  it('só espaços vira vazio', () => {
    expect(normalizeKey('   ')).toBe('')
  })
})
