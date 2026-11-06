import { useEffect, useState } from 'react'
import { session, setUnauthorizedHandler, type Role } from './api'
import { getTheme, setTheme, type Theme } from './theme'
import { keepAwake } from './wakeLock'
import { Login } from './screens/Login'
import { Reception } from './screens/Reception'
import { Presenter } from './screens/Presenter'
import { Admin } from './screens/Admin'

const NEXT: Record<Theme, Theme> = { auto: 'light', light: 'dark', dark: 'auto' }
const LABEL: Record<Theme, string> = { auto: 'Tema: automático', light: 'Tema: claro', dark: 'Tema: escuro' }
const TITLE: Record<Role, string> = { admin: 'Administração', reception: 'Recepção', presenter: 'Apresentador' }

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
      <div className="topbar">
        <img src="/logo.jpg" alt="ADTC" />
        <div className="title">
          Visitantes ADTC
          {role && <small>{TITLE[role]}</small>}
        </div>
        <button className="chip" onClick={cycleTheme}>
          {LABEL[theme]}
        </button>
        {role && (
          <button
            className="chip"
            onClick={() => {
              session.clear()
              setRole(null)
            }}
          >
            Sair
          </button>
        )}
      </div>
      <main>
        {!role && <Login onLogin={setRole} />}
        {role === 'reception' && <Reception />}
        {role === 'presenter' && <Presenter />}
        {role === 'admin' && <Admin />}
      </main>
    </>
  )
}
