import { createApp } from '../server/app'
import { supabaseStore } from '../server/supabaseStore'

type Env = { SUPABASE_URL: string; SUPABASE_SERVICE_KEY: string; TOKEN_SECRET: string }

// Só as rotas /api/* passam por aqui (run_worker_first); o resto é servido como arquivo estático.
export default {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    return createApp(supabaseStore(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY), env.TOKEN_SECRET).fetch(request)
  },
} satisfies ExportedHandler<Env>
