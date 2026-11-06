import { useEffect, useState } from 'react'
import { session, setUnauthorizedHandler, type Role } from './api'
import { getTheme, setTheme, type Theme } from './theme'
import { keepAwake } from './wakeLock'
import { Login } from './screens/Login'
import { Reception } from './screens/Reception'
import { Presenter } from './screens/Presenter'
import { Admin } from './screens/Admin'

const NEXT: Record<Theme, Theme> = { auto: 'light', light: 'dark', dark: 'auto' }
const LABEL: Record<Theme, string> = {
  auto: 'Tema automático (segue o aparelho). Toque para usar o tema claro',
  light: 'Tema claro. Toque para usar o tema escuro',
  dark: 'Tema escuro. Toque para voltar ao automático',
}

function ThemeIcon({ theme }: { theme: Theme }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const
  if (theme === 'light')
    return (
      <svg viewBox="0 0 24 24" {...p}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    )
  if (theme === 'dark')
    return (
      <svg viewBox="0 0 24 24" {...p}>
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    )
  return (
    <svg viewBox="0 0 24 24" {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v18" />
      <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" />
    </svg>
  )
}

export function App() {
  const [role, setRole] = useState<Role | null>(session.token ? session.role : null)
  const [theme, setThemeState] = useState<Theme>(getTheme())

  useEffect(() => {
    setUnauthorizedHandler(() => setRole(null))
  }, [])

  // tela sempre acesa enquanto o app está aberto e com sessão
  useEffect(() => (role ? keepAwake() : undefined), [role])

  const cycleTheme = () => {
    const next = NEXT[theme]
    setTheme(next)
    setThemeState(next)
  }

  return (
    <>
      <header className="topbar">
        <button className="icon-btn" onClick={cycleTheme} aria-label={LABEL[theme]} title={LABEL[theme]}>
          <ThemeIcon theme={theme} />
        </button>
        {role && (
          <button
            className="icon-btn"
            aria-label="Sair"
            title="Sair"
            onClick={() => {
              session.clear()
              setRole(null)
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
          </button>
        )}
      </header>
      <main className={role === 'reception' ? 'has-bar' : ''}>
        {!role && <Login onLogin={setRole} />}
        {role === 'reception' && <Reception />}
        {role === 'presenter' && <Presenter />}
        {role === 'admin' && <Admin />}
      </main>
    </>
  )
}
