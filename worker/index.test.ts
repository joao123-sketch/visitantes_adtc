import { describe, it, expect, vi } from 'vitest'
import worker from './index'

const req = () => new Request('https://exemplo.workers.dev/api/login', { method: 'POST', body: '{}' })

describe('worker', () => {
  it('sem variáveis configuradas devolve 500 genérico e registra no log quais faltam', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await worker.fetch(req(), {} as never)
    expect(r.status).toBe(500)
    expect(await r.json()).toEqual({ error: 'Erro no servidor' }) // nada de nomes de variáveis para quem chama
    expect(String(log.mock.calls[0][0])).toContain('SUPABASE_URL, SUPABASE_SERVICE_KEY, TOKEN_SECRET')
    log.mockRestore()
  })
  it('registra só as que faltam', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    await worker.fetch(req(), { SUPABASE_URL: 'https://x.supabase.co' } as never)
    expect(String(log.mock.calls[0][0])).toContain('Faltam variáveis na Cloudflare: SUPABASE_SERVICE_KEY, TOKEN_SECRET')
    log.mockRestore()
  })
  it('chave de banco inválida vira JSON 500 genérico e não derruba o Worker', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await worker.fetch(req(), { SUPABASE_URL: 'não é uma url', SUPABASE_SERVICE_KEY: 'x', TOKEN_SECRET: 'y' } as never)
    expect(r.status).toBe(500)
    expect(await r.json()).toEqual({ error: 'Erro no servidor' })
    log.mockRestore()
  })
})
