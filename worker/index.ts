import { createApp, type PinCache } from '../server/app'
import { supabaseStore } from '../server/supabaseStore'

type Env = { SUPABASE_URL: string; SUPABASE_SERVICE_KEY: string; TOKEN_SECRET: string }

const REQUIRED = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'TOKEN_SECRET'] as const

// Quem chama só vê uma mensagem genérica; o motivo real vai para o log da Cloudflare.
const failure = () => Response.json({ error: 'Erro no servidor' }, { status: 500 })

// Vive enquanto o Worker estiver "quente": evita consultar o PIN no banco a cada requisição.
const pinCache: PinCache = new Map()

// Só as rotas /api/* passam por aqui (run_worker_first); o resto é servido como arquivo estático.
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const missing = REQUIRED.filter((name) => !env?.[name])
    if (missing.length > 0) {
      const received = Object.keys(env ?? {}).join(', ') || 'nenhuma' // só os nomes, nunca os valores
      console.error(`Faltam variáveis na Cloudflare: ${missing.join(', ')}. O Worker recebeu: ${received}`)
      return failure()
    }
    try {
      return await createApp(supabaseStore(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY), env.TOKEN_SECRET, { pinCache }).fetch(request)
    } catch (e) {
      console.error(e)
      return failure()
    }
  },
} satisfies ExportedHandler<Env>
