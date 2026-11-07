import { hashPin, type Role } from './auth'
import type { Store } from './store'

export const ROLES: Role[] = ['admin', 'reception', 'presenter']

/** Papéis cujo PIN é exatamente `pin`. Mais de um resultado significa código repetido. */
export async function rolesMatchingPin(store: Store, pin: string): Promise<{ role: Role; pin_hash: string }[]> {
  const matches: { role: Role; pin_hash: string }[] = []
  for (const role of ROLES) {
    const row = await store.getPin(role)
    if (row && (await hashPin(pin, row.salt)) === row.pin_hash) matches.push({ role, pin_hash: row.pin_hash })
  }
  return matches
}

/** Outro papel (diferente de `role`) que já usa esse PIN, ou null. Vale para a rota, o script e qualquer troca de PIN. */
export async function findPinConflict(store: Store, role: Role, pin: string): Promise<Role | null> {
  const matches = await rolesMatchingPin(store, pin)
  return matches.find((m) => m.role !== role)?.role ?? null
}
