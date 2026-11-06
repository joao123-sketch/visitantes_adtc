// Servidor de desenvolvimento com dados em memória (sem Supabase). Só para testar as telas localmente.
// PINs de teste: admin 111111, recepção 222222, apresentador 333333.
import { serve } from '@hono/node-server'
import { createApp } from '../server/app'
import { memoryStore } from '../server/memoryStore'
import { hashPin } from '../server/auth'

const store = memoryStore()
for (const [role, pin] of [['admin', '111111'], ['reception', '222222'], ['presenter', '333333']]) {
  await store.setPin(role, await hashPin(pin, 'dev'), 'dev')
}
serve({ fetch: createApp(store, 'dev-secret').fetch, port: 8788 })
console.log('API de desenvolvimento em http://localhost:8788')
