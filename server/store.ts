export type EventRow = { id: string; name: string; event_date: string; status: 'open' | 'closed' }
export type GroupRow = {
  id: string
  event_id: string
  client_id: string
  city: string
  church: string
  observation: string | null
  device_id: string
  receptionist: string | null
  created_at: string
}
export type PersonRow = {
  id: string
  group_id: string
  event_id: string
  name: string
  name_key: string
  city_key: string
  church_key: string
  presented: boolean
  created_at: string
}
export type NewPerson = Omit<PersonRow, 'id' | 'created_at' | 'presented'>

export class OpenEventExists extends Error {}

/** Já existe um grupo com o mesmo (evento, clientId): outro envio igual chegou antes. */
export class UniqueViolation extends Error {}

export interface Store {
  getPin(role: string): Promise<{ pin_hash: string; salt: string } | null>
  setPin(role: string, pin_hash: string, salt: string): Promise<void>
  getOpenEvent(): Promise<EventRow | null>
  getEvent(id: string): Promise<EventRow | null>
  /** Eventos mais recentes primeiro (até 20). */
  listEvents(): Promise<EventRow[]>
  /** Apaga o evento e, junto, todos os grupos e pessoas dele. */
  deleteEvent(id: string): Promise<void>
  /** Lança OpenEventExists se já houver evento aberto. */
  createEvent(name: string, eventDate: string): Promise<EventRow>
  /** Lança OpenEventExists ao reabrir com outro evento aberto. */
  setEventStatus(id: string, status: 'open' | 'closed'): Promise<void>
  findGroupByClient(eventId: string, clientId: string): Promise<GroupRow | null>
  /** Lança UniqueViolation se o par (evento, clientId) já existir. */
  insertGroup(g: Omit<GroupRow, 'id' | 'created_at'>): Promise<GroupRow>
  getGroup(id: string): Promise<GroupRow | null>
  updateGroup(id: string, fields: { city: string; church: string; observation: string | null }): Promise<void>
  deleteGroup(id: string): Promise<void>
  listGroups(eventId: string): Promise<GroupRow[]>
  /** Insere várias pessoas de uma vez, ignorando as que já existem; devolve só as realmente inseridas. */
  insertPeople(people: NewPerson[]): Promise<PersonRow[]>
  /** Insere a pessoa; devolve null se já existir (mesmo evento, nome, cidade e igreja). */
  insertPerson(p: NewPerson): Promise<PersonRow | null>
  findPersonByKey(eventId: string, nameKey: string, cityKey: string, churchKey: string): Promise<PersonRow | null>
  listPeople(eventId: string): Promise<PersonRow[]>
  listPeopleByGroup(groupId: string): Promise<PersonRow[]>
  deletePerson(id: string): Promise<void>
  /** Atualiza nome e chaves mantendo a marcação de apresentado. Devolve false se a nova chave já existir no evento. */
  updatePerson(id: string, fields: { name: string; name_key: string; city_key: string; church_key: string }): Promise<boolean>
  /** Marca ou desmarca todas as pessoas do grupo de uma vez só (uma única atualização). */
  setGroupPresented(groupId: string, presented: boolean): Promise<void>
}
