import { createClient } from '@supabase/supabase-js'
import { OpenEventExists, type EventRow, type GroupRow, type NewPerson, type PersonRow, type Store } from './store'

const UNIQUE_VIOLATION = '23505'

function must<T>(res: { data: T; error: { code?: string; message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data
}

export function supabaseStore(url: string, serviceKey: string): Store {
  const db = createClient(url, serviceKey, { auth: { persistSession: false } })

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
      return must(await db.from('groups').insert(g).select('*').single()) as GroupRow
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
      return must(await db.from('groups').select('*').eq('event_id', eventId).order('created_at')) as GroupRow[]
    },
    async insertPerson(p: NewPerson) {
      const res = await db.from('people').insert(p).select('*').single()
      if (res.error?.code === UNIQUE_VIOLATION) return null
      return must(res) as PersonRow
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
      return must(await db.from('people').select('*').eq('event_id', eventId).order('created_at')) as PersonRow[]
    },
    async listPeopleByGroup(groupId) {
      return must(await db.from('people').select('*').eq('group_id', groupId).order('created_at')) as PersonRow[]
    },
    async deletePerson(id) {
      must(await db.from('people').delete().eq('id', id))
    },
    async setPresented(personId, presented) {
      must(await db.from('people').update({ presented }).eq('id', personId))
    },
  }
}
