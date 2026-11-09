import { useCallback, useEffect, useState } from 'react'
import { api, session, type Role } from '../api'
import { Skeleton, useToast } from '../ui'

type Receptionist = { id: string; name: string }
type Access = { admin: 'default' | 'custom'; reception: 'none' | 'custom'; presenter: 'none' | 'custom' }

const LABEL: Record<Role, string> = { admin: 'Administrador', reception: 'Recepção', presenter: 'Apresentação' }
const STATUS: Record<string, string> = {
  default: 'senha padrão (1111)',
  none: 'sem senha',
  custom: 'senha definida',
}

export function Receptionists() {
  const [list, setList] = useState<Receptionist[]>([])
  const [access, setAccess] = useState<Access | null>(null)
  const [name, setName] = useState('')
  const [passwords, setPasswords] = useState<Record<Role, string>>({ admin: '', reception: '', presenter: '' })
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const { toast, show } = useToast()

  const load = useCallback(async () => {
    try {
      const [r, a] = await Promise.all([api<{ receptionists: Receptionist[] }>('/api/receptionists'), api<Access>('/api/access')])
      setList(r.receptionists)
      setAccess(a)
    } catch (e) {
      show('err', e instanceof TypeError ? 'Sem conexão.' : (e as Error).message)
    } finally {
      setLoaded(true)
    }
  }, [show])
  useEffect(() => void load(), [load])

  async function run(fn: () => Promise<unknown>, okText: string) {
    try {
      await fn()
      show('ok', okText)
      await load()
    } catch (e) {
      show('err', e instanceof TypeError ? 'Sem conexão.' : (e as Error).message)
    }
  }

  if (!loaded) return <Skeleton rows={2} header={false} />

  return (
    <>
      <div className="card">
        <div className="card-title">Recepcionistas</div>
        <p className="sub">Quem está na lista escolhe o próprio nome ao entrar na Recepção.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!name.trim()) return
            void run(async () => {
              await api('/api/receptionists', { method: 'POST', body: { name } })
              setName('')
            }, 'Recepcionista cadastrado.')
          }}
        >
          <label htmlFor="rec-nome">Nome do recepcionista</label>
          <input id="rec-nome" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" maxLength={60} />
          <button className="btn open-btn" type="submit" disabled={!name.trim()}>
            Cadastrar
          </button>
        </form>
      </div>

      <div className="card">
        <div className="card-title">Cadastrados ({list.length})</div>
        {list.length === 0 && <p className="sub">Ninguém cadastrado ainda.</p>}
        {list.map((r) => (
          <div key={r.id} className="past-item">
            <div className="past-name">{r.name}</div>
            {confirmId === r.id ? (
              <div role="alertdialog" aria-label={`Confirmar exclusão de ${r.name}`}>
                <div className="banner err" style={{ marginTop: 8 }}>Tirar {r.name} da lista?</div>
                <div className="past-actions">
                  <button
                    className="btn small"
                    onClick={async () => {
                      setConfirmId(null)
                      await run(() => api(`/api/receptionists/${r.id}`, { method: 'DELETE' }), 'Recepcionista removido.')
                    }}
                  >
                    Sim, tirar
                  </button>
                  <button className="btn secondary small" onClick={() => setConfirmId(null)}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="past-actions">
                <button className="btn secondary small" aria-label={`Excluir ${r.name}`} onClick={() => setConfirmId(r.id)}>
                  Excluir
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-title">Senhas de acesso</div>
        <p className="sub">De 4 a 8 números. Trocar a senha de um acesso faz as pessoas dele entrarem de novo.</p>
        {(Object.keys(LABEL) as Role[]).map((role) => (
          <div key={role}>
            <label htmlFor={`senha-${role}`}>
              {LABEL[role]} <span className="status">{access ? STATUS[access[role]] : ''}</span>
            </label>
            <div className="row">
              <input
                id={`senha-${role}`}
                inputMode="numeric"
                maxLength={8}
                autoComplete="off"
                value={passwords[role]}
                onChange={(e) => setPasswords({ ...passwords, [role]: e.target.value.replace(/\D/g, '') })}
              />
              <button
                className="btn small"
                disabled={passwords[role].length < 4}
                onClick={() =>
                  run(async () => {
                    const r = await api<{ ok: true; token?: string }>(`/api/passwords/${role}`, { method: 'PUT', body: { password: passwords[role] } })
                    if (r.token) session.replaceToken(r.token) // quem trocou a própria senha continua logado
                    setPasswords({ ...passwords, [role]: '' })
                  }, `Senha de ${LABEL[role]} alterada.`)
                }
              >
                Trocar
              </button>
            </div>
          </div>
        ))}
      </div>
      {toast}
    </>
  )
}
