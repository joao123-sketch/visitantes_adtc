import { useState } from 'react'
import { api, getDeviceId, session, type Role } from '../api'

export function Login({ onLogin }: { onLogin: (role: Role) => void }) {
  const [pin, setPin] = useState('')
  const [name, setName] = useState(session.name)
  const [needName, setNeedName] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function enter(withName: string) {
    setBusy(true)
    setError('')
    try {
      const r = await api<{ token: string; role: Role }>('/api/login', {
        method: 'POST',
        body: { pin, deviceId: getDeviceId(), name: withName || undefined },
      })
      if (r.role === 'reception' && !withName) {
        setNeedName(true)
        return
      }
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
      <p className="sub">Digite o código de acesso para entrar</p>
      {!needName ? (
        <form
          className="card"
          onSubmit={(e) => {
            e.preventDefault()
            if (pin.length >= 3) void enter(name)
          }}
        >
          <label htmlFor="pin">Código de acesso</label>
          <input
            id="pin"
            className="pin"
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={8}
            autoComplete="off"
            aria-describedby={error ? 'login-erro' : undefined}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          />
          <div id="login-erro" role="alert">
            {error && <div className="banner err" style={{ marginTop: 12 }}>{error}</div>}
          </div>
          <button className="btn" type="submit" disabled={busy || pin.length < 3} style={{ marginTop: 14 }}>
            Entrar
          </button>
        </form>
      ) : (
        <form
          className="card"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) void enter(name.trim())
          }}
        >
          <label htmlFor="nome">Qual é o seu primeiro nome?</label>
          <input id="nome" value={name} onChange={(e) => setName(e.target.value)} autoFocus autoComplete="given-name" />
          <div role="alert">{error && <div className="banner err" style={{ marginTop: 12 }}>{error}</div>}</div>
          <button className="btn" type="submit" disabled={busy || !name.trim()} style={{ marginTop: 14 }}>
            Continuar
          </button>
        </form>
      )}
    </div>
  )
}
