import { describe, it, expect } from 'vitest'
import { isoDate, nextOccurrence, WEEKLY_SERVICES } from './schedule'

describe('nextOccurrence', () => {
  it('hoje conta quando é o dia do culto', () => {
    // 2026-11-06 é sexta
    expect(nextOccurrence(5, new Date(2026, 10, 6, 23, 50))).toBe('2026-11-06')
  })
  it('depois da sexta, a próxima sexta é na semana seguinte', () => {
    expect(nextOccurrence(5, new Date(2026, 10, 7))).toBe('2026-11-13')
  })
  it('domingo seguinte, virando o mês', () => {
    expect(nextOccurrence(0, new Date(2026, 11, 30))).toBe('2027-01-03')
  })
  it('tem cultos de sexta e de domingo', () => {
    expect(WEEKLY_SERVICES.map((s) => s.weekday).sort()).toEqual([0, 5])
  })
  it('isoDate usa o dia local', () => {
    expect(isoDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
})

import { eventName } from './presets'
describe('eventName', () => {
  it('acrescenta o departamento, menos Geral', () => {
    expect(eventName('Culto de Doutrina', 'Umadeg')).toBe('Culto de Doutrina · Umadeg')
    expect(eventName(' Culto ', 'Geral')).toBe('Culto')
    expect(eventName('Culto', '')).toBe('Culto')
  })
})

import { deptKey } from './presets'
describe('deptKey', () => {
  it('acha o estilo pelo fim do nome do evento', () => {
    expect(deptKey('Culto de Doutrina · Umadeg')).toBe('umadeg')
    expect(deptKey('Culto · Varões')).toBe('varoes')
    expect(deptKey('Culto · Depin')).toBe('depin')
    expect(deptKey('Culto · Usadeg')).toBe('usadeg')
  })
  it('Geral, Missões, Defam e nomes sem departamento ficam no estilo padrão', () => {
    expect(deptKey('Culto · Missões')).toBe('')
    expect(deptKey('Culto · Defam')).toBe('')
    expect(deptKey('Umadeg')).toBe('')
    expect(deptKey(undefined)).toBe('')
  })
})
