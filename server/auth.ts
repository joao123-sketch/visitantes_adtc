export type Role = 'admin' | 'reception' | 'presenter'
export type TokenPayload = { role: Role; deviceId: string; name?: string; ph?: string }
type Signed = TokenPayload & { exp: number }

const enc = new TextEncoder()

const b64url = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const fromB64url = (s: string) => {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
  return Uint8Array.from(atob(pad), (c) => c.charCodeAt(0))
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

export async function hashPin(pin: string, salt: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(`${salt}:${pin}`))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function signToken(payload: TokenPayload, secret: string, ttlSeconds = 86400): Promise<string> {
  const signed: Signed = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds }
  const body = b64url(enc.encode(JSON.stringify(signed)))
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body))
  return `${body}.${b64url(sig)}`
}

export async function verifyToken(token: string, secret: string): Promise<TokenPayload | null> {
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), fromB64url(sig), enc.encode(body))
    if (!ok) return null
    const p = JSON.parse(new TextDecoder().decode(fromB64url(body))) as Signed
    if (p.exp < Math.floor(Date.now() / 1000)) return null
    const { exp: _exp, ...rest } = p
    return rest
  } catch {
    return null
  }
}
