import { useState, useSyncExternalStore } from 'react'
import { subscribe, getState, unlock, enableVault, type VaultState } from '../db/vault'
import { useLang } from '../i18n'

/** Live vault state for the UI (disabled / setup / locked / unlocked). */
export function useVaultState(): VaultState {
  return useSyncExternalStore(subscribe, getState, getState)
}

/**
 * Full-screen vault gate. Two modes:
 *  - 'locked'  → enter the passphrase to unlock the in-memory key. No bypass:
 *    a wrong passphrase fails the GCM auth check and the screen stays up.
 *  - 'setup'   → encryption is REQUIRED by policy but no passphrase is set yet;
 *    the user must create one (with confirmation) before the app can store data.
 */
export function LockScreen() {
  const state = useVaultState()
  return state === 'setup' ? <SetupScreen /> : <UnlockScreen />
}

function UnlockScreen() {
  const { t } = useLang()
  const [pass, setPass] = useState('')
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!pass || busy) return
    setBusy(true)
    const ok = await unlock(pass)
    // On success the vault flips to 'unlocked' and this screen unmounts — don't
    // set state afterwards. Only the failure path stays mounted.
    if (!ok) { setError(true); setBusy(false) }
  }

  return (
    <div className="vault-lock" role="dialog" aria-modal="true" aria-label={t('vault.lockTitle')}>
      <form className="vault-lock-card" onSubmit={submit}>
        <div className="vault-lock-mark">🔒</div>
        <h2>{t('vault.lockTitle')}</h2>
        <p>{t('vault.lockSub')}</p>
        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          placeholder={t('vault.passPh')}
          value={pass}
          onChange={(e) => { setPass(e.target.value); setError(false) }}
          aria-invalid={error}
        />
        {error && <div className="vault-lock-err">{t('vault.wrong')}</div>}
        <button type="submit" className="btn primary" disabled={!pass || busy}>{t('vault.unlock')}</button>
      </form>
    </div>
  )
}

function SetupScreen() {
  const { t } = useLang()
  const [pass, setPass] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    if (pass.length < 8) { setError(t('backup.passShort')); return }
    if (pass !== confirm) { setError(t('vault.passMismatch')); return }
    setBusy(true)
    try {
      await enableVault(pass) // derives the key, encrypts existing data, unlocks
      // success → vault becomes 'unlocked' and this screen unmounts; don't set state.
    } catch {
      setError(t('vault.setupFailed'))
      setBusy(false)
    }
  }

  return (
    <div className="vault-lock" role="dialog" aria-modal="true" aria-label={t('vault.setupTitle')}>
      <form className="vault-lock-card" onSubmit={submit}>
        <div className="vault-lock-mark">🔐</div>
        <h2>{t('vault.setupTitle')}</h2>
        <p>{t('vault.setupSub')}</p>
        <input
          type="password"
          autoFocus
          autoComplete="new-password"
          placeholder={t('vault.passPh')}
          value={pass}
          onChange={(e) => { setPass(e.target.value); setError('') }}
          aria-invalid={!!error}
        />
        <input
          type="password"
          autoComplete="new-password"
          placeholder={t('vault.passConfirm')}
          value={confirm}
          onChange={(e) => { setConfirm(e.target.value); setError('') }}
          aria-invalid={!!error}
        />
        {error && <div className="vault-lock-err">{error}</div>}
        <button type="submit" className="btn primary" disabled={!pass || !confirm || busy}>{t('vault.setBtn')}</button>
      </form>
    </div>
  )
}
