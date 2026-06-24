import {
  type CasualtyRecord,
  injuryLabel, estimateBurnTBSA, buildAtMist,
  TRIAGE_LABELS, TRIAGE_COLORS, AGE_BAND_LABELS,
} from '@triage-link/core'

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
  const { tombstone: t, incident: inc, injuries, vitals, treatments, handover } = record
  const tbsa = estimateBurnTBSA(injuries, inc.ageBand)
  const burns = injuries.filter((i) => i.type === 'burn').length
  const mist = buildAtMist(record, Date.now())

  return (
    <div className="summary-overlay" onClick={onClose}>
      <div className="summary-actions" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="topbtn primary" onClick={() => window.print()}>🖨 Print / Save PDF</button>
        <button type="button" className="topbtn" onClick={onClose}>Close</button>
      </div>

      <div className="summary-sheet" onClick={(e) => e.stopPropagation()}>
        <header className="sm-head">
          <div>
            <div className="sm-brand">◇ TRIAGE-LINK — Casualty Card</div>
            <div className="sm-case">CASE {record.id}</div>
          </div>
          {inc.triage && (
            <div className="sm-triage" style={{ background: TRIAGE_COLORS[inc.triage] }}>
              {TRIAGE_LABELS[inc.triage]}
            </div>
          )}
        </header>

        <Section title="AT-MIST handover">
          <dl className="sm-mist">
            <div><dt>A</dt><dd><b>Age / sex</b> — {mist.age}</dd></div>
            <div><dt>T</dt><dd><b>Time of incident</b> — {mist.time}</dd></div>
            <div><dt>M</dt><dd><b>Mechanism</b> — {mist.mechanism}</dd></div>
            <div><dt>I</dt><dd><b>Injuries</b> — {mist.injuries}</dd></div>
            <div><dt>S</dt><dd><b>Signs</b> — {mist.signs}</dd></div>
            <div><dt>T</dt><dd><b>Treatment</b> — {mist.treatment}</dd></div>
          </dl>
        </Section>

        <Section title="Patient">
          <div className="sm-grid">
            <Field label="Name" value={dash(t.name)} />
            <Field label="DOB" value={dash(t.dob)} />
            <Field label="Sex" value={dash(t.sex)} />
            <Field label="Age band" value={AGE_BAND_LABELS[inc.ageBand]} />
            <Field label="MRN" value={dash(t.mrn)} />
            <Field label="Blood type" value={dash(t.bloodType)} />
            <Field label="Next of kin" value={dash(t.nextOfKin)} />
            <Field label="NOK phone" value={dash(t.nextOfKinPhone)} />
            <Field label="Address" value={dash(t.address)} />
          </div>
        </Section>

        <Section title="Incident">
          <div className="sm-grid">
            <Field label="Time of injury" value={dash(inc.injuryTime)} />
            <Field label="Mechanism" value={dash(inc.mechanism)} />
            <Field label="Location" value={dash(inc.location)} />
          </div>
        </Section>

        <Section title="Injuries" count={injuries.length}>
          {injuries.length === 0 ? (
            <div className="sm-empty">None recorded.</div>
          ) : (
            <table className="sm-tbl">
              <thead><tr><th>Region</th><th>View</th><th>Type</th><th>Severity</th><th>Notes</th></tr></thead>
              <tbody>
                {injuries.map((i) => (
                  <tr key={i.id}>
                    <td>{i.region}</td><td>{i.view}</td><td>{injuryLabel(i.type)}</td>
                    <td>{i.severity}</td><td>{i.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {burns > 0 && (
            <div className="sm-tbsa">Burn TBSA: <b>{tbsa}%</b> <span className="sm-dim">(Lund–Browder, {AGE_BAND_LABELS[inc.ageBand]})</span></div>
          )}
          {injuries.some((i) => i.photos.length > 0) && (
            <div className="sm-photos">
              {injuries.flatMap((i) => i.photos.map((src, k) => (
                <figure key={`${i.id}-${k}`}><img src={src} alt={i.region} /><figcaption>{i.region}</figcaption></figure>
              )))}
            </div>
          )}
        </Section>

        <Section title="Vitals" count={vitals.length}>
          {vitals.length === 0 ? (
            <div className="sm-empty">None recorded.</div>
          ) : (
            <table className="sm-tbl">
              <thead><tr><th>Time</th><th>HR</th><th>BP</th><th>RR</th><th>SpO₂</th><th>GCS</th><th>Pain</th></tr></thead>
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

        <Section title="Treatments" count={treatments.length}>
          {treatments.length === 0 ? (
            <div className="sm-empty">None recorded.</div>
          ) : (
            <table className="sm-tbl">
              <thead><tr><th>Time</th><th>Intervention</th><th>Detail</th><th>Place</th><th>Provider</th></tr></thead>
              <tbody>
                {treatments.map((tr) => (
                  <tr key={tr.id}>
                    <td>{fmt(tr.performedAt)}</td><td>{tr.type}</td><td>{tr.detail || '—'}</td>
                    <td>{tr.place}</td><td>{tr.provider || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section title="Handover">
          {handover ? (
            <div className="sm-grid">
              <Field label="Time" value={fmt(handover.at)} />
              <Field label="Clinician" value={dash(handover.clinician)} />
              <Field label="Facility" value={dash(handover.facility)} />
            </div>
          ) : (
            <div className="sm-empty">Not yet handed over.</div>
          )}
        </Section>

        <footer className="sm-foot">Generated {fmt(Date.now())} · TRIAGE-LINK</footer>
      </div>
    </div>
  )
}
