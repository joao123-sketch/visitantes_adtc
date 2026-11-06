import { Hono } from 'hono'
import type { Context, Next } from 'hono'
import { hashPin, signToken, verifyToken, type Role, type TokenPayload } from './auth'
import { normalizeKey } from './normalize'
import { OpenEventExists, type PersonRow, type Store } from './store'

type Env = { Variables: { user: TokenPayload } }

const ROLES: Role[] = ['admin', 'reception', 'presenter']

const cleanNames = (names: unknown): string[] =>
  Array.isArray(names)
    ? names.map((n) => String(n ?? '').trim().replace(/\s+/g, ' ')).filter((n) => n.length > 0)
    : []

const text = (v: unknown) => String(v ?? '').trim().replace(/\s+/g, ' ')

function mergeObservation(current: string | null, extra: string | null | undefined): string | null {
  const add = text(extra)
  if (!add) return current
  if (!current) return add
  return current.toLowerCase().includes(add.toLowerCase()) ? current : `${current} · ${add}`
}

export function createApp(store: Store, secret: string) {
  const app = new Hono<Env>()

  const auth = async (c: Context<Env>, next: Next) => {
    const header = c.req.header('authorization') ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''
    const user = token ? await verifyToken(token, secret) : null
    if (!user) return c.json({ error: 'Sessão inválida' }, 401)
    c.set('user', user)
    await next()
  }
  const only =
    (...roles: Role[]) =>
    async (c: Context<Env>, next: Next) => {
      if (!roles.includes(c.get('user').role)) return c.json({ error: 'Sem permissão' }, 403)
      await next()
    }

  app.post('/api/login', async (c) => {
    const body = await c.req.json().catch(() => ({}) as Record<string, unknown>)
    const pin = String(body.pin ?? '')
    const deviceId = String(body.deviceId ?? '')
    if (!deviceId) return c.json({ error: 'Aparelho não identificado' }, 400)
    for (const role of ROLES) {
      const row = await store.getPin(role)
      if (row && (await hashPin(pin, row.salt)) === row.pin_hash) {
        const name = body.name ? text(body.name) : undefined
        const token = await signToken({ role, deviceId, name }, secret)
        return c.json({ token, role })
      }
    }
    return c.json({ error: 'PIN incorreto' }, 401)
  })

  app.use('/api/*', async (c, next) => (c.req.path === '/api/login' ? next() : auth(c, next)))

  // ---------- eventos ----------
  app.get('/api/events/current', async (c) => c.json({ event: await store.getOpenEvent() }))

  app.get('/api/events', only('admin'), async (c) => c.json({ events: await store.listEvents() }))

  app.post('/api/events', only('admin'), async (c) => {
    const body = await c.req.json().catch(() => ({}) as Record<string, unknown>)
    const name = text(body.name)
    const eventDate = text(body.eventDate)
    if (!name || !eventDate) return c.json({ error: 'Informe nome e data' }, 400)
    try {
      return c.json(await store.createEvent(name, eventDate))
    } catch (e) {
      if (e instanceof OpenEventExists) return c.json({ error: 'Já existe um evento aberto' }, 409)
      throw e
    }
  })

  app.post('/api/events/:id/close', only('admin'), async (c) => {
    await store.setEventStatus(c.req.param('id') ?? '', 'closed')
    return c.json({ ok: true })
  })

  app.post('/api/events/:id/reopen', only('admin'), async (c) => {
    try {
      await store.setEventStatus(c.req.param('id') ?? '', 'open')
      return c.json({ ok: true })
    } catch (e) {
      if (e instanceof OpenEventExists) return c.json({ error: 'Já existe um evento aberto' }, 409)
      throw e
    }
  })

  app.put('/api/pins/:role', only('admin'), async (c) => {
    const role = c.req.param('role') as Role
    const body = await c.req.json().catch(() => ({}) as Record<string, unknown>)
    const pin = String(body.pin ?? '')
    if (!ROLES.includes(role)) return c.json({ error: 'Papel inválido' }, 400)
    if (!/^\d{6}$/.test(pin)) return c.json({ error: 'O PIN precisa ter 6 dígitos' }, 400)
    const salt = crypto.randomUUID()
    await store.setPin(role, await hashPin(pin, salt), salt)
    return c.json({ ok: true })
  })

  // ---------- visitantes (recepção) ----------
  const withPeople = async (groupIds: string[], eventId: string) => {
    const people = await store.listPeople(eventId)
    const byGroup = new Map<string, PersonRow[]>()
    for (const p of people) byGroup.set(p.group_id, [...(byGroup.get(p.group_id) ?? []), p])
    return (id: string) =>
      (byGroup.get(id) ?? [])
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((p) => ({ id: p.id, name: p.name, presented: p.presented }))
  }

  app.post('/api/groups', only('reception'), async (c) => {
    const user = c.get('user')
    const body = await c.req.json().catch(() => ({}) as Record<string, unknown>)
    const eventId = String(body.eventId ?? '')
    const clientId = String(body.clientId ?? '')
    const city = text(body.city)
    const church = text(body.church)
    const names = cleanNames(body.names)
    if (!eventId || !clientId || !city || !church) return c.json({ error: 'Preencha cidade e igreja' }, 400)
    if (names.length === 0) return c.json({ error: 'Informe pelo menos um nome' }, 400)
    if (!(await store.getEvent(eventId))) return c.json({ error: 'Evento não encontrado' }, 404)

    const existing = await store.findGroupByClient(eventId, clientId)
    if (existing) {
      const people = (await store.listPeopleByGroup(existing.id)).map((p) => p.name)
      return c.json({ added: people, duplicates: [] })
    }

    const group = await store.insertGroup({
      event_id: eventId,
      client_id: clientId,
      city,
      church,
      observation: text(body.observation) || null,
      device_id: user.deviceId,
      receptionist: user.name ?? null,
    })
    const added: string[] = []
    const duplicates: string[] = []
    const cityKey = normalizeKey(city)
    const churchKey = normalizeKey(church)
    for (const name of names) {
      const row = await store.insertPerson({
        group_id: group.id,
        event_id: eventId,
        name,
        name_key: normalizeKey(name),
        city_key: cityKey,
        church_key: churchKey,
      })
      if (row) {
        added.push(name)
        continue
      }
      duplicates.push(name)
      const other = await store.findPersonByKey(eventId, normalizeKey(name), cityKey, churchKey)
      if (other && other.group_id !== group.id && group.observation) {
        const og = await store.getGroup(other.group_id)
        if (og) {
          const merged = mergeObservation(og.observation, group.observation)
          if (merged !== og.observation) await store.updateGroup(og.id, { city: og.city, church: og.church, observation: merged })
        }
      }
    }
    if (added.length === 0) await store.deleteGroup(group.id)
    return c.json({ added, duplicates })
  })

  app.get('/api/groups/mine', only('reception'), async (c) => {
    const eventId = c.req.query('eventId') ?? ''
    const deviceId = c.get('user').deviceId
    const groups = (await store.listGroups(eventId))
      .filter((g) => g.device_id === deviceId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
    const peopleOf = await withPeople(groups.map((g) => g.id), eventId)
    return c.json({
      groups: groups.map((g) => ({ id: g.id, city: g.city, church: g.church, observation: g.observation, people: peopleOf(g.id) })),
    })
  })

  const ownedOpenGroup = async (c: Context<Env>) => {
    const group = await store.getGroup(c.req.param('id') ?? '')
    if (!group) return { error: c.json({ error: 'Registro não encontrado' }, 404) }
    if (group.device_id !== c.get('user').deviceId) return { error: c.json({ error: 'Só quem enviou pode alterar' }, 403) }
    const event = await store.getEvent(group.event_id)
    if (!event || event.status !== 'open') return { error: c.json({ error: 'O evento está encerrado' }, 403) }
    return { group }
  }

  app.put('/api/groups/:id', only('reception'), async (c) => {
    const owned = await ownedOpenGroup(c)
    if (owned.error) return owned.error
    const group = owned.group!
    const body = await c.req.json().catch(() => ({}) as Record<string, unknown>)
    const city = text(body.city)
    const church = text(body.church)
    const names = cleanNames(body.names)
    if (!city || !church) return c.json({ error: 'Preencha cidade e igreja' }, 400)
    if (names.length === 0) return c.json({ error: 'Informe pelo menos um nome' }, 400)

    const cityKey = normalizeKey(city)
    const churchKey = normalizeKey(church)
    const current = await store.listPeopleByGroup(group.id)
    const wanted = new Map<string, string>() // name_key -> nome
    for (const n of names) if (!wanted.has(normalizeKey(n))) wanted.set(normalizeKey(n), n)

    const keepsIdentity = (p: PersonRow, key: string) => p.name_key === key && p.city_key === cityKey && p.church_key === churchKey
    const toKeep = current.filter((p) => [...wanted.keys()].some((k) => keepsIdentity(p, k)))
    const toRemove = current.filter((p) => !toKeep.includes(p))
    const toAdd = [...wanted.entries()].filter(([k]) => !toKeep.some((p) => keepsIdentity(p, k)))

    for (const [key] of toAdd) {
      const clash = await store.findPersonByKey(group.event_id, key, cityKey, churchKey)
      if (clash && !toRemove.some((p) => p.id === clash.id)) return c.json({ error: 'Essa pessoa já está na lista' }, 409)
    }
    for (const p of toRemove) await store.deletePerson(p.id)
    for (const [key, name] of toAdd) {
      const row = await store.insertPerson({
        group_id: group.id,
        event_id: group.event_id,
        name,
        name_key: key,
        city_key: cityKey,
        church_key: churchKey,
      })
      if (!row) return c.json({ error: 'Essa pessoa já está na lista' }, 409)
    }
    await store.updateGroup(group.id, { city, church, observation: text(body.observation) || null })
    return c.json({ ok: true })
  })

  app.delete('/api/groups/:id', only('reception'), async (c) => {
    const owned = await ownedOpenGroup(c)
    if (owned.error) return owned.error
    await store.deleteGroup(owned.group!.id)
    return c.json({ ok: true })
  })

  // ---------- apresentador ----------
  app.get('/api/list', only('presenter', 'admin'), async (c) => {
    const eventId = c.req.query('eventId') ?? ''
    const groups = (await store.listGroups(eventId)).sort((a, b) => a.created_at.localeCompare(b.created_at))
    const peopleOf = await withPeople(groups.map((g) => g.id), eventId)
    return c.json({
      groups: groups.map((g) => ({ id: g.id, city: g.city, church: g.church, observation: g.observation, people: peopleOf(g.id) })),
    })
  })

  app.put('/api/people/:id/presented', only('presenter', 'admin'), async (c) => {
    const body = await c.req.json().catch(() => ({}) as Record<string, unknown>)
    await store.setPresented(c.req.param('id') ?? '', body.presented === true)
    return c.json({ ok: true })
  })

  return app
}
