// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { getTheme, setTheme } from './theme'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

describe('tema', () => {
  it('setTheme grava e getTheme devolve a escolha', () => {
    setTheme('dark')
    expect(localStorage.getItem('theme')).toBe('dark')
    expect(getTheme()).toBe('dark')
  })
  it('valor inválido no armazenamento vira auto', () => {
    localStorage.setItem('theme', 'roxo')
    expect(getTheme()).toBe('auto')
  })
  it('sem escolha o padrão é auto', () => {
    expect(getTheme()).toBe('auto')
  })
  it('claro e escuro definem data-theme no html; auto remove', () => {
    setTheme('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    setTheme('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    setTheme('auto')
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })
})
