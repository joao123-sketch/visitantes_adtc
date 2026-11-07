// Uso: npx tsx scripts/set-pin.ts <admin|reception|presenter> <PIN de 3 a 8 dígitos>
// Lê SUPABASE_URL e SUPABASE_SERVICE_KEY do ambiente (ou do arquivo .dev.vars).
import { readFileSync, existsSync } from 'node:fs'
import { hashPin, type Role } from '../server/auth'
import { findPinConflict } from '../server/pins'
import { supabaseStore } from '../server/supabaseStore'

if (existsSync('.dev.vars')) {
  for (const line of readFileSync('.dev.vars', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
  }
}

const [role, pin] = process.argv.slice(2)
if (!['admin', 'reception', 'presenter'].includes(role) || !/^\d{3,8}$/.test(pin ?? '')) {
  console.error('Uso: npx tsx scripts/set-pin.ts <admin|reception|presenter> <PIN de 3 a 8 dígitos>')
  process.exit(1)
}
const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_KEY (no ambiente ou em .dev.vars)')
  process.exit(1)
}

const store = supabaseStore(SUPABASE_URL, SUPABASE_SERVICE_KEY)
const conflict = await findPinConflict(store, role as Role, pin)
if (conflict) {
  console.error(`Esse código já é usado pelo acesso "${conflict}". Escolha outro, senão quem digitar entraria no acesso errado.`)
  process.exit(1)
}
const salt = crypto.randomUUID()
await store.setPin(role, await hashPin(pin, salt), salt)
console.log(`PIN de ${role} definido.`)
