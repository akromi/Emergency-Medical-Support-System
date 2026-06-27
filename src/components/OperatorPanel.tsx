import { useEffect, useState, useSyncExternalStore } from 'react'
import {
  subscribeOperators, getOperatorSnapshot, listOperators, addOperator, removeOperator,
  setActiveOperator, verifyPin, canManageOperators, type Operator, type Role,
} from '../db/operators'
import { useLang } from '../i18n'

/** Live operator state (active operator + whether the roster is empty). */
export function useOperators() {
  return useSyncExternalStore(subscribeOperators, getOperatorSnapshot, getOperatorSnapshot)
}

const ROLES: Role[] = ['field', 'lead', 'admin']

/** Manage the local operator roster and pick who's on duty (record attribution
 *  + RBAC-lite). Opening, switching, and adding operators all stay on-device. */
export function OperatorPanel({ onClose }: { onClose: () => void }) {
  const { t } = useLang()
  const { active } = useOperators()
  const [rows, setRows] = useState<Operator[]>([])
  const [name, setName] = useState('')
  const [role, setRole] = useState<Role>('field')
  const [pin, setPin] = useState('')
  const [msg, setMsg] = useState('')

  const reload = () => listOperators().then(setRows)
  useEffect(() => { reload() }, [])

  async function switchTo(op: Operator) {
    if (op.pinHash) {
      const pin = window.prompt(t('op.pinPrompt'))
      if (pin == null) return
      if (!(await verifyPin(op.id, pin))) { setMsg(t('op.pinWrong')); return }
    }
    await setActiveOperator(op.id)
    setMsg('')
  }

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    await addOperator(name, role, pin || undefined)
    setName(''); setPin(''); setRole('field')
    await reload()
  }

  async function remove(op: Operator) {
    if (!window.confirm(t('op.removeConfirm', { name: op.name }))) return
    await removeOperator(op.id)
    await reload()
  }

  const manage = canManageOperators()

  return (
    <div className="op-overlay" onClick={onClose}>
      <div className="op" onClick={(e) => e.stopPropagation()}>
        <header className="op-head">
          <h2>{t('op.title')}</h2>
          <div className="op-head-actions">
            {active && <button type="button" className="topbtn" onClick={() => setActiveOperator(null)}>{t('op.signOut')}</button>}
            <button type="button" className="topbtn" onClick={onClose}>{t('sm.close')}</button>
          </div>
        </header>

        {msg && <div className="op-msg">{msg}</div>}
        {rows.length === 0 && <div className="empty">{t('op.empty')}</div>}

        <ul className="op-list">
          {rows.map((op) => (
            <li key={op.id} className={op.id === active?.id ? 'op-row on' : 'op-row'}>
              <button type="button" className="op-pick" onClick={() => switchTo(op)} title={t('op.switch')}>
                <span className="op-name">{op.name}</span>
                <span className="op-role">{t(`op.role.${op.role}`)}{op.pinHash ? ' · 🔑' : ''}</span>
              </button>
              {op.id === active?.id && <span className="op-active">{t('op.onDuty')}</span>}
              {manage && <button type="button" className="x" aria-label={t('op.remove')} onClick={() => remove(op)}>×</button>}
            </li>
          ))}
        </ul>

        {manage && (
          <form className="op-add" onSubmit={add}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('op.namePh')} />
            <select value={role} onChange={(e) => setRole(e.target.value as Role)} aria-label={t('op.role')}>
              {ROLES.map((r) => <option key={r} value={r}>{t(`op.role.${r}`)}</option>)}
            </select>
            <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder={t('op.pinPh')} autoComplete="new-password" />
            <button type="submit" className="btn" disabled={!name.trim()}>{t('op.add')}</button>
          </form>
        )}
      </div>
    </div>
  )
}
