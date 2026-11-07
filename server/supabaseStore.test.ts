import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabaseStore } from './supabaseStore'
import { OpenEventExists, UniqueViolation, type NewPerson } from './store'

type Call = [string, unknown[]]
type Reply = { data: unknown; error: { code?: string; message: string } | null }

/** Cliente falso do Supabase: guarda a cadeia de chamadas de cada consulta e responde com `reply(cadeia)`. */
function fakeDb(reply: (calls: Call[]) => Reply) {
  const queries: Call[][] = []
  const db = {
    from(table: string) {
      const calls: Call[] = [['from', [table]]]
      queries.push(calls)
      const chain: unknown = new Proxy(
        {},
        {
          get: (_t, prop: string) =>
            prop === 'then'
              ? (resolve: (r: Reply) => void) => resolve(reply(calls))
              : (...args: unknown[]) => {
                  calls.push([prop, args])
                  return chain
                },
        },
      )
      return chain
    },
  }
  return { db: db as unknown as SupabaseClient, queries }
}

const ok = (data: unknown): Reply => ({ data, error: null })
const fail = (code: string): Reply => ({ data: null, error: { code, message: `erro ${code}` } })
const store = (db: SupabaseClient) => supabaseStore('https://x.supabase.co', 'chave', db)
const person: NewPerson = { group_id: 'g', event_id: 'e', name: 'Ana', name_key: 'ana', city_key: 'c', church_key: 'i' }
const group = { event_id: 'e', client_id: 'c', city: 'C', church: 'I', observation: null, device_id: 'd', receptionist: null }

describe('supabaseStore: erros do banco', () => {
  it('grupo repetido (23505) vira UniqueViolation', async () => {
    const { db } = fakeDb(() => fail('23505'))
    await expect(store(db).insertGroup(group)).rejects.toBeInstanceOf(UniqueViolation)
  })
  it('segundo evento aberto (23505) vira OpenEventExists, ao criar e ao reabrir', async () => {
    const { db } = fakeDb(() => fail('23505'))
    await expect(store(db).createEvent('Culto', '2026-11-08')).rejects.toBeInstanceOf(OpenEventExists)
    await expect(store(db).setEventStatus('e1', 'open')).rejects.toBeInstanceOf(OpenEventExists)
  })
  it('pessoa repetida (23505) devolve null ao inserir e false ao atualizar', async () => {
    const { db } = fakeDb(() => fail('23505'))
    expect(await store(db).insertPerson(person)).toBeNull()
    expect(await store(db).updatePerson('p1', { name: 'Ana', name_key: 'ana', city_key: 'c', church_key: 'i' })).toBe(false)
  })
  it('outro erro do banco lança com a mensagem original', async () => {
    const { db } = fakeDb(() => fail('42P01'))
    await expect(store(db).insertGroup(group)).rejects.toThrow('erro 42P01')
    await expect(store(db).insertPerson(person)).rejects.toThrow('erro 42P01')
  })
})

describe('supabaseStore: operações', () => {
  it('insertPeople faz um único upsert ignorando duplicados e devolve só as linhas inseridas', async () => {
    const inserted = [{ id: 'p1', ...person }]
    const { db, queries } = fakeDb(() => ok(inserted))
    const r = await store(db).insertPeople([person, { ...person, name: 'Bia', name_key: 'bia' }])
    expect(r).toEqual(inserted)
    expect(queries).toHaveLength(1)
    const upsert = queries[0].find((c) => c[0] === 'upsert')!
    expect((upsert[1][0] as NewPerson[]).length).toBe(2)
    expect(upsert[1][1]).toEqual({ onConflict: 'event_id,name_key,city_key,church_key', ignoreDuplicates: true })
  })
  it('insertPeople com lista vazia não chama o banco', async () => {
    const { db, queries } = fakeDb(() => ok([]))
    expect(await store(db).insertPeople([])).toEqual([])
    expect(queries).toHaveLength(0)
  })
  it('deleteEvent apaga só o evento pedido (o resto sai por cascata no banco)', async () => {
    const { db, queries } = fakeDb(() => ok(null))
    await store(db).deleteEvent('e1')
    expect(queries[0]).toEqual([['from', ['events']], ['delete', []], ['eq', ['id', 'e1']]])
  })
  it('setGroupPresented faz uma atualização só, filtrada pelo grupo', async () => {
    const { db, queries } = fakeDb(() => ok(null))
    await store(db).setGroupPresented('g1', true)
    expect(queries).toHaveLength(1)
    expect(queries[0]).toEqual([['from', ['people']], ['update', [{ presented: true }]], ['eq', ['group_id', 'g1']]])
  })
})

describe('supabaseStore: listas com mais de 1000 linhas', () => {
  const rows = Array.from({ length: 2500 }, (_, i) => ({ id: `p${i}`, group_id: 'g', event_id: 'e' }))
  const paged = (calls: Call[]) => {
    const [from, to] = calls.find((c) => c[0] === 'range')![1] as [number, number]
    return ok(rows.slice(from, to + 1))
  }

  it('listPeople lê todas as páginas e não corta em 1000', async () => {
    const { db, queries } = fakeDb(paged)
    const r = await store(db).listPeople('e')
    expect(r).toHaveLength(2500)
    expect(queries.map((q) => q.find((c) => c[0] === 'range')![1])).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ])
  })
  it('listGroups também pagina', async () => {
    const { db } = fakeDb(paged)
    expect(await store(db).listGroups('e')).toHaveLength(2500)
  })
  it('lista com exatamente 1000 linhas faz uma página a mais para confirmar o fim', async () => {
    const exact = rows.slice(0, 1000)
    const { db, queries } = fakeDb((calls) => {
      const [from, to] = calls.find((c) => c[0] === 'range')![1] as [number, number]
      return ok(exact.slice(from, to + 1))
    })
    expect(await store(db).listPeople('e')).toHaveLength(1000)
    expect(queries).toHaveLength(2)
  })
})
