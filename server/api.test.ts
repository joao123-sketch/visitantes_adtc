import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createApp } from './app'
import { memoryStore } from './memoryStore'
import { hashPin } from './auth'
import { findPinConflict } from './pins'
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

describe('erros internos', () => {
  it('falha ao falar com o banco devolve 500 em JSON sem expor detalhes internos', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    store.getPin = async () => {
      throw new Error('Invalid API key')
    }
    const r = await login('111')
    expect(r.status).toBe(500)
    expect(await r.json()).toEqual({ error: 'Erro no servidor' })
    expect(log).toHaveBeenCalled() // o motivo fica no log do servidor
    log.mockRestore()
  })
})

describe('eventos', () => {
  it('admin lista eventos, o mais recente primeiro; recepção recebe 403', async () => {
    const t = await tokenFor('admin')
    const e1 = (await (await call('POST', '/api/events', t, { name: 'Primeiro', eventDate: '2026-11-01' })).json()) as { id: string }
    await call('POST', `/api/events/${e1.id}/close`, t)
    await call('POST', '/api/events', t, { name: 'Segundo', eventDate: '2026-11-08' })
    const r = (await (await call('GET', '/api/events', t)).json()) as { events: { name: string }[] }
    expect(r.events.map((e) => e.name)).toEqual(['Segundo', 'Primeiro'])
    expect((await call('GET', '/api/events', await tokenFor('reception'))).status).toBe(403)
  })
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
  it('PIN com menos de 3 dígitos ou com letras devolve 400; PIN de 3 dígitos é aceito', async () => {
    const t = await tokenFor('admin')
    expect((await call('PUT', '/api/pins/reception', t, { pin: '12' })).status).toBe(400)
    expect((await call('PUT', '/api/pins/reception', t, { pin: 'abc' })).status).toBe(400)
    expect((await call('PUT', '/api/pins/reception', t, { pin: '999' })).status).toBe(200)
    expect((await login('999')).status).toBe(200)
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
    await call('PUT', `/api/groups/${list.groups[0].id}/presented`, pres, { presented: true })
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

describe('revisão final', () => {
  it('reenvio depois de falha ao gravar as pessoas completa o envio, sem cartão duplicado', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const eid = await openEvent()
    const t = await tokenFor('reception')
    const pres = await tokenFor('presenter')
    const real = store.insertPeople.bind(store)
    let calls = 0
    store.insertPeople = async (list) => {
      calls++
      if (calls === 1) throw new Error('queda')
      return real(list)
    }
    const body = { clientId: uid(), eventId: eid, city: 'Ipueiras', church: 'ADTC', names: ['Maria', 'Carlos'] }
    expect((await call('POST', '/api/groups', t, body)).status).toBe(500)
    const again = await call('POST', '/api/groups', t, body)
    expect(again.status).toBe(200)
    expect(((await again.json()) as { added: string[] }).added.sort()).toEqual(['Carlos', 'Maria'])
    const list = await getList(eid, pres)
    expect(list.groups).toHaveLength(1)
    expect(list.groups[0].people.map((p) => p.name).sort()).toEqual(['Carlos', 'Maria'])
    log.mockRestore()
  })
  it('mesmo nome duas vezes no mesmo envio conta uma vez', async () => {
    const eid = await openEvent()
    const t = await tokenFor('reception')
    const r = (await (await submit(t, eid, ['João', 'joao'])).json()) as { added: string[] }
    expect(r.added).toEqual(['João'])
  })

  it('PIN igual ao de outro acesso devolve 409', async () => {
    const t = await tokenFor('admin')
    const r = await call('PUT', '/api/pins/presenter', t, { pin: '222222' })
    expect(r.status).toBe(409)
    expect(await r.json()).toEqual({ error: 'Esse código já é usado por outro acesso' })
  })

  it('trocar o PIN derruba as sessões antigas daquele acesso', async () => {
    const adm = await tokenFor('admin')
    const rec = await tokenFor('reception')
    expect((await call('GET', '/api/events/current', rec)).status).toBe(200)
    await call('PUT', '/api/pins/reception', adm, { pin: '999999' })
    expect((await call('GET', '/api/events/current', rec)).status).toBe(401)
    expect((await call('GET', '/api/events/current', adm)).status).toBe(200)
  })

  const put = (t: string, gid: string, people: { id?: string; name: string }[], over: Record<string, unknown> = {}) =>
    call('PUT', `/api/groups/${gid}`, t, { city: 'Ipueiras', church: 'ADTC', observation: null, people, ...over })
  const mark = async (pres: string, groupId: string) => call('PUT', `/api/groups/${groupId}/presented`, pres, { presented: true })

  it('corrigir o nome de quem já foi apresentado mantém a marcação', async () => {
    const eid = await openEvent()
    const a = await tokenFor('reception')
    const pres = await tokenFor('presenter')
    await submit(a, eid, ['Jose'])
    const g = (await getMine(eid, a)).groups[0]
    await mark(pres, g.id)
    expect((await put(a, g.id, [{ id: g.people[0].id, name: 'José Carlos' }])).status).toBe(200)
    const p = (await getList(eid, pres)).groups[0].people
    expect(p).toHaveLength(1)
    expect(p[0].name).toBe('José Carlos')
    expect(p[0].presented).toBe(true)
  })
  it('corrigir a cidade mantém a marcação de apresentado', async () => {
    const eid = await openEvent()
    const a = await tokenFor('reception')
    const pres = await tokenFor('presenter')
    await submit(a, eid, ['João'], { city: 'Ipueras' })
    const g = (await getMine(eid, a)).groups[0]
    await mark(pres, g.id)
    expect((await put(a, g.id, [{ id: g.people[0].id, name: 'João' }], { city: 'Ipueiras' })).status).toBe(200)
    const list = await getList(eid, pres)
    expect(list.groups[0].people[0].presented).toBe(true)
  })
  it('corrigir só a grafia (mesma chave) atualiza o nome mostrado', async () => {
    const eid = await openEvent()
    const a = await tokenFor('reception')
    const pres = await tokenFor('presenter')
    await submit(a, eid, ['joao silva'])
    const g = (await getMine(eid, a)).groups[0]
    await put(a, g.id, [{ id: g.people[0].id, name: 'João Silva' }])
    expect((await getList(eid, pres)).groups[0].people[0].name).toBe('João Silva')
  })
  it('remover alguém do meio mantém a marcação de quem ficou', async () => {
    const eid = await openEvent()
    const a = await tokenFor('reception')
    const pres = await tokenFor('presenter')
    await submit(a, eid, ['Ana', 'Bia', 'Caio'])
    const g = (await getMine(eid, a)).groups[0]
    const [ana, , caio] = g.people
    await mark(pres, g.id)
    await put(a, g.id, [{ id: ana.id, name: 'Ana' }, { id: caio.id, name: 'Caio' }])
    const p = (await getList(eid, pres)).groups[0].people
    expect(p.map((x) => x.name)).toEqual(['Ana', 'Caio'])
    expect(p.every((x) => x.presented)).toBe(true)
  })
  it('edição que dá 409 não apaga nem altera nada', async () => {
    const eid = await openEvent()
    const a = await tokenFor('reception')
    const pres = await tokenFor('presenter')
    await submit(a, eid, ['Ana'])
    await submit(a, eid, ['Bia', 'Caio'])
    const g = (await getMine(eid, a)).groups.find((x) => x.people.some((p) => p.name === 'Bia'))!
    const bia = g.people.find((p) => p.name === 'Bia')!
    const r = await put(a, g.id, [{ id: bia.id, name: 'Bia' }, { name: 'Ana' }], { observation: 'x' })
    expect(r.status).toBe(409)
    const after = (await getList(eid, pres)).groups.find((x) => x.id === g.id)!
    expect(after.people.map((p) => p.name).sort()).toEqual(['Bia', 'Caio'])
    expect(after.observation).toBeNull()
  })
})

describe('excluir eventos', () => {
  it('admin exclui um evento encerrado e ele some da lista', async () => {
    const adm = await tokenFor('admin')
    const eid = await openEvent()
    await call('POST', `/api/events/${eid}/close`, adm)
    expect((await call('DELETE', `/api/events/${eid}`, adm)).status).toBe(200)
    const r = (await (await call('GET', '/api/events', adm)).json()) as { events: unknown[] }
    expect(r.events).toHaveLength(0)
  })
  it('excluir o evento apaga também os visitantes dele', async () => {
    const adm = await tokenFor('admin')
    const rec = await tokenFor('reception')
    const pres = await tokenFor('presenter')
    const eid = await openEvent()
    await submit(rec, eid, ['Ana', 'Bia'])
    await call('DELETE', `/api/events/${eid}`, adm)
    expect(await store.listGroups(eid)).toEqual([])
    expect(await store.listPeople(eid)).toEqual([])
    expect((await getList(eid, pres)).groups).toEqual([])
  })
  it('excluir o evento aberto libera para abrir outro', async () => {
    const adm = await tokenFor('admin')
    const eid = await openEvent()
    expect((await call('DELETE', `/api/events/${eid}`, adm)).status).toBe(200)
    expect((await call('POST', '/api/events', adm, { name: 'Novo', eventDate: '2026-11-15' })).status).toBe(200)
  })
  it('excluir só atinge o evento escolhido', async () => {
    const adm = await tokenFor('admin')
    const rec = await tokenFor('reception')
    const e1 = await openEvent()
    await submit(rec, e1, ['Ana'])
    await call('POST', `/api/events/${e1}/close`, adm)
    const e2 = ((await (await call('POST', '/api/events', adm, { name: 'Outro', eventDate: '2026-11-15' })).json()) as { id: string }).id
    await submit(rec, e2, ['Bia'])
    await call('DELETE', `/api/events/${e1}`, adm)
    expect((await store.listPeople(e2)).map((p) => p.name)).toEqual(['Bia'])
    expect(await store.getEvent(e2)).not.toBeNull()
  })
  it('recepção e apresentador não excluem (403)', async () => {
    const eid = await openEvent()
    expect((await call('DELETE', `/api/events/${eid}`, await tokenFor('reception'))).status).toBe(403)
    expect((await call('DELETE', `/api/events/${eid}`, await tokenFor('presenter'))).status).toBe(403)
    expect(await store.getEvent(eid)).not.toBeNull()
  })
  it('evento que não existe devolve 404', async () => {
    const adm = await tokenFor('admin')
    expect((await call('DELETE', '/api/events/nao-existe', adm)).status).toBe(404)
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
  it('marcar o grupo marca todas as pessoas; desmarcar desmarca todas', async () => {
    const eid = await openEvent()
    const a = await tokenFor('reception')
    const pres = await tokenFor('presenter')
    await submit(a, eid, ['Ana', 'Bia', 'Caio'])
    const gid = (await getList(eid, pres)).groups[0].id
    expect((await call('PUT', `/api/groups/${gid}/presented`, pres, { presented: true })).status).toBe(200)
    expect((await getList(eid, pres)).groups[0].people.every((p) => p.presented)).toBe(true)
    await call('PUT', `/api/groups/${gid}/presented`, pres, { presented: false })
    expect((await getList(eid, pres)).groups[0].people.some((p) => p.presented)).toBe(false)
  })
  it('marcar um grupo não mexe nos outros grupos', async () => {
    const eid = await openEvent()
    const a = await tokenFor('reception')
    const pres = await tokenFor('presenter')
    await submit(a, eid, ['Ana'])
    await submit(a, eid, ['Bia'], { city: 'Viçosa' })
    const groups = (await getList(eid, pres)).groups
    await call('PUT', `/api/groups/${groups[0].id}/presented`, pres, { presented: true })
    const after = (await getList(eid, pres)).groups
    expect(after[0].people[0].presented).toBe(true)
    expect(after[1].people[0].presented).toBe(false)
  })
  it('marcar o grupo faz uma única atualização no banco, não pessoa por pessoa', async () => {
    const eid = await openEvent()
    const a = await tokenFor('reception')
    const pres = await tokenFor('presenter')
    await submit(a, eid, ['Ana', 'Bia', 'Caio'])
    const gid = (await getList(eid, pres)).groups[0].id
    const group = vi.spyOn(store, 'setGroupPresented')
    await call('PUT', `/api/groups/${gid}/presented`, pres, { presented: true })
    expect(group).toHaveBeenCalledTimes(1)
    expect(group).toHaveBeenCalledWith(gid, true)
  })
  it('recepção não marca grupo como apresentado (403)', async () => {
    const eid = await openEvent()
    const a = await tokenFor('reception')
    await submit(a, eid, ['Ana'])
    const gid = (await getMine(eid, a)).groups[0].id
    expect((await call('PUT', `/api/groups/${gid}/presented`, a, { presented: true })).status).toBe(403)
  })
  it('a rota de marcar por pessoa não existe mais (404)', async () => {
    const pres = await tokenFor('presenter')
    expect((await call('PUT', '/api/people/qualquer/presented', pres, { presented: true })).status).toBe(404)
  })
  it('recepção não lê a lista do apresentador (403)', async () => {
    const eid = await openEvent()
    const a = await tokenFor('reception')
    expect((await call('GET', `/api/list?eventId=${eid}`, a)).status).toBe(403)
  })
})

describe('correções da revisão (segunda rodada)', () => {
  it('código repetido em dois acessos não deixa entrar em nenhum (409)', async () => {
    await setPin('presenter', '111111') // igual ao do admin
    const r = await login('111111')
    expect(r.status).toBe(409)
    expect(await r.json()).toEqual({ error: 'Esse código está repetido em mais de um acesso. Fale com o administrador.' })
  })
  it('findPinConflict acha o outro acesso que já usa o código', async () => {
    expect(await findPinConflict(store, 'presenter', '222222')).toBe('reception')
    expect(await findPinConflict(store, 'reception', '222222')).toBeNull()
    expect(await findPinConflict(store, 'presenter', '999')).toBeNull()
  })
  it('sessão válida não consulta o PIN de novo dentro de 10 s e consulta depois disso', async () => {
    let clock = 1_000_000
    app = createApp(store, SECRET, { now: () => clock })
    const t = await tokenFor('reception')
    const spy = vi.spyOn(store, 'getPin')
    for (let i = 0; i < 3; i++) await call('GET', '/api/events/current', t)
    expect(spy).toHaveBeenCalledTimes(1)
    clock += 11_000
    await call('GET', '/api/events/current', t)
    expect(spy).toHaveBeenCalledTimes(2)
  })
  it('GET /api/list sem eventId devolve o evento aberto e seus grupos numa chamada só', async () => {
    const eid = await openEvent()
    const a = await tokenFor('reception')
    const pres = await tokenFor('presenter')
    await submit(a, eid, ['Ana'])
    const r = (await (await call('GET', '/api/list', pres)).json()) as { event: { id: string } | null; groups: unknown[] }
    expect(r.event?.id).toBe(eid)
    expect(r.groups).toHaveLength(1)
  })
  it('GET /api/groups/mine sem eventId usa o evento aberto e só os grupos deste aparelho', async () => {
    const eid = await openEvent()
    const a = await tokenFor('reception', 'dev-A')
    const b = await tokenFor('reception', 'dev-B')
    await submit(a, eid, ['Ana'])
    await submit(b, eid, ['Bia'])
    const r = (await (await call('GET', '/api/groups/mine', a)).json()) as { event: { id: string } | null; groups: { people: { name: string }[] }[] }
    expect(r.event?.id).toBe(eid)
    expect(r.groups.map((g) => g.people[0].name)).toEqual(['Ana'])
  })
  it('sem evento aberto as listagens devolvem event null e grupos vazios', async () => {
    expect(await (await call('GET', '/api/list', await tokenFor('presenter'))).json()).toEqual({ event: null, groups: [] })
    expect(await (await call('GET', '/api/groups/mine', await tokenFor('reception'))).json()).toEqual({ event: null, groups: [] })
  })
  it('o envio grava todas as pessoas em uma única chamada ao banco', async () => {
    const eid = await openEvent()
    const t = await tokenFor('reception')
    const batch = vi.spyOn(store, 'insertPeople')
    const single = vi.spyOn(store, 'insertPerson')
    const names = Array.from({ length: 15 }, (_, i) => `Pessoa ${i + 1}`)
    const r = (await (await submit(t, eid, names)).json()) as { added: string[] }
    expect(r.added).toHaveLength(15)
    expect(batch).toHaveBeenCalledTimes(1)
    expect(single).not.toHaveBeenCalled()
  })
  it('dois envios simultâneos com o mesmo clientId resultam em um único grupo', async () => {
    const eid = await openEvent()
    const t = await tokenFor('reception')
    const pres = await tokenFor('presenter')
    const body = { clientId: uid(), eventId: eid, city: 'Ipueiras', church: 'ADTC', names: ['João', 'Maria'] }
    const [r1, r2] = await Promise.all([call('POST', '/api/groups', t, body), call('POST', '/api/groups', t, body)])
    expect(r1.status).toBe(200)
    expect(r2.status).toBe(200)
    const list = await getList(eid, pres)
    expect(list.groups).toHaveLength(1)
    expect(list.groups[0].people.map((p) => p.name).sort()).toEqual(['João', 'Maria'])
  })
})
