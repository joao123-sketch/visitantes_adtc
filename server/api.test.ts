import { describe, it, expect, beforeEach } from 'vitest'
import { createApp } from './app'
import { memoryStore } from './memoryStore'
import { hashPin } from './auth'
import type { Store } from './store'

const SECRET = 'segredo-de-teste'
let store: Store
let app: ReturnType<typeof createApp>

async function setPin(role: string, pin: string) {
  await store.setPin(role, await hashPin(pin, 'salt'), 'salt')
}
function login(pin: string, deviceId = 'dev-A', name = 'Carlos') {
  return app.request('/api/login', {
    method: 'POST',
    body: JSON.stringify({ pin, deviceId, name }),
    headers: { 'content-type': 'application/json' },
  })
}
async function tokenFor(role: 'admin' | 'reception' | 'presenter', deviceId = 'dev-A') {
  const pins = { admin: '111111', reception: '222222', presenter: '333333' }
  const r = await login(pins[role], deviceId)
  return ((await r.json()) as { token: string }).token
}
function call(method: string, path: string, token?: string, body?: unknown) {
  return app.request(path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

beforeEach(async () => {
  store = memoryStore()
  app = createApp(store, SECRET)
  await setPin('admin', '111111')
  await setPin('reception', '222222')
  await setPin('presenter', '333333')
})

describe('login', () => {
  it('PIN correto devolve token e papel', async () => {
    const r = await login('222222')
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ role: 'reception' })
  })
  it('PIN errado devolve 401 com mensagem', async () => {
    const r = await login('000000')
    expect(r.status).toBe(401)
    expect(await r.json()).toEqual({ error: 'PIN incorreto' })
  })
  it('rota protegida sem token ou com token inválido devolve 401', async () => {
    expect((await call('GET', '/api/events/current')).status).toBe(401)
    expect((await call('GET', '/api/events/current', 'lixo')).status).toBe(401)
  })
})

describe('eventos', () => {
  it('admin cria evento; criar outro com um aberto devolve 409', async () => {
    const t = await tokenFor('admin')
    expect((await call('POST', '/api/events', t, { name: 'Culto', eventDate: '2026-11-08' })).status).toBe(200)
    expect((await call('POST', '/api/events', t, { name: 'Outro', eventDate: '2026-11-09' })).status).toBe(409)
  })
  it('recepção não cria evento (403)', async () => {
    const t = await tokenFor('reception')
    expect((await call('POST', '/api/events', t, { name: 'X', eventDate: '2026-11-08' })).status).toBe(403)
  })
  it('encerrar, criar outro e reabrir o primeiro devolve 409', async () => {
    const t = await tokenFor('admin')
    const e1 = (await (await call('POST', '/api/events', t, { name: 'A', eventDate: '2026-11-08' })).json()) as { id: string }
    await call('POST', `/api/events/${e1.id}/close`, t)
    await call('POST', '/api/events', t, { name: 'B', eventDate: '2026-11-09' })
    expect((await call('POST', `/api/events/${e1.id}/reopen`, t)).status).toBe(409)
  })
  it('current devolve null sem evento aberto', async () => {
    const t = await tokenFor('reception')
    expect(await (await call('GET', '/api/events/current', t)).json()).toEqual({ event: null })
  })
  it('PUT /api/pins com PIN de 5 dígitos devolve 400; com 6 dígitos troca', async () => {
    const t = await tokenFor('admin')
    expect((await call('PUT', '/api/pins/reception', t, { pin: '12345' })).status).toBe(400)
    expect((await call('PUT', '/api/pins/reception', t, { pin: '999999' })).status).toBe(200)
    expect((await login('999999')).status).toBe(200)
  })
})

async function openEvent() {
  const t = await tokenFor('admin')
  const r = (await (await call('POST', '/api/events', t, { name: 'Culto', eventDate: '2026-11-08' })).json()) as { id: string }
  return r.id
}
const uid = () => crypto.randomUUID()
const submit = (t: string, eventId: string, names: string[], over: Record<string, unknown> = {}) =>
  call('POST', '/api/groups', t, { clientId: uid(), eventId, city: 'Ipueiras', church: 'ADTC', names, ...over })

