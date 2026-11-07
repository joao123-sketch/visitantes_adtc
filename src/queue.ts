/** Erro que não adianta tentar de novo (ex.: dados inválidos): o item é descartado. */
export class PermanentError extends Error {}

export type Queue<T> = ReturnType<typeof createQueue<T>>

export function createQueue<T>(storageKey: string, idOf: (item: T) => string) {
  const load = (): T[] => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) ?? '[]') as T[]
    } catch {
      return []
    }
  }
  const save = (items: T[]) => localStorage.setItem(storageKey, JSON.stringify(items))
  const same = (a: T, b: T) => JSON.stringify(a) === JSON.stringify(b)

  /** Tira da fila o item enviado, mas só se ele não mudou durante o envio. Devolve true se mudou. */
  const removeSent = (sent: T): boolean => {
    const items = load()
    const now = items.find((x) => idOf(x) === idOf(sent))
    if (now && !same(now, sent)) return true
    save(items.filter((x) => idOf(x) !== idOf(sent)))
    return false
  }

  let flushing: Promise<void> | null = null
  let again = false

  /** Uma passada pela fila. Devolve true se algum item mudou durante o envio. */
  async function pass(send: (item: T) => Promise<void>): Promise<boolean> {
    let changed = false
    for (const item of load()) {
      try {
        await send(item)
      } catch (e) {
        if (e instanceof PermanentError) {
          removeSent(item)
          continue
        }
        return changed // rede ou sessão: mantém o item e para
      }
      if (removeSent(item)) changed = true
    }
    return changed
  }

  return {
    items: load,
    count: () => load().length,
    /** Mesmo id substitui o anterior: a última escrita vale. */
    enqueue(item: T) {
      const items = load()
      const i = items.findIndex((x) => idOf(x) === idOf(item))
      if (i >= 0) items[i] = item
      else items.push(item)
      save(items)
    },
    /**
     * Envia em ordem. Falha de rede ou sessão expirada mantém o item e para; erro permanente descarta.
     * Item novo ou alterado durante o envio é enviado numa nova passada, sem se perder.
     */
    flush(send: (item: T) => Promise<void>): Promise<void> {
      if (flushing) {
        again = true
        return flushing
      }
      flushing = (async () => {
        let changed: boolean
        do {
          again = false
          changed = await pass(send)
        } while (again || changed)
      })().finally(() => {
        flushing = null
      })
      return flushing
    },
  }
}
