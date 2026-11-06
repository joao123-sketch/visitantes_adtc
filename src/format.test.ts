import { describe, it, expect } from 'vitest'
import { formatDate } from './format'

describe('formatDate', () => {
  it('escreve a data por extenso em português', () => {
    expect(formatDate('2026-11-08')).toBe('domingo, 8 de novembro de 2026')
  })
  it('não muda o dia por causa do fuso horário', () => {
    expect(formatDate('2026-01-01')).toBe('quinta-feira, 1 de janeiro de 2026')
  })
  it('data inválida devolve o texto original', () => {
    expect(formatDate('lixo')).toBe('lixo')
  })
})
