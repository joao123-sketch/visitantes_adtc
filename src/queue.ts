/**
 * Erro que não adianta tentar de novo sozinho (ex.: o servidor recusou os dados).
 * O item sai da fila automática, mas NÃO é descartado: vai para a lista de recusados, com o motivo,
 * para a pessoa decidir se tenta de novo ou descarta.
 */
export class PermanentError extends Error {}

export type Queue<T> = ReturnType<typeof createQueue<T>>
export type Failed<T> = { item: T; error: string }

export function createQueue<T>(storageKey: string, idOf: (item: T) => string) {
  const failedKey = `${storageKey}:failed`
  const read = <V>(key: string): V[] => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? '[]') as V[]
    } catch {
      return []
    }
  }
  const load = () => read<T>(storageKey)
  const save = (items: T[]) => localStorage.setItem(storageKey, JSON.stringify(items))
  const loadFailed = () => read<Failed<T>>(failedKey)
  const saveFailed = (items: Failed<T>[]) => localStorage.setItem(failedKey, JSON.stringify(items))
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
          saveFailed([...loadFailed().filter((f) => idOf(f.item) !== idOf(item)), { item, error: e.message }])
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
    /** Itens que o servidor recusou, com o motivo. Ficam guardados até alguém tentar de novo ou descartar. */
    failed: loadFailed,
    /** Mesmo id substitui o anterior: a última escrita vale. */
    enqueue(item: T) {
      const items = load()
      const i = items.findIndex((x) => idOf(x) === idOf(item))
      if (i >= 0) items[i] = item
      else items.push(item)
      save(items)
    },
    /** Devolve um recusado à fila, podendo corrigi-lo antes (por exemplo, trocar o evento). */
    retry(id: string, fix?: (item: T) => T) {
      const f = loadFailed().find((x) => idOf(x.item) === id)
      if (!f) return
      saveFailed(loadFailed().filter((x) => idOf(x.item) !== id))
      const items = load()
      items.push(fix ? fix(f.item) : f.item)
      save(items)
    },
    /** Descarta de vez um recusado. */
    discard(id: string) {
      saveFailed(loadFailed().filter((x) => idOf(x.item) !== id))
    },
    /**
     * Envia em ordem. Falha de rede ou sessão expirada mantém o item e para; recusa do servidor manda o item
     * para a lista de recusados. Item novo ou alterado durante o envio é enviado numa nova passada, sem se perder.
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
