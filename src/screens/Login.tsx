import { useEffect, useState } from 'react'
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

type Options = { receptionists: { id: string; name: string }[]; needsPassword: Record<Role, boolean> }
const OPTIONS_KEY = 'login-options'
const FALLBACK: Options = { receptionists: [], needsPassword: { admin: true, reception: false, presenter: false } }

function cachedOptions(): Options | null {
  try {
    return JSON.parse(localStorage.getItem(OPTIONS_KEY) ?? 'null') as Options | null
  } catch {
    return null
  }
}

export function Login({ onLogin }: { onLogin: (role: Role) => void }) {
  const [choice, setChoice] = useState<Role | null>(null)
  const [options, setOptions] = useState<Options | null>(cachedOptions())
  const [name, setName] = useState(session.name)
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Lista de recepcionistas e quais acessos pedem senha (guardada no aparelho para não piscar nas próximas aberturas).
  useEffect(() => {
    let alive = true
    api<Options>('/api/login/options')
      .then((o) => {
        if (!alive) return
        setOptions(o)
        localStorage.setItem(OPTIONS_KEY, JSON.stringify(o))
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const opts = options ?? FALLBACK
  const chosen = CHOICES.find((c) => c.role === choice)

  function back() {
    setChoice(null)
    setPassword('')
    setError('')
  }

  async function enter() {
    if (!choice) return
    setBusy(true)
    setError('')
    try {
      const r = await api<{ token: string; role: Role }>('/api/login', {
        method: 'POST',
        body: { role: choice, password, name: choice === 'reception' ? name : undefined, remember, deviceId: getDeviceId() },
      })
      if (choice === 'reception') session.setName(name)
      session.set(r.token, r.role, remember)
      onLogin(r.role)
    } catch (e) {
      setError(e instanceof TypeError ? 'Sem conexão. Tente de novo.' : (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const wantsPassword = choice ? opts.needsPassword[choice] : false
  const missingName = choice === 'reception' && !opts.receptionists.some((r) => r.name === name)
  const canSubmit = !busy && !missingName && (!wantsPassword || password.length >= 4)

  return (
    <div className="login">
      <img src="/logo.png" alt="Logo da ADTC Guaraciaba do Norte" />
      <h1>Visitantes ADTC</h1>
      {!chosen ? (
        <>
          <p className="sub">Escolha o seu acesso</p>
          <div className="tiles">
            {CHOICES.map((c) => (
              <button key={c.role} type="button" className="tile" onClick={() => setChoice(c.role)}>
                {ICONS[c.role]}
                <span>{c.label}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="sub">{chosen.label}</p>
          <form
            className="card"
            onSubmit={(e) => {
              e.preventDefault()
              if (canSubmit) void enter()
            }}
          >
            {choice === 'reception' &&
              (opts.receptionists.length === 0 ? (
                <div className="banner">Nenhum recepcionista cadastrado ainda. Peça ao administrador para cadastrar o seu nome.</div>
              ) : (
                <>
                  <label htmlFor="nome">Seu nome</label>
                  <select id="nome" value={opts.receptionists.some((r) => r.name === name) ? name : ''} onChange={(e) => setName(e.target.value)}>
                    <option value="" disabled>
                      Escolha o seu nome
                    </option>
                    {opts.receptionists.map((r) => (
                      <option key={r.id} value={r.name}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </>
              ))}
            {wantsPassword && (
              <>
                <label htmlFor="senha">Senha</label>
                <input
                  id="senha"
                  className="pin"
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={8}
                  autoComplete="current-password"
                  autoFocus={choice !== 'reception'}
                  aria-describedby={error ? 'login-erro' : undefined}
                  value={password}
                  onChange={(e) => setPassword(e.target.value.replace(/\D/g, ''))}
                />
              </>
            )}
            <label className="remember">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              <span>Lembrar de mim neste aparelho</span>
            </label>
            <div id="login-erro" role="alert">
              {error && <div className="banner err" style={{ marginTop: 12 }}>{error}</div>}
            </div>
            <button className="btn" type="submit" disabled={!canSubmit} style={{ marginTop: 14 }}>
              Entrar
            </button>
            <button className="btn secondary" type="button" onClick={back}>
              Voltar
            </button>
          </form>
        </>
      )}
    </div>
  )
}
