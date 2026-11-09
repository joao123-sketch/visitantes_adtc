import { Hono } from 'hono'
import type { Context, Next } from 'hono'
import { signToken, verifyToken, type Role, type TokenPayload } from './auth'
import { normalizeKey } from './normalize'
import { OpenEventExists, UniqueViolation, type PersonRow, type Store } from './store'

const ROLES: Role[] = ['admin', 'reception', 'presenter']

type Env = { Variables: { user: TokenPayload } }

const cleanNames = (names: unknown): string[] =>
  Array.isArray(names)
    ? names.map((n) => String(n ?? '').trim().replace(/\s+/g, ' ')).filter((n) => n.length > 0)
    : []

/** "Amigo do Evangelho" não pertence a uma igreja: com ao menos um na lista, a igreja pode ficar em branco. */
const isFriend = (name: string) => /^amigo(\(a\))? do evangelho\b/i.test(name.trim())

const text = (v: unknown) => String(v ?? '').trim().replace(/\s+/g, ' ')

function mergeObservation(current: string | null, extra: string | null | undefined): string | null {
  const add = text(extra)
  if (!add) return current
  if (!current) return add
  return current.toLowerCase().includes(add.toLowerCase()) ? current : `${current} · ${add}`
}

export function createApp(store: Store, secret: string) {
  const app = new Hono<Env>()

  // Falhas internas viram JSON genérico; o motivo real vai só para o log do servidor.
  app.onError((err, c) => {
    console.error(err)
    return c.json({ error: 'Erro no servidor' }, 500)
  })

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

  // Sem código de acesso: a pessoa escolhe Administrador, Recepção ou Apresentação na tela de entrada.
  app.post('/api/login', async (c) => {
    const body = await c.req.json().catch(() => ({}) as Record<string, unknown>)
    const role = body.role as Role
    const deviceId = String(body.deviceId ?? '')
    if (!deviceId) return c.json({ error: 'Aparelho não identificado' }, 400)
    if (!ROLES.includes(role)) return c.json({ error: 'Acesso inválido' }, 400)
    const name = body.name ? text(body.name) : undefined
    return c.json({ token: await signToken({ role, deviceId, name }, secret), role })
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

  app.delete('/api/events/:id', only('admin'), async (c) => {
    const id = c.req.param('id') ?? ''
    if (!(await store.getEvent(id))) return c.json({ error: 'Evento não encontrado' }, 404)
    await store.deleteEvent(id)
    return c.json({ ok: true })
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

  // ---------- listagens (recepção e apresentador) ----------
  /** Evento pedido (`?eventId=`) ou, sem parâmetro, o evento aberto. Assim a tela precisa de uma chamada só. */
  const resolveEvent = (c: Context<Env>) => {
    const id = c.req.query('eventId')
    return id ? store.getEvent(id) : store.getOpenEvent()
  }

  /** Grupos do evento com suas pessoas, em ordem de chegada; `deviceId` limita aos envios daquele aparelho. */
  const listGroups = async (eventId: string, deviceId?: string) => {
    const groups = (await store.listGroups(eventId))
      .filter((g) => !deviceId || g.device_id === deviceId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
    const byGroup = new Map<string, PersonRow[]>()
    for (const p of await store.listPeople(eventId)) byGroup.set(p.group_id, [...(byGroup.get(p.group_id) ?? []), p])
    return groups.map((g) => ({
      id: g.id,
      city: g.city,
      church: g.church,
      observation: g.observation,
      people: (byGroup.get(g.id) ?? [])
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((p) => ({ id: p.id, name: p.name, presented: p.presented })),
    }))
  }

  const listing = (deviceOnly: boolean) => async (c: Context<Env>) => {
    const event = await resolveEvent(c)
    if (!event) return c.json({ event: null, groups: [] })
    return c.json({ event, groups: await listGroups(event.id, deviceOnly ? c.get('user').deviceId : undefined) })
  }

  app.get('/api/groups/mine', only('reception'), listing(true))
  app.get('/api/list', only('presenter', 'admin'), listing(false))

  // ---------- visitantes (recepção) ----------
  app.post('/api/groups', only('reception'), async (c) => {
    const user = c.get('user')
    const body = await c.req.json().catch(() => ({}) as Record<string, unknown>)
    const eventId = String(body.eventId ?? '')
    const clientId = String(body.clientId ?? '')
    const city = text(body.city)
    const church = text(body.church)
    const names = cleanNames(body.names)
    if (!eventId || !clientId || !city) return c.json({ error: 'Preencha cidade e igreja' }, 400)
    if (names.length === 0) return c.json({ error: 'Informe pelo menos um nome' }, 400)
    if (!church && !names.some(isFriend)) return c.json({ error: 'Preencha cidade e igreja' }, 400)
    if (!(await store.getEvent(eventId))) return c.json({ error: 'Evento não encontrado' }, 404)

    // Mesmo nome duas vezes no mesmo envio conta uma vez.
    const seen = new Set<string>()
    const unique: { name: string; key: string }[] = []
    for (const name of names) {
      const key = normalizeKey(name)
      if (seen.has(key)) continue
      seen.add(key)
      unique.push({ name, key })
    }

    // Reenvio seguro: reaproveita o grupo e refaz só o que faltou. Se outro envio igual chegar ao mesmo tempo,
    // o banco recusa o segundo grupo (UniqueViolation) e usamos o que o primeiro criou.
    let group = await store.findGroupByClient(eventId, clientId)
    if (!group) {
      try {
        group = await store.insertGroup({
          event_id: eventId,
          client_id: clientId,
          city,
          church,
          observation: text(body.observation) || null,
          device_id: user.deviceId,
          receptionist: user.name ?? null,
        })
      } catch (e) {
        if (!(e instanceof UniqueViolation)) throw e
        group = await store.findGroupByClient(eventId, clientId)
        if (!group) throw e
      }
    }

    const cityKey = normalizeKey(city)
    const churchKey = normalizeKey(church)
    await store.insertPeople(
      unique.map((u) => ({ group_id: group.id, event_id: eventId, name: u.name, name_key: u.key, city_key: cityKey, church_key: churchKey })),
    )
    // Quem está neste grupo agora (gravado agora ou numa tentativa anterior) conta como adicionado; o resto já existia em outro grupo.
    const inGroup = new Set((await store.listPeopleByGroup(group.id)).map((p) => p.name_key))
    const added = unique.filter((u) => inGroup.has(u.key)).map((u) => u.name)
    const duplicates = unique.filter((u) => !inGroup.has(u.key)).map((u) => u.name)

    if (group.observation) {
      for (const u of unique.filter((x) => !inGroup.has(x.key))) {
        const other = await store.findPersonByKey(eventId, u.key, cityKey, churchKey)
        const og = other && (await store.getGroup(other.group_id))
        if (!og) continue
        const merged = mergeObservation(og.observation, group.observation)
        if (merged !== og.observation) await store.updateGroup(og.id, { city: og.city, church: og.church, observation: merged })
      }
    }
    if (inGroup.size === 0) await store.deleteGroup(group.id)
    return c.json({ added, duplicates })
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
    if (!city) return c.json({ error: 'Preencha cidade e igreja' }, 400)

    const cityKey = normalizeKey(city)
    const churchKey = normalizeKey(church)
    const current = (await store.listPeopleByGroup(group.id)).sort((x, y) => x.created_at.localeCompare(y.created_at))

    // Entradas com id mantêm a pessoa (e a marcação de apresentado); sem id, vale o nome.
    type Entry = { id?: string; name: string }
    const raw: Entry[] = Array.isArray(body.people)
      ? (body.people as { id?: unknown; name?: unknown }[]).map((p) => ({ id: p?.id ? String(p.id) : undefined, name: text(p?.name) }))
      : names.map((n) => ({ name: n }))
    const used = new Set<string>()
    const entries: Entry[] = []
    const seenKeys = new Set<string>()
    for (const e of raw) {
      if (!e.name) continue
      const key = normalizeKey(e.name)
      if (seenKeys.has(key)) continue
      seenKeys.add(key)
      let id = e.id && current.some((p) => p.id === e.id) && !used.has(e.id) ? e.id : undefined
      if (!id && !e.id) id = current.find((p) => p.name_key === key && !used.has(p.id))?.id
      if (id) used.add(id)
      entries.push({ id, name: e.name })
    }
    if (entries.length === 0) return c.json({ error: 'Informe pelo menos um nome' }, 400)
    if (!church && !entries.some((e) => isFriend(e.name))) return c.json({ error: 'Preencha cidade e igreja' }, 400)

    const toRemove = current.filter((p) => !used.has(p.id))
    const updates = entries
      .filter((e) => e.id)
      .map((e) => ({ person: current.find((p) => p.id === e.id)!, name: e.name, key: normalizeKey(e.name) }))
      .filter((u) => u.person.name !== u.name || u.person.name_key !== u.key || u.person.city_key !== cityKey || u.person.church_key !== churchKey)
    const inserts = entries.filter((e) => !e.id)

    // Confere todos os conflitos antes de mexer em qualquer coisa.
    const clashesRemoved: string[] = []
    for (const target of [...updates.map((u) => ({ key: u.key, self: u.person.id })), ...inserts.map((e) => ({ key: normalizeKey(e.name), self: '' }))]) {
      const clash = await store.findPersonByKey(group.event_id, target.key, cityKey, churchKey)
      if (!clash || clash.id === target.self) continue
      if (toRemove.some((p) => p.id === clash.id)) clashesRemoved.push(clash.id)
      else return c.json({ error: 'Essa pessoa já está na lista' }, 409)
    }

    // Ordem segura: libera chaves, atualiza, insere e só então apaga o resto.
    for (const id of clashesRemoved) await store.deletePerson(id)
    for (const u of updates) {
      const ok = await store.updatePerson(u.person.id, { name: u.name, name_key: u.key, city_key: cityKey, church_key: churchKey })
      if (!ok) return c.json({ error: 'Essa pessoa já está na lista' }, 409)
    }
    if (inserts.length > 0) {
      const added = await store.insertPeople(
        inserts.map((e) => ({ group_id: group.id, event_id: group.event_id, name: e.name, name_key: normalizeKey(e.name), city_key: cityKey, church_key: churchKey })),
      )
      if (added.length !== inserts.length) return c.json({ error: 'Essa pessoa já está na lista' }, 409)
    }
    for (const p of toRemove) if (!clashesRemoved.includes(p.id)) await store.deletePerson(p.id)
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
  app.put('/api/groups/:id/presented', only('presenter', 'admin'), async (c) => {
    const body = await c.req.json().catch(() => ({}) as Record<string, unknown>)
    await store.setGroupPresented(c.req.param('id') ?? '', body.presented === true)
    return c.json({ ok: true })
  })

  return app
}
