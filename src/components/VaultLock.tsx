import { useState, useSyncExternalStore } from 'react'
import { subscribe, getState, unlock, type VaultState } from '../db/vault'
import { useLang } from '../i18n'

/** Live vault lock state for the UI (disabled / locked / unlocked). */
export function useVaultState(): VaultState {
  return useSyncExternalStore(subscribe, getState, getState)
}

/**
 * Full-screen lock overlay. Shown while the vault is enabled but locked: it
 * blocks the whole app and decrypts nothing until the right passphrase unlocks
 * the in-memory key. There is no bypass — a wrong passphrase fails the GCM
 * auth check and the screen stays up.
 */
export function LockScreen() {
  const { t } = useLang()
  const [pass, setPass] = useState('')
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!pass || busy) return
    setBusy(true)
    const ok = await unlock(pass)
    setBusy(false)
    if (ok) { setPass(''); setError(false) } else { setError(true) }
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
