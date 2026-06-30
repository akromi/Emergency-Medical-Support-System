import { useEffect, useState, useSyncExternalStore } from 'react'
import {
  subscribeOperators, getOperatorSnapshot, listOperators, addOperator, removeOperator,
  setActiveOperator, setOperatorPin, verifyPin, canManageOperators, type Operator, type Role,
} from '../db/operators'
import { requireManageStepUp } from '../db/stepup'
import { askSecret } from '../db/secret-prompt'
import { ensureRecoveryCode, generateRecoveryCode, recoverWithCode, localResetCredentials } from '../db/recovery'
import { useLang } from '../i18n'

// The exact word a user must type to confirm the last-resort local reset. Kept
// as a fixed token (not translated) so the confirmation is unambiguous.
const RESET_PHRASE = 'RESET'

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
  // Recovery ladder state.
  const [view, setView] = useState<'roster' | 'recover'>('roster')
  const [newCode, setNewCode] = useState<string | null>(null) // freshly issued code, shown once
  const [copied, setCopied] = useState(false)
  const [recCode, setRecCode] = useState('')   // code being entered to recover
  const [phrase, setPhrase] = useState('')      // RESET confirmation for local reset

  const reload = () => listOperators().then(setRows)
  useEffect(() => { reload() }, [])

  // When an admin gains a PIN and no recovery code exists yet, mint one and show
  // it once so it can be recorded (e.g. with support) before it's gone.
  async function maybeIssueRecovery(opRole: Role, pinSet: boolean) {
    if (opRole !== 'admin' || !pinSet) return
    const code = await ensureRecoveryCode()
    if (code) setNewCode(code)
  }

  async function switchTo(op: Operator) {
    if (op.pinHash) {
      const pin = await askSecret(t('op.pinPrompt'))
      if (pin == null) return
      if (!(await verifyPin(op.id, pin))) { setMsg(t('op.pinWrong')); return }
    }
    await setActiveOperator(op.id)
    setMsg('')
  }

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    if (!(await requireManageStepUp(t))) { setMsg(t('auth.denied')); return }
    await addOperator(name, role, pin || undefined)
    await maybeIssueRecovery(role, !!pin)
    setName(''); setPin(''); setRole('field')
    await reload()
  }

  async function remove(op: Operator) {
    if (!window.confirm(t('op.removeConfirm', { name: op.name }))) return
    if (!(await requireManageStepUp(t))) { setMsg(t('auth.denied')); return }
    await removeOperator(op.id)
    await reload()
  }

  // Set or change an operator's PIN — the "login password" that gates sensitive
  // actions. Re-auth first (no-op until someone has a PIN), then prompt for the
  // new PIN; an empty value clears it.
  async function changePin(op: Operator) {
    if (!(await requireManageStepUp(t))) { setMsg(t('auth.denied')); return }
    const next = await askSecret(t('op.newPinPrompt', { name: op.name }))
    if (next == null) return
    await setOperatorPin(op.id, next.trim())
    await maybeIssueRecovery(op.role, !!next.trim())
    setMsg(t('op.pinUpdated'))
    await reload()
  }

  // Issue a brand-new recovery code on demand (invalidates the previous one).
  async function regenerateCode() {
    if (!(await requireManageStepUp(t))) { setMsg(t('auth.denied')); return }
    setNewCode(await generateRecoveryCode())
  }

  // Tier 2: clear admin PINs with the recovery code.
  async function submitRecovery() {
    const ok = await recoverWithCode(recCode)
    if (ok) { setRecCode(''); setView('roster'); setMsg(t('rec.codeOk')); await reload() }
    else setMsg(t('rec.codeBad'))
  }

  // Tier 3: clear every sign-in/PIN on this device (records are kept).
  async function localReset() {
    if (phrase !== RESET_PHRASE) return
    await localResetCredentials()
    setPhrase(''); setView('roster'); setMsg(t('rec.localDone')); await reload()
  }

  async function copyCode() {
    if (!newCode) return
    try { await navigator.clipboard.writeText(newCode); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* ignore */ }
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

        {newCode && (
          <div className="op-reccode" role="alert">
            <strong>{t('rec.newCodeTitle')}</strong>
            <div className="op-reccode-row">
              <code>{newCode}</code>
              <button type="button" onClick={copyCode}>{copied ? t('rec.copied') : t('rec.copy')}</button>
            </div>
            <p>{t('rec.newCodeHint')}</p>
            <button type="button" className="btn" onClick={() => setNewCode(null)}>{t('rec.saved')}</button>
          </div>
        )}

        {view === 'recover' ? (
          <div className="op-recover">
            <h3>{t('op.recoverTitle')}</h3>
            <p className="op-hint">{t('rec.peerHint')}</p>

            <label className="op-reclabel" htmlFor="rec-code">{t('rec.codeLabel')}</label>
            <div className="op-recrow">
              <input id="rec-code" value={recCode} onChange={(e) => setRecCode(e.target.value)}
                placeholder={t('rec.codePh')} autoComplete="off" spellCheck={false} />
              <button type="button" className="btn" disabled={!recCode.trim()} onClick={submitRecovery}>{t('rec.codeBtn')}</button>
            </div>

            <div className="op-danger">
              <strong>{t('rec.localTitle')}</strong>
              <p>{t('rec.localHint', { phrase: RESET_PHRASE })}</p>
              <div className="op-recrow">
                <input value={phrase} onChange={(e) => setPhrase(e.target.value)} placeholder={RESET_PHRASE} aria-label={t('rec.localTitle')} />
                <button type="button" className="op-dangerbtn" disabled={phrase !== RESET_PHRASE} onClick={localReset}>{t('rec.localBtn')}</button>
              </div>
            </div>

            <button type="button" className="topbtn" onClick={() => { setView('roster'); setRecCode(''); setPhrase('') }}>{t('rec.back')}</button>
          </div>
        ) : (<>
          {rows.length === 0 && <div className="empty">{t('op.empty')}</div>}

          <ul className="op-list">
            {rows.map((op) => (
              <li key={op.id} className={op.id === active?.id ? 'op-row on' : 'op-row'}>
                <button type="button" className="op-pick" onClick={() => switchTo(op)} title={t('op.switch')}>
                  <span className="op-name">{op.name}</span>
                  <span className="op-role">{t(`op.role.${op.role}`)}{op.pinHash ? ' · 🔑' : ''}</span>
                </button>
                {op.id === active?.id && <span className="op-active">{t('op.onDuty')}</span>}
                {manage && <button type="button" className="op-pin" onClick={() => changePin(op)} title={t('op.pinTitle')}>{op.pinHash ? t('op.changePin') : t('op.setPin')}</button>}
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

          <p className="op-hint">{t('op.protectHint')}</p>
          <div className="op-recbar">
            {manage && <button type="button" className="op-link" onClick={() => { setView('recover'); setMsg('') }}>{t('op.recover')}</button>}
            {active?.role === 'admin' && <button type="button" className="op-link" onClick={regenerateCode}>{t('rec.regen')}</button>}
          </div>
        </>)}
      </div>
    </div>
  )
}
