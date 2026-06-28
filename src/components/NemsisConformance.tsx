import {
  type CasualtyRecord,
  toNemsisRecord, toNemsisXml, validateNemsisRecord, PLACEHOLDER_RULESET,
} from '@triage-link/core'
import { useLang } from '../i18n'

// Read-only "NEMSIS conformance" view for the current record. It surfaces the
// conformance picture the regulated (Ontario EMS) path needs to SEE while
// documenting — without ever claiming certification:
//   • the capture GAPS (NEMSIS sections a complete OADS/NEMSIS record needs that
//     aren't filled yet — cleared dynamically as data is entered), and
//   • the validator ISSUES against the offline PLACEHOLDER ruleset.
//
// The placeholder ruleset is NOT the official NEMSIS v3.5.0 / OADS v4.0
// dictionary, so a clean pass here is explicitly NOT certification — the banner
// and the issues heading say so, and the result's own `rulesetSource` is shown.
// The "Export shaped XML" button emits the PR-2a serializer's NEMSIS-shaped XML
// (also not a certified submission).
export function NemsisConformance({ record, onClose }: { record: CasualtyRecord; onClose: () => void }) {
  const { t } = useLang()
  const nemsis = toNemsisRecord(record)
  const result = validateNemsisRecord(nemsis, PLACEHOLDER_RULESET)
  const errors = result.issues.filter((i) => i.severity === 'error')
  const warnings = result.issues.filter((i) => i.severity === 'warning')

  function exportXml() {
    const blob = new Blob([toNemsisXml(nemsis)], { type: 'application/xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${record.id}-nemsis.xml`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="summary-overlay" onClick={onClose}>
      <div className="summary-actions" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="topbtn" onClick={exportXml} title={t('nemsis.xml.help')}>{t('nemsis.xml')}</button>
        <button type="button" className="topbtn" onClick={onClose}>{t('sm.close')}</button>
      </div>
      <div className="summary-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sm-head">
          <div>
            <div className="sm-brand">{t('nemsis.title')}</div>
            <div className="sm-case">{nemsis.standard} {nemsis.version} · {record.id}</div>
          </div>
        </div>

        {/* The whole point: a clean pass here is NOT certification. */}
        <div className="nemsis-disclaimer" role="note">{t('nemsis.disclaimer')}</div>

        <div className="nemsis-stats">
          <span className="nemsis-stat"><b>{nemsis.sections.length}</b> {t('nemsis.sections')}</span>
          <span className="nemsis-stat err"><b>{errors.length}</b> {t('nemsis.errors')}</span>
          <span className="nemsis-stat warn"><b>{warnings.length}</b> {t('nemsis.warnings')}</span>
          <span className="nemsis-stat gap"><b>{nemsis.gaps.length}</b> {t('nemsis.gapsN')}</span>
        </div>

        <section className="sm-sec">
          <h3>{t('nemsis.gaps.h')}<span className="sm-count">{nemsis.gaps.length}</span></h3>
          {nemsis.gaps.length === 0 ? (
            <div className="sm-empty">{t('nemsis.gaps.none')}</div>
          ) : (
            <ul className="nemsis-list">
              {nemsis.gaps.map((g, i) => <li key={i} className="nemsis-gap">{g}</li>)}
            </ul>
          )}
        </section>

        <section className="sm-sec">
          <h3>{t('nemsis.issues.h')}<span className="nemsis-ruleset">{t('nemsis.placeholder')}</span></h3>
          {result.issues.length === 0 ? (
            <div className="sm-empty">{t('nemsis.issues.none')}</div>
          ) : (
            <ul className="nemsis-list">
              {[...errors, ...warnings].map((iss, i) => (
                <li key={i} className={`nemsis-issue ${iss.severity}`}>
                  <span className="nemsis-sev">{t(`nemsis.sev.${iss.severity}`)}</span>
                  {iss.elementId && <code className="nemsis-eid">{iss.elementId}</code>}
                  <span className="nemsis-msg">{iss.message}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