type ListRes = { groups: { id: string; observation: string | null; people: { id: string; name: string; presented: boolean }[] }[] }
const getList = async (eid: string, t: string) => (await (await call('GET', `/api/list?eventId=${eid}`, t)).json()) as ListRes
const getMine = async (eid: string, t: string) => (await (await call('GET', `/api/groups/mine?eventId=${eid}`, t)).json()) as ListRes

describe('visitantes', () => {
  it('reenvio com mesmo clientId não duplica', async () => {
    const eid = await openEvent()
    const t = await tokenFor('reception')
    const pres = await tokenFor('presenter')
    const body = { clientId: uid(), eventId: eid, city: 'Ipueiras', church: 'ADTC', names: ['João'] }
    await call('POST', '/api/groups', t, body)
    const again = await call('POST', '/api/groups', t, body)
    expect(again.status).toBe(200)
    const list = await getList(eid, pres)
    expect(list.groups).toHaveLength(1)
    expect(list.groups[0].people).toHaveLength(1)
  })
  it('Maria e João + Maria e Carlos: entra só Carlos', async () => {
    const eid = await openEvent()
    const t = await tokenFor('reception')
    await submit(t, eid, ['Maria', 'João'])
    const r = (await (await submit(t, eid, ['Maria', 'Carlos'])).json()) as { added: string[]; duplicates: string[] }
    expect(r.added).toEqual(['Carlos'])
    expect(r.duplicates).toEqual(['Maria'])
  })
  it('mesmo nome e cidade com igrejas diferentes são pessoas diferentes', async () => {
    const eid = await openEvent()
    const t = await tokenFor('reception')
    await submit(t, eid, ['João'], { church: 'Bela Vista' })
    const r = (await (await submit(t, eid, ['Joao'], { church: 'Assembleia' })).json()) as { added: string[] }
    expect(r.added).toEqual(['Joao'])
  })
  it('acento, caixa e espaços extras contam como duplicata', async () => {
    const eid = await openEvent()
    const t = await tokenFor('reception')
    await submit(t, eid, ['João'])
    const r = (await (await submit(t, eid, ['  JOAO  '], { city: 'ipueiras', church: ' adtc ' })).json()) as {
      added: string[]
      duplicates: string[]
    }
    expect(r.added).toEqual([])
    expect(r.duplicates).toHaveLength(1)
  })
  it('linhas vazias são ignoradas', async () => {
    const eid = await openEvent()
    const t = await tokenFor('reception')
    const r = (await (await submit(t, eid, ['João', '   ', ''])).json()) as { added: string[] }
    expect(r.added).toEqual(['João'])
  })
  it('envio sem nenhum nome devolve 400', async () => {
    const eid = await openEvent()
    const t = await tokenFor('reception')
    expect((await submit(t, eid, ['  ', ''])).status).toBe(400)
  })
  it('aceita envio para evento já encerrado (pendente offline)', async () => {
    const eid = await openEvent()
    const t = await tokenFor('reception')
    const adm = await tokenFor('admin')
    await call('POST', `/api/events/${eid}/close`, adm)
    expect((await submit(t, eid, ['João'])).status).toBe(200)
  })
  it('observação diferente de pessoa duplicada é anexada ao grupo existente', async () => {
    const eid = await openEvent()
    const t = await tokenFor('reception')
    const pres = await tokenFor('presenter')
    await submit(t, eid, ['João'], { observation: 'Pastor' })
    await submit(t, eid, ['João'], { observation: 'Veio de ônibus' })
    const list = await getList(eid, pres)
    expect(list.groups[0].observation).toContain('Pastor')
    expect(list.groups[0].observation).toContain('Veio de ônibus')
  })
  it('mine lista só os grupos do próprio aparelho', async () => {
    const eid = await openEvent()
    const a = await tokenFor('reception', 'dev-A')
    const b = await tokenFor('reception', 'dev-B')
    await submit(a, eid, ['João'])
    await submit(b, eid, ['Pedro'])
    const mine = await getMine(eid, a)
    expect(mine.groups).toHaveLength(1)
    expect(mine.groups[0].people[0].name).toBe('João')
  })
  it('outro aparelho não edita nem apaga (403)', async () => {
    const eid = await openEvent()
    const a = await tokenFor('reception', 'dev-A')
    const b = await tokenFor('reception', 'dev-B')
    await submit(a, eid, ['João'])
    const gid = (await getMine(eid, a)).groups[0].id
    expect((await call('PUT', `/api/groups/${gid}`, b, { city: 'X', church: 'Y', names: ['Z'] })).status).toBe(403)
    expect((await call('DELETE', `/api/groups/${gid}`, b)).status).toBe(403)
  })
  it('editar mantém a marcação de apresentado de quem continua', async () => {
    const eid = await openEvent()
    const a = await tokenFor('reception')
    const pres = await tokenFor('presenter')
    await submit(a, eid, ['João', 'Maria'])
    let list = await getList(eid, pres)
    const joao = list.groups[0].people.find((p) => p.name === 'João')!
    await call('PUT', `/api/people/${joao.id}/presented`, pres, { presented: true })
    const r = await call('PUT', `/api/groups/${list.groups[0].id}`, a, {
      city: 'Ipueiras',
      church: 'ADTC',
      names: ['João', 'Pedro'],
      observation: null,
    })
    expect(r.status).toBe(200)
    list = await getList(eid, pres)
    expect(list.groups[0].people.map((p) => p.name).sort()).toEqual(['João', 'Pedro'])
    expect(list.groups[0].people.find((p) => p.name === 'João')!.presented).toBe(true)
  })
  it('editar para nome que já existe em outro grupo devolve 409', async () => {
    const eid = await openEvent()
    const a = await tokenFor('reception')
    await submit(a, eid, ['João'])
    await submit(a, eid, ['Maria'])
    const g = (await getMine(eid, a)).groups.find((x) => x.people[0].name === 'Maria')!
    const r = await call('PUT', `/api/groups/${g.id}`, a, { city: 'Ipueiras', church: 'ADTC', names: ['João'], observation: null })
    expect(r.status).toBe(409)
    expect(await r.json()).toEqual({ error: 'Essa pessoa já está na lista' })
  })
  it('apagar remove o grupo; com evento encerrado devolve 403', async () => {
    const eid = await openEvent()
    const a = await tokenFor('reception')
    const adm = await tokenFor('admin')
    await submit(a, eid, ['João'])
    const gid = (await getMine(eid, a)).groups[0].id
    await call('POST', `/api/events/${eid}/close`, adm)
    expect((await call('DELETE', `/api/groups/${gid}`, a)).status).toBe(403)
    await call('POST', `/api/events/${eid}/reopen`, adm)
    expect((await call('DELETE', `/api/groups/${gid}`, a)).status).toBe(200)
  })
})

