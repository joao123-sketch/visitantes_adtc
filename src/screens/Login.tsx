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
      <img src="/logo.jpg" alt="ADTC Guaraciaba do Norte" />
      <h1>Visitantes ADTC</h1>
      {!needName ? (
        <div className="card" style={{ textAlign: 'left' }}>
          <label htmlFor="pin">Digite o código de acesso</label>
          <input
            id="pin"
            className="pin"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            autoComplete="off"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          />
          {error && <div className="banner err" style={{ marginTop: 10 }}>{error}</div>}
          <button className="btn blue" disabled={busy || pin.length !== 6} onClick={() => enter(name)}>
            Entrar
          </button>
        </div>
      ) : (
        <div className="card" style={{ textAlign: 'left' }}>
          <label htmlFor="nome">Qual é o seu primeiro nome?</label>
          <input id="nome" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          {error && <div className="banner err" style={{ marginTop: 10 }}>{error}</div>}
          <button className="btn" disabled={busy || !name.trim()} onClick={() => enter(name.trim())}>
            Continuar
          </button>
        </div>
      )}
    </div>
  )
}
