// Servidor de desenvolvimento com dados em memória (sem Supabase). Só para testar as telas localmente.
import { serve } from '@hono/node-server'
import { createApp } from '../server/app'
import { memoryStore } from '../server/memoryStore'

const store = memoryStore()
serve({ fetch: createApp(store, 'dev-secret').fetch, port: 8788 })
console.log('API de desenvolvimento em http://localhost:8788')
