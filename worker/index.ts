import { createApp } from '../server/app'
import { supabaseStore } from '../server/supabaseStore'

type Env = { SUPABASE_URL: string; SUPABASE_SERVICE_KEY: string; TOKEN_SECRET: string }

const REQUIRED = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'TOKEN_SECRET'] as const

const failure = (detail: string) => Response.json({ error: 'Erro no servidor', detail }, { status: 500 })

// Só as rotas /api/* passam por aqui (run_worker_first); o resto é servido como arquivo estático.
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const missing = REQUIRED.filter((name) => !env?.[name])
    if (missing.length > 0) return failure(`Faltam variáveis na Cloudflare: ${missing.join(', ')}`)
    try {
      return await createApp(supabaseStore(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY), env.TOKEN_SECRET).fetch(request)
    } catch (e) {
      console.error(e)
      return failure(String((e as Error)?.message ?? e).slice(0, 200))
    }
  },
} satisfies ExportedHandler<Env>
