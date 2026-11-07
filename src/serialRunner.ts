/**
 * Garante que `fn` nunca rode duas vezes ao mesmo tempo. Se for pedida durante uma execução,
 * roda mais uma vez logo depois (uma só, por maior que seja o número de pedidos).
 * A promessa devolvida só resolve quando a execução extra, se houver, terminar.
 */
export function createSerialRunner(fn: () => Promise<void>): () => Promise<void> {
  let running: Promise<void> | null = null
  let again = false

  return function trigger(): Promise<void> {
    if (running) {
      again = true
      return running
    }
    running = (async () => {
      do {
        again = false
        await fn()
      } while (again)
    })().finally(() => {
      running = null
    })
    return running
  }
}
