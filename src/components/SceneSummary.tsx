import { useState } from 'react'
import {
  type CasualtyRecord, type TriageCategory,
  TRIAGE_COLORS, elapsedSince, formatElapsed,
} from '@triage-link/core'
import { useLang, regionLabel } from '../i18n'

// Scene-wide / incident-command roll-up: a single printable + shareable snapshot
// of every casualty for command — the START triage tally, the on-scene vs
// handed-over split, and a roster sorted by acuity then time-since-injury.
// Reuses the .summary-overlay/.summary-sheet shell so the print CSS applies.

const ORDER: TriageCategory[] = ['immediate', 'delayed', 'minor', 'deceased']
const PRIORITY: Record<string, number> = { immediate: 0, delayed: 1, minor: 2, deceased: 3, unset: 4 }

const fmtNow = (ms: number): string => new Date(ms).toLocaleString([], {
  year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit',
})

export function SceneSummary({ records, onClose }: { records: ReadonlyArray<CasualtyRecord>; onClose: () => void }) {
  const { t, lang } = useLang()
  const [shareMsg, setShareMsg] = useState('')
  const now = Date.now()

  const tally: Record<string, number> = { immediate: 0, delayed: 0, minor: 0, deceased: 0, unset: 0 }
  records.forEach((r) => { tally[r.incident.triage || 'unset']++ })
  const handed = records.filter((r) => r.handover).length
  const onScene = records.length - handed

  const elapsedStr = (r: CasualtyRecord): string => {
    const ms = elapsedSince(r.incident.injuryTime, now)
    return ms == null ? '—' : `${t('elapsed.prefix')}${formatElapsed(ms, { d: t('elapsed.d'), h: t('elapsed.h'), m: t('elapsed.m') })}`
  }

  // Roster: most acute first, then longest since injury (largest elapsed).
  const elapsedMs = (r: CasualtyRecord): number => elapsedSince(r.incident.injuryTime, now) ?? -1
  const roster = [...records].sort((a, b) => {
    const pa = PRIORITY[a.incident.triage || 'unset']
    const pb = PRIORITY[b.incident.triage || 'unset']
    if (pa !== pb) return pa - pb
    return elapsedMs(b) - elapsedMs(a)
  })

  const primaryRegion = (r: CasualtyRecord): string =>
    r.injuries.length ? regionLabel(r.injuries[0].region, lang) : '—'

  function buildText(): string {
    const head = `${t('scene.title')} — ${fmtNow(now)}`
    const totals = `${t('scene.casualties')}: ${records.length} · ${t('scene.status.onscene')} ${onScene} · ${t('scene.status.handed')} ${handed}`
    const tallyLine = [...ORDER.map((k) => `${t(`triage.${k}`).split(' ')[0]} ${tally[k]}`), `${t('board.untriaged')} ${tally.unset}`].join(' · ')
    const rows = roster.map((r) => {
      const tri = r.incident.triage ? t(`triage.${r.incident.triage}`).split(' ')[0] : t('board.untriaged')
      const status = r.handover ? t('scene.status.handed') : t('scene.status.onscene')
      return `${r.id}\t${r.tombstone.name || t('saved.unidentified')}\t${tri}\t${primaryRegion(r)}\t${elapsedStr(r)}\t${status}`
    })
    return [head, totals, tallyLine, '', ...rows].join('\n')
  }

  async function share() {
    const text = buildText()
    try {
      if (navigator.share) await navigator.share({ title: t('scene.title'), text })
      else { await navigator.clipboard.writeText(text); setShareMsg(t('scene.shared')); window.setTimeout(() => setShareMsg(''), 4000) }
    } catch { /* user cancelled the share sheet — no-op */ }
  }

  return (
    <div className="summary-overlay" onClick={onClose}>
      <div className="summary-actions" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="topbtn primary" onClick={() => window.print()}>{t('sm.print')}</button>
        <button type="button" className="topbtn" onClick={share}>{t('scene.share')}</button>
        <button type="button" className="topbtn" onClick={onClose}>{t('sm.close')}</button>
        {shareMsg && <span className="scene-sharemsg">{shareMsg}</span>}
      </div>

      <div className="summary-sheet" onClick={(e) => e.stopPropagation()}>
        <header className="sm-head">
          <div>
            <div className="sm-brand">{t('scene.title')}</div>
            <div className="sm-case">{fmtNow(now)}</div>
          </div>
          <div className="scene-total">{records.length}<span>{t('scene.casualties')}</span></div>
        </header>

        {records.length === 0 ? (
          <div className="sm-empty">{t('scene.none')}</div>
        ) : (
          <>
            <section className="sm-sec">
              <h3>{t('scene.tally')}</h3>
              <div className="scene-tally">
                {ORDER.map((k) => (
                  <div className="scene-tile" key={k} style={{ borderColor: TRIAGE_COLORS[k] }}>
                    <span className="scene-tile-n" style={{ color: TRIAGE_COLORS[k] }}>{tally[k]}</span>
                    <span className="scene-tile-k">{t(`triage.${k}`).split(' ')[0]}</span>
                  </div>
                ))}
                <div className="scene-tile" style={{ borderColor: '#3A4656' }}>
                  <span className="scene-tile-n" style={{ color: '#8a97a8' }}>{tally.unset}</span>
                  <span className="scene-tile-k">{t('board.untriaged')}</span>
                </div>
              </div>
              <div className="scene-status">
                <span><b>{onScene}</b> {t('scene.status.onscene')}</span>
                <span><b>{handed}</b> {t('scene.status.handed')}</span>
              </div>
            </section>

            <section className="sm-sec">
              <h3>{t('scene.roster')}<span className="sm-count">{records.length}</span></h3>
              <table className="sm-tbl scene-tbl">
                <thead><tr>
                  <th>{t('scene.h.case')}</th><th>{t('scene.h.name')}</th><th>{t('scene.h.triage')}</th>
                  <th>{t('scene.h.injuries')}</th><th>{t('scene.h.elapsed')}</th><th>{t('scene.h.status')}</th>
                </tr></thead>
                <tbody>
                  {roster.map((r) => {
                    const color = r.incident.triage ? TRIAGE_COLORS[r.incident.triage] : '#8a97a8'
                    return (
                      <tr key={r.id}>
                        <td className="mono">{r.id}</td>
                        <td>{r.tombstone.name || t('saved.unidentified')}</td>
                        <td><span className="scene-pill" style={{ background: color }}>{r.incident.triage ? t(`triage.${r.incident.triage}`).split(' ')[0] : t('board.untriaged')}</span></td>
                        <td>{r.injuries.length ? `${primaryRegion(r)}${r.injuries.length > 1 ? ` +${r.injuries.length - 1}` : ''}` : '—'}</td>
                        <td className="mono">{elapsedStr(r)}</td>
                        <td>{r.handover ? t('scene.status.handed') : t('scene.status.onscene')}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
