import { handle } from 'hono/cloudflare-pages'
import { createApp } from '../../server/app'
import { supabaseStore } from '../../server/supabaseStore'

type Bindings = { SUPABASE_URL: string; SUPABASE_SERVICE_KEY: string; TOKEN_SECRET: string }

export const onRequest: PagesFunction<Bindings> = (context) => {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY, TOKEN_SECRET } = context.env
  const app = createApp(supabaseStore(SUPABASE_URL, SUPABASE_SERVICE_KEY), TOKEN_SECRET)
  return handle(app)(context as never)
}
