// Servidor de desenvolvimento com dados em memória (sem Supabase). Só para testar as telas localmente.
// PINs de teste: admin 111, recepção 222, apresentador 333.
import { serve } from '@hono/node-server'
import { createApp } from '../server/app'
import { memoryStore } from '../server/memoryStore'
import { hashPin } from '../server/auth'

const store = memoryStore()
for (const [role, pin] of [['admin', '111'], ['reception', '222'], ['presenter', '333']]) {
  await store.setPin(role, await hashPin(pin, 'dev'), 'dev')
}
serve({ fetch: createApp(store, 'dev-secret').fetch, port: 8788 })
console.log('API de desenvolvimento em http://localhost:8788')
