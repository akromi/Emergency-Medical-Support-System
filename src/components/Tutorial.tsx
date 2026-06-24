import { useEffect, useState } from 'react'

// Smart guided tour with voice-over. Each step highlights a real UI element
// (located by [data-tour="..."]), narrates via the browser SpeechSynthesis API
// (offline, no deps), and — for action steps — auto-advances when the user
// actually performs it (see `advanceWhen` + the live `signals`).

export interface TourSignals { hasInjury: boolean; hasTriage: boolean }

interface Step {
  target?: string
  title: string
  say: string
  advanceWhen?: (s: TourSignals) => boolean
}

const STEPS: Step[] = [
  { title: 'Welcome', say: "Welcome to Triage-Link. I'll walk you through documenting a casualty. Follow along on the screen, or tap Next." },
  { target: 'palette', title: 'Pick an injury type', say: 'Start by choosing an injury type from this palette — for example, Laceration or Burn.' },
  { target: 'charts', title: 'Mark it on the body', say: 'Tap a body region to zoom in, then tap again to drop a marker right where the injury is.', advanceWhen: (s) => s.hasInjury },
  { target: 'editor', title: 'Add the detail', say: 'For the selected injury, set its severity, add notes, and attach a wound photo with the camera.' },
  { target: 'triage', title: 'Set triage', say: "Set the patient's triage level. It shows on the casualty card and on the triage board.", advanceWhen: (s) => s.hasTriage },
  { target: 'vitals', title: 'Record vitals', say: 'Record a timestamped set of vitals here. Add a fresh set at each reassessment.' },
  { target: 'summary', title: 'Hand over', say: 'When you hand over, open Summary to print or save a one-page casualty card as a PDF.' },
  { target: 'board', title: 'See the whole scene', say: 'With several casualties, the Board groups everyone by triage — the scene picture for command.' },
  { title: "You're set", say: "That's the core flow. Everything saves offline on this device. You can replay this tour anytime from the help button." },
]

function locate(target?: string): DOMRect | null {
  if (!target) return null
  const el = document.querySelector(`[data-tour="${target}"]`)
  return el ? el.getBoundingClientRect() : null
}

export function Tutorial({ signals, onClose }: { signals: TourSignals; onClose: () => void }) {
  const [i, setI] = useState(0)
  const [muted, setMuted] = useState(() => { try { return localStorage.getItem('tl.tour.muted') === '1' } catch { return false } })
  const [rect, setRect] = useState<DOMRect | null>(null)
  const step = STEPS[i]
  const last = i === STEPS.length - 1

  const speak = (text: string) => {
    if (muted || !('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.rate = 1.02
    window.speechSynthesis.speak(u)
  }

  // On step change: scroll target into view, position the spotlight, narrate.
  useEffect(() => {
    const el = step.target ? document.querySelector(`[data-tour="${step.target}"]`) : null
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    setRect(locate(step.target))
    const t = window.setTimeout(() => setRect(locate(step.target)), 380) // after scroll settles
    speak(step.say)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, muted])

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
    else speak(step.say)
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
          <span className="tour-title">{step.title}</span>
          <button type="button" className="tour-mute" onClick={toggleMute} title={muted ? 'Unmute voice-over' : 'Mute voice-over'} aria-label="Toggle voice-over">{muted ? '🔇' : '🔊'}</button>
        </div>
        <p className="tour-say">{step.say}</p>
        <div className="tour-ctrls">
          <button type="button" className="tour-skip" onClick={close}>Skip</button>
          <span className="tour-nav">
            {i > 0 && <button type="button" className="btn" onClick={back}>Back</button>}
            <button type="button" className="btn primary" onClick={next}>{last ? 'Done' : 'Next'}</button>
          </span>
        </div>
      </div>
    </div>
  )
}
