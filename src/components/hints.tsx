import { useEffect, useState, type ReactNode } from 'react'
import { useLang } from '../i18n'

// Lightweight discoverability helpers: one-time dismissible tips (remembered in
// localStorage so returning users aren't nagged) and a connectivity banner.

const KEY = (id: string) => `tl.tip.${id}`

export function useDismissed(id: string): [boolean, () => void] {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(KEY(id)) === '1' } catch { return false }
  })
  const dismiss = () => {
    try { localStorage.setItem(KEY(id), '1') } catch { /* private mode — just hide for the session */ }
    setDismissed(true)
  }
  return [dismissed, dismiss]
}

/** One-time dismissible tip. Shows until the user dismisses it (then never again). */
export function Tip({ id, children }: { id: string; children: ReactNode }) {
  const { t } = useLang()
  const [dismissed, dismiss] = useDismissed(id)
  if (dismissed) return null
  return (
    <div className="tip" role="note">
      <span className="tip-ico" aria-hidden>💡</span>
      <div className="tip-body">{children}</div>
      <button type="button" className="tip-x" aria-label={t('tip.dismiss')} onClick={dismiss}>×</button>
    </div>
  )
}

interface InstallEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** "Add to Home Screen" prompt (Chrome/Android, when installable & not installed). */
export function InstallPrompt() {
  const { t } = useLang()
  const [evt, setEvt] = useState<InstallEvent | null>(null)
  const [dismissed, dismiss] = useDismissed('install')
  useEffect(() => {
    const handler = (e: Event) => { e.preventDefault(); setEvt(e as InstallEvent) }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])
  if (!evt || dismissed) return null
  const install = async () => { await evt.prompt(); dismiss(); setEvt(null) }
  return (
    <div className="install-bar">
      <span>{t('install.msg')}</span>
      <span className="install-actions">
        <button type="button" className="btn" onClick={install}>{t('install.btn')}</button>
        <button type="button" className="tip-x" aria-label={t('dismiss')} onClick={dismiss}>×</button>
      </span>
    </div>
  )
}

/** Banner shown only while the device is offline (reassurance, not an error). */
export function OfflineBanner() {
  const { t } = useLang()
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine)
  useEffect(() => {
    const on = () => setOffline(false)
    const off = () => setOffline(true)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  if (!offline) return null
  return <div className="offline-banner">{t('offline.msg')}</div>
}
