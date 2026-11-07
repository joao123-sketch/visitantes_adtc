import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  OpenEventExists,
  UniqueViolation,
  type EventRow,
  type GroupRow,
  type NewPerson,
  type PersonRow,
  type Store,
} from './store'

const UNIQUE_VIOLATION = '23505'
const PAGE_SIZE = 1000 // o PostgREST devolve no máximo 1000 linhas por pedido

type Res<T> = { data: T; error: { code?: string; message: string } | null }

function must<T>(res: Res<T>): T {
  if (res.error) throw new Error(res.error.message)
  return res.data
}

/** Lê todas as páginas de uma consulta, para listas com mais de 1000 linhas não virem cortadas. */
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<Res<T[] | null>>): Promise<T[]> {
  const all: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const rows = must(await page(from, from + PAGE_SIZE - 1)) ?? []
    all.push(...rows)
    if (rows.length < PAGE_SIZE) return all
  }
}

const PEOPLE_CONFLICT = 'event_id,name_key,city_key,church_key'

/** `client` existe só para os testes poderem trocar o cliente do Supabase por um falso. */
export function supabaseStore(url: string, serviceKey: string, client?: SupabaseClient): Store {
  const db = client ?? createClient(url, serviceKey, { auth: { persistSession: false } })

  return {
    async getPin(role) {
      return must(await db.from('access_pins').select('pin_hash, salt').eq('role', role).maybeSingle())
    },
    async setPin(role, pin_hash, salt) {
      must(await db.from('access_pins').upsert({ role, pin_hash, salt }))
    },
    async getOpenEvent() {
      return must(await db.from('events').select('*').eq('status', 'open').maybeSingle()) as EventRow | null
    },
    async getEvent(id) {
      return must(await db.from('events').select('*').eq('id', id).maybeSingle()) as EventRow | null
    },
    async listEvents() {
      return must(await db.from('events').select('*').order('created_at', { ascending: false }).limit(20)) as EventRow[]
    },
    async deleteEvent(id) {
      must(await db.from('events').delete().eq('id', id)) // grupos e pessoas saem junto (on delete cascade)
    },
    async createEvent(name, eventDate) {
      const res = await db.from('events').insert({ name, event_date: eventDate }).select('*').single()
      if (res.error?.code === UNIQUE_VIOLATION) throw new OpenEventExists()
      return must(res) as EventRow
    },
    async setEventStatus(id, status) {
      const res = await db.from('events').update({ status }).eq('id', id)
      if (res.error?.code === UNIQUE_VIOLATION) throw new OpenEventExists()
      must(res)
    },
    async findGroupByClient(eventId, clientId) {
      return must(
        await db.from('groups').select('*').eq('event_id', eventId).eq('client_id', clientId).maybeSingle(),
      ) as GroupRow | null
    },
    async insertGroup(g) {
      const res = await db.from('groups').insert(g).select('*').single()
      if (res.error?.code === UNIQUE_VIOLATION) throw new UniqueViolation()
      return must(res) as GroupRow
    },
    async getGroup(id) {
      return must(await db.from('groups').select('*').eq('id', id).maybeSingle()) as GroupRow | null
    },
    async updateGroup(id, fields) {
      must(await db.from('groups').update(fields).eq('id', id))
    },
    async deleteGroup(id) {
      must(await db.from('groups').delete().eq('id', id))
    },
    async listGroups(eventId) {
      return fetchAll<GroupRow>((from, to) =>
        db.from('groups').select('*').eq('event_id', eventId).order('created_at').order('id').range(from, to),
      )
    },
    async insertPerson(p: NewPerson) {
      const res = await db.from('people').insert(p).select('*').single()
      if (res.error?.code === UNIQUE_VIOLATION) return null
      return must(res) as PersonRow
    },
    async insertPeople(list: NewPerson[]) {
      if (list.length === 0) return []
      // uma única ida ao banco; quem já existe é ignorado e não volta no resultado
      return must(
        await db.from('people').upsert(list, { onConflict: PEOPLE_CONFLICT, ignoreDuplicates: true }).select('*'),
      ) as PersonRow[]
    },
    async findPersonByKey(eventId, nameKey, cityKey, churchKey) {
      return must(
        await db
          .from('people')
          .select('*')
          .eq('event_id', eventId)
          .eq('name_key', nameKey)
          .eq('city_key', cityKey)
          .eq('church_key', churchKey)
          .maybeSingle(),
      ) as PersonRow | null
    },
    async listPeople(eventId) {
      return fetchAll<PersonRow>((from, to) =>
        db.from('people').select('*').eq('event_id', eventId).order('created_at').order('id').range(from, to),
      )
    },
    async listPeopleByGroup(groupId) {
      return must(await db.from('people').select('*').eq('group_id', groupId).order('created_at').order('id')) as PersonRow[]
    },
    async deletePerson(id) {
      must(await db.from('people').delete().eq('id', id))
    },
    async setGroupPresented(groupId, presented) {
      must(await db.from('people').update({ presented }).eq('group_id', groupId))
    },
    async updatePerson(id, fields) {
      const res = await db.from('people').update(fields).eq('id', id)
      if (res.error?.code === UNIQUE_VIOLATION) return false
      must(res)
      return true
    },
  }
}
