import { describe, it, expect } from 'vitest'
import worker from './index'

const req = () => new Request('https://exemplo.workers.dev/api/login', { method: 'POST', body: '{}' })

describe('worker', () => {
  it('sem variáveis configuradas devolve 500 em JSON dizendo quais faltam', async () => {
    const r = await worker.fetch(req(), {} as never)
    expect(r.status).toBe(500)
    expect(await r.json()).toEqual({
      error: 'Erro no servidor',
      detail: 'Faltam variáveis na Cloudflare: SUPABASE_URL, SUPABASE_SERVICE_KEY, TOKEN_SECRET. O Worker recebeu: nenhuma',
    })
  })
  it('lista só as que faltam', async () => {
    const r = await worker.fetch(req(), { SUPABASE_URL: 'https://x.supabase.co' } as never)
    expect(((await r.json()) as { detail: string }).detail).toBe(
      'Faltam variáveis na Cloudflare: SUPABASE_SERVICE_KEY, TOKEN_SECRET. O Worker recebeu: SUPABASE_URL',
    )
  })
  it('chave de banco inválida vira JSON 500 e não derruba o Worker', async () => {
    const r = await worker.fetch(req(), { SUPABASE_URL: 'não é uma url', SUPABASE_SERVICE_KEY: 'x', TOKEN_SECRET: 'y' } as never)
    expect(r.status).toBe(500)
    expect(((await r.json()) as { error: string }).error).toBe('Erro no servidor')
  })
})
