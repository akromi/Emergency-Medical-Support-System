import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { subscribeSecret, getSecretRequest } from '../db/secret-prompt'
import { useLang } from '../i18n'

// Masked input host for askSecret(). Renders nothing until a secret is
// requested; then it shows a password field (hidden by default, with a
// Show/Hide toggle) so a PIN is never displayed in clear text while it is
// typed — matching how the PIN is hidden when it is first set.
export function SecretPrompt() {
  const req = useSyncExternalStore(subscribeSecret, getSecretRequest, getSecretRequest)
  const { t } = useLang()
  const [val, setVal] = useState('')
  const [show, setShow] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Clear (never leave a secret in state) and focus whenever a request opens.
  useEffect(() => { setVal(''); setShow(false); if (req) inputRef.current?.focus() }, [req])

  if (!req) return null
  const submit = () => req.resolve(val)
  const cancel = () => req.resolve(null)

  return (
    <div className="secret-overlay" role="dialog" aria-modal="true" onClick={cancel}>
      <form className="secret-box" onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); submit() }}>
        <label className="secret-msg" htmlFor="secret-input">{req.message}</label>
        <div className="secret-row">
          <input id="secret-input" ref={inputRef} type={show ? 'text' : 'password'}
            value={val} onChange={(e) => setVal(e.target.value)}
            autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
            onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); cancel() } }} />
          <button type="button" className="secret-eye" onClick={() => setShow((s) => !s)} aria-pressed={show}>
            {show ? t('secret.hide') : t('secret.show')}
          </button>
        </div>
        <div className="secret-actions">
          <button type="button" onClick={cancel}>{t('secret.cancel')}</button>
          <button type="submit" className="primary">{t('secret.ok')}</button>
        </div>
      </form>
    </div>
  )
}