describe('apresentador', () => {
  it('lista em ordem de chegada', async () => {
    const eid = await openEvent()
    const a = await tokenFor('reception')
    const pres = await tokenFor('presenter')
    await submit(a, eid, ['Primeiro'])
    await submit(a, eid, ['Segundo'])
    const list = await getList(eid, pres)
    expect(list.groups.map((g) => g.people[0].name)).toEqual(['Primeiro', 'Segundo'])
  })
  it('marcar duas vezes mantém true; desmarcar volta a false', async () => {
    const eid = await openEvent()
    const a = await tokenFor('reception')
    const pres = await tokenFor('presenter')
    await submit(a, eid, ['João'])
    const first = async () => (await getList(eid, pres)).groups[0].people[0]
    const p = await first()
    await call('PUT', `/api/people/${p.id}/presented`, pres, { presented: true })
    await call('PUT', `/api/people/${p.id}/presented`, pres, { presented: true })
    expect((await first()).presented).toBe(true)
    await call('PUT', `/api/people/${p.id}/presented`, pres, { presented: false })
    expect((await first()).presented).toBe(false)
  })
  it('recepção não marca apresentado (403)', async () => {
    const a = await tokenFor('reception')
    expect((await call('PUT', '/api/people/qualquer/presented', a, { presented: true })).status).toBe(403)
  })
  it('recepção não lê a lista do apresentador (403)', async () => {
    const eid = await openEvent()
    const a = await tokenFor('reception')
    expect((await call('GET', `/api/list?eventId=${eid}`, a)).status).toBe(403)
  })
})
