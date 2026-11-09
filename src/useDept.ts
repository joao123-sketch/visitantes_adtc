import { useEffect } from 'react'

/** Aplica o estilo do departamento na página inteira (vazio = Geral, o estilo padrão vermelho e branco). */
export function useDept(key: string) {
  useEffect(() => {
    const root = document.documentElement
    if (key) root.setAttribute('data-dept', key)
    else root.removeAttribute('data-dept')
    return () => {
      root.removeAttribute('data-dept')
    }
  }, [key])
}
