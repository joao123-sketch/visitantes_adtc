import {
  OpenEventExists,
  UniqueViolation,
  type EventRow,
  type GroupRow,
  type NewPerson,
  type PersonRow,
  type ReceptionistRow,
  type Store,
} from './store'

/** Store em memória, usado nos testes. Imita as restrições únicas do banco. */
export function memoryStore(): Store {
  const pins = new Map<string, { pin_hash: string; salt: string }>()
  const receptionists: ReceptionistRow[] = []
  const events: EventRow[] = []
  const groups: GroupRow[] = []
  const people: PersonRow[] = []
  let n = 0
  const id = () => `id-${++n}`
  const now = () => new Date(Date.now() + n).toISOString()
  const keyOf = (p: { event_id: string; name_key: string; city_key: string; church_key: string }) =>
    `${p.event_id}|${p.name_key}|${p.city_key}|${p.church_key}`

  // Cada operação roda inteira, sem pausas no meio, como uma instrução atômica do banco.
  const insertOne = (p: NewPerson): PersonRow | null => {
    if (people.some((x) => keyOf(x) === keyOf(p))) return null
    const row: PersonRow = { ...p, id: id(), presented: false, created_at: now() }
    people.push(row)
    return row
  }

  return {
    async getPin(role) {
      return pins.get(role) ?? null
    },
    async setPin(role, pin_hash, salt) {
      pins.set(role, { pin_hash, salt })
    },
    async listReceptionists() {
      return [...receptionists].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    },
    async addReceptionist(name, name_key) {
      if (receptionists.some((r) => r.name_key === name_key)) return null
      const row: ReceptionistRow = { id: id(), name, name_key }
      receptionists.push(row)
      return row
    },
    async deleteReceptionist(rid) {
      const i = receptionists.findIndex((r) => r.id === rid)
      if (i >= 0) receptionists.splice(i, 1)
    },
    async getOpenEvent() {
      return events.find((e) => e.status === 'open') ?? null
    },
    async getEvent(eid) {
      return events.find((e) => e.id === eid) ?? null
    },
    async listEvents() {
      return [...events].reverse().slice(0, 20)
    },
    async deleteEvent(eid) {
      const i = events.findIndex((e) => e.id === eid)
      if (i >= 0) events.splice(i, 1)
      for (let j = groups.length - 1; j >= 0; j--) if (groups[j].event_id === eid) groups.splice(j, 1)
      for (let j = people.length - 1; j >= 0; j--) if (people[j].event_id === eid) people.splice(j, 1)
    },
    async createEvent(name, event_date) {
      if (events.some((e) => e.status === 'open')) throw new OpenEventExists()
      const e: EventRow = { id: id(), name, event_date, status: 'open' }
      events.push(e)
      return e
    },
    async setEventStatus(eid, status) {
      if (status === 'open' && events.some((e) => e.status === 'open' && e.id !== eid)) throw new OpenEventExists()
      const e = events.find((x) => x.id === eid)
      if (e) e.status = status
    },
    async findGroupByClient(eventId, clientId) {
      return groups.find((g) => g.event_id === eventId && g.client_id === clientId) ?? null
    },
    async insertGroup(g) {
      if (groups.some((x) => x.event_id === g.event_id && x.client_id === g.client_id)) throw new UniqueViolation()
      const row = { ...g, id: id(), created_at: now() }
      groups.push(row)
      return row
    },
    async getGroup(gid) {
      return groups.find((g) => g.id === gid) ?? null
    },
    async updateGroup(gid, f) {
      Object.assign(groups.find((g) => g.id === gid)!, f)
    },
    async deleteGroup(gid) {
      const i = groups.findIndex((g) => g.id === gid)
      if (i >= 0) groups.splice(i, 1)
      for (let j = people.length - 1; j >= 0; j--) if (people[j].group_id === gid) people.splice(j, 1)
    },
    async listGroups(eventId) {
      return groups.filter((g) => g.event_id === eventId)
    },
    async insertPerson(p: NewPerson) {
      return insertOne(p)
    },
    async insertPeople(list: NewPerson[]) {
      const inserted: PersonRow[] = []
      for (const p of list) {
        const row = insertOne(p)
        if (row) inserted.push(row)
      }
      return inserted
    },
    async findPersonByKey(eventId, name_key, city_key, church_key) {
      return people.find((x) => keyOf(x) === keyOf({ event_id: eventId, name_key, city_key, church_key })) ?? null
    },
    async listPeople(eventId) {
      return people.filter((x) => x.event_id === eventId)
    },
    async listPeopleByGroup(gid) {
      return people.filter((x) => x.group_id === gid)
    },
    async deletePerson(pid) {
      const i = people.findIndex((x) => x.id === pid)
      if (i >= 0) people.splice(i, 1)
    },
    async setGroupPresented(gid, presented) {
      for (const p of people) if (p.group_id === gid) p.presented = presented
    },
    async updatePerson(pid, f) {
      const p = people.find((x) => x.id === pid)
      if (!p) return false
      if (people.some((x) => x.id !== pid && keyOf(x) === keyOf({ event_id: p.event_id, ...f }))) return false
      Object.assign(p, f)
      return true
    },
  }
}
