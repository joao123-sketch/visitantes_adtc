import { useState } from 'react'
import { api, getDeviceId, session, type Role } from '../api'

const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const
const ICONS: Record<Role, React.ReactElement> = {
  admin: (
    <svg viewBox="0 0 24 24" {...p}>
      <path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  ),
  reception: (
    <svg viewBox="0 0 24 24" {...p}>
      <path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20" />
      <circle cx="10" cy="8" r="3.5" />
      <path d="M19 8v6M16 11h6" />
    </svg>
  ),
  presenter: (
    <svg viewBox="0 0 24 24" {...p}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8" />
    </svg>
  ),
}
const CHOICES: { role: Role; label: string }[] = [
  { role: 'admin', label: 'Administrador' },
  { role: 'reception', label: 'Recepção' },
  { role: 'presenter', label: 'Apresentação' },
]

export function Login({ onLogin }: { onLogin: (role: Role) => void }) {
  const [name, setName] = useState(session.name)
  const [askName, setAskName] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function enter(role: Role, withName?: string) {
    setBusy(true)
    setError('')
    try {
      const r = await api<{ token: string; role: Role }>('/api/login', {
        method: 'POST',
        body: { role, deviceId: getDeviceId(), name: withName || undefined },
      })
      if (withName) session.setName(withName)
      session.set(r.token, r.role)
      onLogin(r.role)
    } catch (e) {
      setError(e instanceof TypeError ? 'Sem conexão. Tente de novo.' : (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login">
      <img src="/logo.png" alt="Logo da ADTC Guaraciaba do Norte" />
      <h1>Visitantes ADTC</h1>
      {!askName ? (
        <>
          <p className="sub">Escolha o seu acesso</p>
          <div className="tiles">
            {CHOICES.map((c) => (
              <button
                key={c.role}
                type="button"
                className="tile"
                disabled={busy}
                onClick={() => (c.role === 'reception' ? setAskName(true) : void enter(c.role))}
              >
                {ICONS[c.role]}
                <span>{c.label}</span>
              </button>
            ))}
          </div>
          <div role="alert">{error && <div className="banner err" style={{ marginTop: 12 }}>{error}</div>}</div>
        </>
      ) : (
        <form
          className="card"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) void enter('reception', name.trim())
          }}
        >
          <label htmlFor="nome">Qual é o seu primeiro nome?</label>
          <input id="nome" value={name} onChange={(e) => setName(e.target.value)} autoFocus autoComplete="given-name" />
          <div role="alert">{error && <div className="banner err" style={{ marginTop: 12 }}>{error}</div>}</div>
          <button className="btn" type="submit" disabled={busy || !name.trim()} style={{ marginTop: 14 }}>
            Continuar
          </button>
          <button className="btn secondary" type="button" onClick={() => setAskName(false)}>
            Voltar
          </button>
        </form>
      )}
    </div>
  )
}
