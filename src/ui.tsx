import { useCallback, useEffect, useRef, useState } from 'react'

export type ToastKind = 'ok' | 'warn' | 'err'

/**
 * Aviso que flutua sobre a tela e some sozinho. Não ocupa lugar no conteúdo, então a tela não "pula"
 * quando ele aparece ou some. `bottom` é a distância do rodapé (a recepção tem uma barra fixa embaixo).
 */
export function useToast(bottom = 16) {
  const [msg, setMsg] = useState<{ kind: ToastKind; text: string; id: number } | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const show = useCallback((kind: ToastKind, text: string) => {
    window.clearTimeout(timer.current)
    setMsg({ kind, text, id: Date.now() })
    timer.current = window.setTimeout(() => setMsg(null), kind === 'err' ? 6000 : 3500)
  }, [])
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const toast = (
    <div className="toast-host" style={{ bottom: `calc(${bottom}px + env(safe-area-inset-bottom))` }} role="status" aria-live="polite">
      {msg && (
        <div key={msg.id} className={`toast ${msg.kind}`}>
          {msg.text}
        </div>
      )}
    </div>
  )
  return { toast, show }
}

/** Indicador de conexão fixo no canto: aparece e some sem empurrar o conteúdo. */
export function OfflinePill({ online, text = 'Sem conexão' }: { online: boolean; text?: string }) {
  return (
    <div className={`offline-pill ${online ? '' : 'on'}`} role="status" aria-live="polite">
      {online ? '' : text}
    </div>
  )
}

/** Placeholder de cartões enquanto a primeira resposta não chega (no lugar de "Carregando..."). */
export function Skeleton({ rows = 3, header = true }: { rows?: number; header?: boolean }) {
  return (
    <div aria-busy="true" aria-label="Carregando">
      {header && (
        <>
          <div className="skeleton line title" />
          <div className="skeleton line sub" />
        </>
      )}
      {Array.from({ length: rows }, (_, i) => (
        <div className="skeleton card-shape" key={i} />
      ))}
    </div>
  )
}
