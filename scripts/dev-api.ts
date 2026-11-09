// Servidor de desenvolvimento com dados em memória (sem Supabase). Só para testar as telas localmente.
import { serve } from '@hono/node-server'
import { createApp } from '../server/app'
import { memoryStore } from '../server/memoryStore'

const store = memoryStore()
// Senha do administrador: 1111. Recepcionistas de teste: Ana e Carlos (recepção e apresentação sem senha).
await store.addReceptionist('Ana', 'ana')
await store.addReceptionist('Carlos', 'carlos')
serve({ fetch: createApp(store, 'dev-secret').fetch, port: 8788 })
console.log('API de desenvolvimento em http://localhost:8788')
