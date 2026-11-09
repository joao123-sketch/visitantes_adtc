import { useEffect, useState } from 'react'
import { session, setUnauthorizedHandler, type Role } from './api'
import { keepAwake } from './wakeLock'
import { Login } from './screens/Login'
import { Reception } from './screens/Reception'
import { Presenter } from './screens/Presenter'
import { Admin } from './screens/Admin'

export function App() {
  const [role, setRole] = useState<Role | null>(session.token ? session.role : null)

  useEffect(() => {
    setUnauthorizedHandler(() => setRole(null))
  }, [])

  // tela sempre acesa enquanto o app está aberto e com sessão
  useEffect(() => (role ? keepAwake() : undefined), [role])

  return (
    <>
      <header className="topbar">
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
