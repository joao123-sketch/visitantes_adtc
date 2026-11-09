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

/** Botões de atalho: um toque preenche o campo (toque de novo para limpar). Com `onOther`, o último botão "Outro" abre o campo de texto. */
export function Chips({
  options,
  value,
  onPick,
  label,
  otherOn = false,
  onOther,
}: {
  options: string[]
  value: string
  onPick: (v: string) => void
  label: string
  otherOn?: boolean
  onOther?: () => void
}) {
  if (options.length === 0 && !onOther) return null
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((o) => {
        const on = !otherOn && value.trim().toLowerCase() === o.toLowerCase()
        return (
          <button key={o} type="button" className={`chip${on ? ' on' : ''}`} aria-pressed={on} onClick={() => onPick(on ? '' : o)}>
            {o}
          </button>
        )
      })}
      {onOther && (
        <button type="button" className={`chip${otherOn ? ' on' : ''}`} aria-pressed={otherOn} aria-expanded={otherOn} onClick={onOther}>
          Outro
        </button>
      )}
    </div>
  )
}

/** Campo de texto livre só aparece depois de "Outro" (ou quando já há um valor fora dos atalhos, como ao editar). */
export const showsOther = (flag: boolean, value: string, options: string[]) =>
  flag || (value.trim() !== '' && !options.some((o) => o.toLowerCase() === value.trim().toLowerCase()))
