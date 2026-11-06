type Sentinel = { release: () => Promise<void> }

/** Mantém a tela acesa enquanto o app está aberto. Devolve a função que libera. */
export function keepAwake(): () => void {
  const wl = (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<Sentinel> } }).wakeLock
  if (!wl) return () => {}

  let sentinel: Sentinel | null = null
  let stopped = false

  const acquire = async () => {
    try {
      const s = await wl.request('screen')
      if (stopped) await s.release().catch(() => {})
      else sentinel = s
    } catch {
      // aparelho recusou (bateria baixa, etc.): o app continua funcionando
    }
  }
  const onVisible = () => {
    if (document.visibilityState === 'visible' && !stopped) void acquire()
  }

  document.addEventListener('visibilitychange', onVisible)
  void acquire()

  return () => {
    stopped = true
    document.removeEventListener('visibilitychange', onVisible)
    void sentinel?.release().catch(() => {})
  }
}
