export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export type Role = 'admin' | 'reception' | 'presenter'

export const session = {
  get token() {
    return localStorage.getItem('token')
  },
  get role() {
    return localStorage.getItem('role') as Role | null
  },
  get name() {
    return localStorage.getItem('name') ?? ''
  },
  set(token: string, role: Role) {
    localStorage.setItem('token', token)
    localStorage.setItem('role', role)
  },
  setName(name: string) {
    localStorage.setItem('name', name)
  },
  /** Sai da sessão, mantendo a fila de pendentes guardada no celular. */
  clear() {
    localStorage.removeItem('token')
    localStorage.removeItem('role')
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
    const body = data as { error?: string; detail?: string }
    const message = body.error ? (body.detail ? `${body.error}: ${body.detail}` : body.error) : 'Erro inesperado'
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
