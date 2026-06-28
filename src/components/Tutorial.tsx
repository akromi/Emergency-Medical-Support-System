import { useEffect, useState } from 'react'
import { useLang } from '../i18n'

// Smart guided tour with voice-over. Each step highlights a real UI element
// (located by [data-tour="..."]), narrates via the browser SpeechSynthesis API
// (offline, no deps), and — for action steps — auto-advances when the user
// actually performs it (see `advanceWhen` + the live `signals`). Step titles and
// narration are looked up by `key` from the i18n dictionary, so the whole tour
// follows the chosen language.

export interface TourSignals { hasInjury: boolean; hasTriage: boolean }

interface Step {
  target?: string
  key: string
  advanceWhen?: (s: TourSignals) => boolean
}

const STEPS: Step[] = [
  { key: 'welcome' },
  { target: 'patient', key: 'patient' },
  { target: 'palette', key: 'palette' },
  { target: 'charts', key: 'charts', advanceWhen: (s) => s.hasInjury },
  { target: 'editor', key: 'editor' },
  { target: 'triage', key: 'triage', advanceWhen: (s) => s.hasTriage },
  { target: 'vitals', key: 'vitals' },
  { target: 'response', key: 'response' },
  { target: 'handover', key: 'handover' },
  { target: 'summary', key: 'summary' },
  { target: 'board', key: 'board' },
  { key: 'done' },
]

// SpeechSynthesis BCP-47 tag per app language (for voice + prosody selection).
// MUST cover every app language — otherwise the voice-over falls back to an
// English engine and mispronounces the (e.g. Arabic / Persian) narration.
// A test asserts this map stays in sync with the language list.
export const SPEECH_LANG: Record<string, string> = {
  en: 'en-US', fr: 'fr-FR', ar: 'ar-SA', fa: 'fa-IR',
}

function locate(target?: string): DOMRect | null {
  if (!target) return null
  const el = document.querySelector(`[data-tour="${target}"]`)
  return el ? el.getBoundingClientRect() : null
}

export function Tutorial({ signals, onClose }: { signals: TourSignals; onClose: () => void }) {
  const { t, lang } = useLang()
  const [i, setI] = useState(0)
  const [muted, setMuted] = useState(() => { try { return localStorage.getItem('tl.tour.muted') === '1' } catch { return false } })
  const [rect, setRect] = useState<DOMRect | null>(null)
  const step = STEPS[i]
  const last = i === STEPS.length - 1
  const sayText = t(`tour.${step.key}.say`)

  const speak = (text: string) => {
    if (muted || !('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.rate = 1.02
    // Built-ins map to a full BCP-47 tag; a runtime language pack uses its own
    // code as the speech tag (e.g. 'sw', 'uk-UA'), falling back to en-US.
    const bcp = SPEECH_LANG[lang] ?? lang ?? 'en-US'
    u.lang = bcp
    // Prefer a platform voice in the same language as the utterance (match on the
    // primary subtag, e.g. "ar" → ar-SA / ar-EG), so prosody matches the script.
    const base = bcp.split('-')[0].toLowerCase()
    const voice = window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith(base))
    if (voice) u.voice = voice
    window.speechSynthesis.speak(u)
  }

  // On step change (or language switch): scroll target into view, position the
  // spotlight, narrate in the current language.
  useEffect(() => {
    const el = step.target ? document.querySelector(`[data-tour="${step.target}"]`) : null
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    setRect(locate(step.target))
    const timer = window.setTimeout(() => setRect(locate(step.target)), 380) // after scroll settles
    speak(sayText)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, muted, lang])

  // Keep the spotlight glued to the target while scrolling/resizing.
  useEffect(() => {
    const update = () => setRect(locate(step.target))
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => { window.removeEventListener('scroll', update, true); window.removeEventListener('resize', update) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i])

  // Smart: auto-advance once the user has done the step's action.
  useEffect(() => {
    if (step.advanceWhen && step.advanceWhen(signals)) {
      const t = window.setTimeout(() => setI((n) => Math.min(STEPS.length - 1, n + 1)), 700)
      return () => window.clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signals, i])

  const close = () => { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); onClose() }
  const next = () => (last ? close() : setI(i + 1))
  const back = () => setI(Math.max(0, i - 1))
  const toggleMute = () => {
    const m = !muted
    setMuted(m)
    try { localStorage.setItem('tl.tour.muted', m ? '1' : '0') } catch { /* ignore */ }
    if (m && 'speechSynthesis' in window) window.speechSynthesis.cancel()
    else speak(sayText)
  }

  // Position the tip card: below the target if there's room, else above; centred when no target.
  const card: React.CSSProperties = (() => {
    if (!rect) return { top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }
    const below = rect.bottom + 320 < window.innerHeight
    const top = below ? rect.bottom + 12 : Math.max(12, rect.top - 12)
    const transform = below ? 'none' : 'translateY(-100%)'
    const left = Math.min(Math.max(12, rect.left), window.innerWidth - 332)
    return { top, left, transform }
  })()

  return (
    <div className="tour">
      {rect ? (
        <div className="tour-spot" style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }} />
      ) : (
        <div className="tour-dim" />
      )}
      <div className="tour-card" style={card}>
        <div className="tour-head">
          <span className="tour-step">{i + 1} / {STEPS.length}</span>
          <span className="tour-title">{t(`tour.${step.key}.title`)}</span>
          <button type="button" className="tour-mute" onClick={toggleMute} title={muted ? t('tour.unmute') : t('tour.mute')} aria-label={t('tour.toggle')}>{muted ? '🔇' : '🔊'}</button>
        </div>
        <p className="tour-say">{sayText}</p>
        <div className="tour-ctrls">
          <button type="button" className="tour-skip" onClick={close}>{t('tour.skip')}</button>
          <span className="tour-nav">
            {i > 0 && <button type="button" className="btn" onClick={back}>{t('tour.back')}</button>}
            <button type="button" className="btn primary" onClick={next}>{last ? t('tour.done') : t('tour.next')}</button>
          </span>
        </div>
      </div>
    </div>
  )
}
