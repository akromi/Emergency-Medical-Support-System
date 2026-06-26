import {
  type CasualtyRecord,
  estimateBurnTBSA, buildAtMist, elapsedSince, formatElapsed,
  TRIAGE_COLORS, AGE_BAND_LABELS,
} from '@triage-link/core'
import { useLang, regionLabel } from '../i18n'

// Printable one-page casualty card. On screen it's a light "paper" sheet over a
// backdrop; print CSS (styles.css @media print) hides the app + chrome and
// renders just the sheet, so "Print / Save PDF" produces a clean handover doc.

const fmt = (ms: number): string => new Date(ms).toLocaleString([], {
  year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit',
})
const dash = (s: string | undefined): string => (s && s.trim() ? s : '—')

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="sm-field"><span className="sm-k">{label}</span><span className="sm-v">{value}</span></div>
  )
}

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="sm-sec">
      <h3>{title}{count != null && <span className="sm-count">{count}</span>}</h3>
      {children}
    </section>
  )
}

export function CasualtySummary({ record, onClose }: { record: CasualtyRecord; onClose: () => void }) {
  const { t, lang } = useLang()
  const { tombstone: tomb, incident: inc, injuries, vitals, treatments, handover } = record
  const tbsa = estimateBurnTBSA(injuries, inc.ageBand)
  const burns = injuries.filter((i) => i.type === 'burn').length
  const mist = buildAtMist(record, Date.now())

  // AT-MIST lines that embed region/injury/vital/treatment tokens are rebuilt
  // here so they localise too (core keeps the canonical English narrative).
  const VK = ['hr', 'bp', 'rr', 'spo2', 'gcs', 'pain'] as const
  const lastV = vitals[vitals.length - 1]
  const mistInjuries = injuries.length
    ? injuries.map((i) => `${regionLabel(i.region, lang)} ${t(`injury.${i.type}`).toLowerCase()} (${t(`sev.${i.severity}`)})`).join('; ')
    : '—'
  const mistSigns = lastV
    ? VK.filter((k) => lastV[k]).map((k) => `${t(`vit.${k}`)} ${lastV[k]}`).join(', ') || '—'
    : '—'
  const mistTreatment = treatments.length
    ? treatments.map((x) => (x.detail ? `${t(`txt.${x.type}`)} (${x.detail})` : t(`txt.${x.type}`))).join('; ')
    : '—'
  // Snapshot of the time-since-injury clock at card generation (print is static).
  const elapsedMs = elapsedSince(inc.injuryTime, Date.now())
  const elapsedStr = elapsedMs == null ? null
    : `${t('elapsed.prefix')}${formatElapsed(elapsedMs, { d: t('elapsed.d'), h: t('elapsed.h'), m: t('elapsed.m') })}`

  return (
    <div className="summary-overlay" onClick={onClose}>
      <div className="summary-actions" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="topbtn primary" onClick={() => window.print()}>{t('sm.print')}</button>
        <button type="button" className="topbtn" onClick={onClose}>{t('sm.close')}</button>
      </div>

      <div className="summary-sheet" onClick={(e) => e.stopPropagation()}>
        <header className="sm-head">
          <div>
            <div className="sm-brand">{t('sm.card')}</div>
            <div className="sm-case">{t('hdr.case')} {record.id}</div>
          </div>
          {inc.triage && (
            <div className="sm-triage" style={{ background: TRIAGE_COLORS[inc.triage] }}>
              {t(`triage.${inc.triage}`)}
            </div>
          )}
        </header>

        <Section title={t('sm.atmist')}>
          <dl className="sm-mist">
            <div><dt>A</dt><dd><b>{t('sm.a')}</b> — {mist.age}</dd></div>
            <div><dt>T</dt><dd><b>{t('sm.t')}</b> — {mist.time}</dd></div>
            <div><dt>M</dt><dd><b>{t('sm.m')}</b> — {mist.mechanism}</dd></div>
            <div><dt>I</dt><dd><b>{t('sm.i')}</b> — {mistInjuries}</dd></div>
            <div><dt>S</dt><dd><b>{t('sm.s')}</b> — {mistSigns}</dd></div>
            <div><dt>T</dt><dd><b>{t('sm.tx')}</b> — {mistTreatment}</dd></div>
          </dl>
        </Section>

        <Section title={t('sm.patient')}>
          <div className="sm-grid">
            <Field label={t('sm.name')} value={dash(tomb.name)} />
            <Field label={t('sm.dob')} value={dash(tomb.dob)} />
            <Field label={t('sm.sex')} value={tomb.sex ? t(`sex.${tomb.sex}`) : '—'} />
            <Field label={t('sm.ageband')} value={AGE_BAND_LABELS[inc.ageBand]} />
            <Field label={t('sm.mrn')} value={dash(tomb.mrn)} />
            <Field label={t('sm.blood')} value={dash(tomb.bloodType)} />
            <Field label={t('sm.nok')} value={dash(tomb.nextOfKin)} />
            <Field label={t('sm.nokphone')} value={dash(tomb.nextOfKinPhone)} />
            <Field label={t('sm.address')} value={dash(tomb.address)} />
          </div>
        </Section>

        <Section title={t('sm.incident')}>
          <div className="sm-grid">
            <Field label={t('sm.timeofinjury')} value={dash(inc.injuryTime)} />
            {elapsedStr && <Field label={t('elapsed.title')} value={elapsedStr} />}
            <Field label={t('sm.m')} value={dash(inc.mechanism)} />
            <Field label={t('sm.location')} value={dash(inc.location)} />
          </div>
        </Section>

        <Section title={t('sm.injuries')} count={injuries.length}>
          {injuries.length === 0 ? (
            <div className="sm-empty">{t('sm.none')}</div>
          ) : (
            <table className="sm-tbl">
              <thead><tr><th>{t('sm.region')}</th><th>{t('sm.view')}</th><th>{t('sm.type')}</th><th>{t('sm.severity')}</th><th>{t('sm.notes')}</th></tr></thead>
              <tbody>
                {injuries.map((i) => (
                  <tr key={i.id}>
                    <td>{regionLabel(i.region, lang)}</td><td>{t(`view.${i.view}`)}</td><td>{t(`injury.${i.type}`)}</td>
                    <td>{t(`sev.${i.severity}`)}</td><td>{i.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {burns > 0 && (
            <div className="sm-tbsa">{t('sm.burntbsa')}: <b>{tbsa}%</b> <span className="sm-dim">(Lund–Browder, {AGE_BAND_LABELS[inc.ageBand]})</span></div>
          )}
          {injuries.some((i) => i.photos.length > 0) && (
            <div className="sm-photos">
              {injuries.flatMap((i) => i.photos.map((src, k) => (
                <figure key={`${i.id}-${k}`}><img src={src} alt={regionLabel(i.region, lang)} /><figcaption>{regionLabel(i.region, lang)}</figcaption></figure>
              )))}
            </div>
          )}
        </Section>

        <Section title={t('sm.vitals')} count={vitals.length}>
          {vitals.length === 0 ? (
            <div className="sm-empty">{t('sm.none')}</div>
          ) : (
            <table className="sm-tbl">
              <thead><tr><th>{t('sm.time')}</th><th>{t('vit.hr')}</th><th>{t('vit.bp')}</th><th>{t('vit.rr')}</th><th>{t('vit.spo2')}</th><th>{t('vit.gcs')}</th><th>{t('vit.pain')}</th></tr></thead>
              <tbody>
                {vitals.map((v) => (
                  <tr key={v.id}>
                    <td>{fmt(v.takenAt)}</td><td>{v.hr || '—'}</td><td>{v.bp || '—'}</td><td>{v.rr || '—'}</td>
                    <td>{v.spo2 || '—'}</td><td>{v.gcs || '—'}</td><td>{v.pain || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section title={t('sm.treatments')} count={treatments.length}>
          {treatments.length === 0 ? (
            <div className="sm-empty">{t('sm.none')}</div>
          ) : (
            <table className="sm-tbl">
              <thead><tr><th>{t('sm.time')}</th><th>{t('sm.intervention')}</th><th>{t('sm.detail')}</th><th>{t('sm.place')}</th><th>{t('sm.provider')}</th></tr></thead>
              <tbody>
                {treatments.map((tr) => (
                  <tr key={tr.id}>
                    <td>{fmt(tr.performedAt)}</td><td>{t(`txt.${tr.type}`)}</td><td>{tr.detail || '—'}</td>
                    <td>{t(`tx.place.${tr.place}`)}</td><td>{tr.provider || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section title={t('sm.handover')}>
          {handover ? (
            <div className="sm-grid">
              <Field label={t('sm.time')} value={fmt(handover.at)} />
              <Field label={t('sm.clinician')} value={dash(handover.clinician)} />
              <Field label={t('sm.facility')} value={dash(handover.facility)} />
            </div>
          ) : (
            <div className="sm-empty">{t('sm.nothandedover')}</div>
          )}
        </Section>

        <footer className="sm-foot">{t('sm.generated')} {fmt(Date.now())} · TRIAGE-LINK</footer>
      </div>
    </div>
  )
}
