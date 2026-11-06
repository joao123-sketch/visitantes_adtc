/** Erro que não adianta tentar de novo (ex.: dados inválidos): o item é descartado. */
export class PermanentError extends Error {}

export function createQueue<T>(storageKey: string, idOf: (item: T) => string) {
  const load = (): T[] => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) ?? '[]') as T[]
    } catch {
      return []
    }
  }
  const save = (items: T[]) => localStorage.setItem(storageKey, JSON.stringify(items))
  let flushing: Promise<void> | null = null

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
    /** Envia em ordem. Falha de rede ou sessão expirada mantém o item e para; erro permanente descarta. */
    flush(send: (item: T) => Promise<void>): Promise<void> {
      if (flushing) return flushing
      flushing = (async () => {
        for (const item of load()) {
          try {
            await send(item)
          } catch (e) {
            if (e instanceof PermanentError) {
              save(load().filter((x) => idOf(x) !== idOf(item)))
              continue
            }
            return
          }
          save(load().filter((x) => idOf(x) !== idOf(item)))
        }
      })().finally(() => {
        flushing = null
      })
      return flushing
    },
  }
}
