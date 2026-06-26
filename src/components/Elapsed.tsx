import { elapsedSince, formatElapsed } from '@triage-link/core'
import { useLang } from '../i18n'
import { useNow } from '../useNow'

// Live "time since injury" clock — renders e.g. "T+1h 24m" from the recorded
// injury time, ticking every 30s. Renders nothing when no (valid, past) injury
// time is set, so call sites can drop it in unconditionally. Pass `label` to
// prepend the localised "Since injury" caption.
export function Elapsed({ injuryTime, className, label = false }: {
  injuryTime: string
  className?: string
  label?: boolean
}) {
  const { t } = useLang()
  const now = useNow(30_000)
  const ms = elapsedSince(injuryTime, now)
  if (ms == null) return null
  const value = formatElapsed(ms, { d: t('elapsed.d'), h: t('elapsed.h'), m: t('elapsed.m') })
  return (
    <span className={className} title={t('elapsed.title')}>
      {label && <span className="el-k">{t('elapsed.label')} </span>}
      ⏱ {t('elapsed.prefix')}{value}
    </span>
  )
}
