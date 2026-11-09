export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export type Role = 'admin' | 'reception' | 'presenter'

/** Com "lembrar de mim" a sessão fica no aparelho (localStorage); sem ele, só até fechar o app (sessionStorage). */
export const session = {
  get token() {
    return sessionStorage.getItem('token') ?? localStorage.getItem('token')
  },
  get role() {
    return (sessionStorage.getItem('role') ?? localStorage.getItem('role')) as Role | null
  },
  get name() {
    return localStorage.getItem('name') ?? ''
  },
  set(token: string, role: Role, remember = true) {
    this.clear()
    const store = remember ? localStorage : sessionStorage
    store.setItem('token', token)
    store.setItem('role', role)
  },
  /** Troca só o token (por exemplo, depois de o administrador mudar a própria senha), no mesmo lugar onde a sessão estava. */
  replaceToken(token: string) {
    const store = sessionStorage.getItem('token') !== null ? sessionStorage : localStorage
    store.setItem('token', token)
  },
  setName(name: string) {
    localStorage.setItem('name', name)
  },
  /** Sai da sessão, mantendo a fila de pendentes guardada no celular. */
  clear() {
    for (const store of [sessionStorage, localStorage]) {
      store.removeItem('token')
      store.removeItem('role')
    }
  },
}

export function getDeviceId(): string {
  let id = localStorage.getItem('deviceId')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('deviceId', id)
  }
  return id
}

let onUnauthorized: () => void = () => {}
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(session.token ? { authorization: `Bearer ${session.token}` } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const message = (data as { error?: string }).error ?? 'Erro inesperado'
    if (res.status === 401 && path !== '/api/login') {
      session.clear()
      onUnauthorized()
    }
    throw new ApiError(message, res.status)
  }
  return data as T
}

export type EventInfo = { id: string; name: string; event_date: string; status: 'open' | 'closed' }
export type PersonItem = { id: string; name: string; presented: boolean }
export type GroupItem = {
  id: string
  city: string
  church: string
  observation: string | null
  people: PersonItem[]
}
