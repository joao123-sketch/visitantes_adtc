import { describe, it, expect } from 'vitest'
import { signToken, verifyToken } from './auth'

const payload = { role: 'reception' as const, deviceId: 'dev-1', name: 'Carlos' }

describe('token', () => {
  it('assina e verifica devolvendo o payload', async () => {
    const t = await signToken(payload, 'segredo')
    const p = await verifyToken(t, 'segredo')
    expect(p).toMatchObject(payload)
  })
  it('token alterado vira null', async () => {
    const t = await signToken(payload, 'segredo')
    const [body, sig] = t.split('.')
    const forged = btoa(JSON.stringify({ ...payload, role: 'admin', exp: 9999999999 })) + '.' + sig
    expect(await verifyToken(forged, 'segredo')).toBeNull()
    expect(await verifyToken(body + '.x', 'segredo')).toBeNull()
  })
  it('segredo diferente vira null', async () => {
    const t = await signToken(payload, 'segredo')
    expect(await verifyToken(t, 'outro')).toBeNull()
  })
  it('token expirado vira null', async () => {
    const t = await signToken(payload, 'segredo', -10)
    expect(await verifyToken(t, 'segredo')).toBeNull()
  })
})
