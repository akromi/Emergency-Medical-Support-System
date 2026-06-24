import { useMemo, useState } from 'react'
import {
  buildPatientMatchParameters, toOntarioContributionBundle, buildAccessAuditEvent,
  createEmptyRecord, EhrError,
  type EhrGateway, type PatientIdentity, type MatchResult,
  type ContributionResult, type CasualtyRecord,
} from '@triage-link/core'
import { MockGateway } from '@triage-link/ehr-gateway'

// ───────────────────────────────────────────────────────────────────────────
// EHR Test Console — an interactive, fully-offline lab for the provincial-EHR
// integration ("Send to EHR" + patient $match + context). It runs the REAL
// MockGateway (the same stub the backend uses in dev) directly in the browser,
// so every call here exercises production gateway logic against fabricated data
// — no ONE ID credentials, no client certificate, no backend required.
//
// Two surfaces:
//   • Scenario suite — a fixed set of pass/fail integration checks you can run
//     and inspect (request, generated FHIR, ATNA audit event, response).
//   • Manual console — compose your own $match / handover / context call (incl.
//     "Send the current casualty"), with an optional simulated EHR outage to
//     see how failures surface.
// ───────────────────────────────────────────────────────────────────────────

interface Check { label: string; pass: boolean }
interface Outcome {
  ms: number
  request: unknown
  response: unknown
  checks: Check[]
  fhir?: { title: string; body: unknown }
  audit?: unknown
  threw?: string
}

const nowIso = () => new Date().toISOString()

async function timed<T>(fn: () => Promise<T>): Promise<{ value?: T; error?: unknown; ms: number }> {
  const t0 = performance.now()
  try {
    return { value: await fn(), ms: Math.round(performance.now() - t0) }
  } catch (error) {
    return { error, ms: Math.round(performance.now() - t0) }
  }
}

const errText = (e: unknown): string =>
  e instanceof EhrError ? `EhrError[${e.code}${e.status ? ` ${e.status}` : ''}${e.retryable ? ' · retryable' : ''}]: ${e.message}` : String(e)

/** A gateway decorator that fails selected operations — to exercise error paths. */
class FaultyGateway implements EhrGateway {
  readonly provider = 'mock (outage simulated)'
  constructor(private readonly inner: EhrGateway, private readonly ops: ReadonlySet<string>) {}
  ping() { return this.inner.ping() }
  private guard(op: string) {
    if (this.ops.has(op)) throw new EhrError('unavailable', 'Provincial EHR repository is unreachable', { status: 503 })
  }
  async matchPatient(q: PatientIdentity): Promise<MatchResult> { this.guard('match'); return this.inner.matchPatient(q) }
  async contributeHandover(r: CasualtyRecord): Promise<ContributionResult> { this.guard('handover'); return this.inner.contributeHandover!(r) }
  async fetchContext(id: string) { this.guard('context'); return this.inner.fetchContext!(id) }
}

// A representative casualty for the handover scenario / default manual payload.
function sampleCasualty(): CasualtyRecord {
  const r = createEmptyRecord('CAS-DEMO-1')
  r.tombstone = { ...r.tombstone, name: 'Doe, Jane', dob: '1990-04-01', sex: 'female', mrn: '1234567890', bloodType: 'O+' }
  r.incident = { ...r.incident, mechanism: 'Blast', injuryTime: '2026-06-24T10:15', triage: 'immediate' }
  r.injuries.push({ id: 'inj-1', view: 'anterior', x: 240, y: 360, region: 'Left thigh', type: 'laceration', severity: 'severe', notes: 'Arterial bleed, tourniquet applied', photos: [] })
  r.vitals.push({ id: 'v-1', takenAt: Date.parse('2026-06-24T10:20'), hr: '128', bp: '90/60', rr: '24', spo2: '94', gcs: '14 (E4 V4 M6)', pain: '8' })
  return r
}

// ── Scenario suite ───────────────────────────────────────────────────────────
interface Scenario {
  id: string
  group: 'Patient $match' | 'Send to EHR' | 'Clinical context' | 'Failure handling'
  title: string
  desc: string
  run: () => Promise<Outcome>
}

function buildScenarios(): Scenario[] {
  const gw = () => new MockGateway()

  const matchScenario = (
    id: string, title: string, desc: string, query: PatientIdentity, checks: (r?: MatchResult, e?: unknown) => Check[],
  ): Scenario => ({
    id, group: 'Patient $match', title, desc,
    run: async () => {
      const { value, error, ms } = await timed(() => gw().matchPatient(query))
      return {
        ms, request: query, response: error ? errText(error) : value, threw: error ? errText(error) : undefined,
        fhir: { title: 'PCR FHIR Patient/$match Parameters (what the adapter POSTs)', body: buildPatientMatchParameters(query, { onlyCertainMatches: false, count: 5 }) },
        audit: buildAccessAuditEvent({ action: 'R', outcome: error ? '8' : '0', recordedIso: nowIso(), agentId: 'oneid|demo.clinician', query: 'Patient/$match by demographics', patientId: value?.matches[0]?.id }),
        checks: checks(value, error),
      }
    },
  })

  return [
    matchScenario('m-hcn', 'Resolve by health-card number', 'Exact OHIP number → a single certain match (identity resolved).',
      { healthCardNumber: '1234567890' }, (r, e) => [
        { label: 'no transport error', pass: !e },
        { label: 'resolved === true', pass: r?.resolved === true },
        { label: 'top match id = pcr-1001', pass: r?.matches[0]?.id === 'pcr-1001' },
        { label: "grade = 'certain'", pass: r?.matches[0]?.grade === 'certain' },
      ]),
    matchScenario('m-unknown', 'Unknown health-card number', 'A number no patient holds → zero candidates, not resolved.',
      { healthCardNumber: '0000000000' }, (r, e) => [
        { label: 'no transport error', pass: !e },
        { label: 'zero matches', pass: r?.matches.length === 0 },
        { label: 'resolved === false', pass: r?.resolved === false },
      ]),
    matchScenario('m-name-dob', 'Name + date of birth', 'No HCN, but family name + DOB → a probable (not certain) candidate.',
      { familyName: 'Roe', givenName: 'John', birthDate: '1985-11-23' }, (r, e) => [
        { label: 'no transport error', pass: !e },
        { label: 'top match id = pcr-1002', pass: r?.matches[0]?.id === 'pcr-1002' },
        { label: "grade = 'probable'", pass: r?.matches[0]?.grade === 'probable' },
        { label: 'not auto-resolved', pass: r?.resolved === false },
      ]),
    {
      id: 'h-accept', group: 'Send to EHR', title: 'Contribute a casualty handover',
      desc: 'POST a CasualtyRecord → accepted, with a transaction id. Shows the FHIR transaction bundle that would be submitted.',
      run: async () => {
        const record = sampleCasualty()
        const { value, error, ms } = await timed(() => gw().contributeHandover!(record))
        return {
          ms, request: { id: record.id, name: record.tombstone.name }, response: error ? errText(error) : value, threw: error ? errText(error) : undefined,
          fhir: { title: 'Ontario contribution Bundle (transaction)', body: toOntarioContributionBundle(record) },
          audit: buildAccessAuditEvent({ action: 'C', outcome: error ? '8' : '0', recordedIso: nowIso(), agentId: 'oneid|demo.clinician', query: 'Contribute handover Bundle' }),
          checks: [
            { label: 'no transport error', pass: !error },
            { label: 'accepted === true', pass: (value as ContributionResult)?.accepted === true },
            { label: 'returns a transaction id', pass: !!(value as ContributionResult)?.id },
          ],
        }
      },
    },
    {
      id: 'c-allergy', group: 'Clinical context', title: 'Pull context for a resolved patient',
      desc: 'Fetch meds/allergies for pcr-1001 → a FHIR Bundle including a high-criticality allergy.',
      run: async () => {
        const { value, error, ms } = await timed(() => gw().fetchContext!('pcr-1001'))
        const bundle = value as { resourceType?: string; entry?: Array<{ resource?: { resourceType?: string } }> } | undefined
        const types = (bundle?.entry ?? []).map((e) => e.resource?.resourceType)
        return {
          ms, request: { patientId: 'pcr-1001' }, response: error ? errText(error) : value, threw: error ? errText(error) : undefined,
          checks: [
            { label: 'no transport error', pass: !error },
            { label: 'is a FHIR Bundle', pass: bundle?.resourceType === 'Bundle' },
            { label: 'includes AllergyIntolerance', pass: types.includes('AllergyIntolerance') },
          ],
        }
      },
    },
    {
      id: 'f-outage', group: 'Failure handling', title: 'EHR outage on Send to EHR',
      desc: 'Gateway throws EhrError("unavailable") → surfaced as a retryable 503, exactly how the app must handle a down repository.',
      run: async () => {
        const faulty = new FaultyGateway(new MockGateway(), new Set(['handover']))
        const record = sampleCasualty()
        const { value, error, ms } = await timed(() => faulty.contributeHandover(record))
        const isEhr = error instanceof EhrError
        return {
          ms, request: { id: record.id }, response: error ? errText(error) : value, threw: error ? errText(error) : undefined,
          checks: [
            { label: 'call rejected (as expected)', pass: !!error },
            { label: "EhrError code = 'unavailable'", pass: isEhr && (error as EhrError).code === 'unavailable' },
            { label: 'marked retryable', pass: isEhr && (error as EhrError).retryable === true },
          ],
        }
      },
    },
  ]
}

// ── JSON + outcome rendering ─────────────────────────────────────────────────
function Json({ label, value, open = false }: { label: string; value: unknown; open?: boolean }) {
  return (
    <details className="lab-json" open={open}>
      <summary>{label}</summary>
      <pre>{JSON.stringify(value, null, 2)}</pre>
    </details>
  )
}

function OutcomeView({ outcome }: { outcome: Outcome }) {
  const passed = outcome.checks.filter((c) => c.pass).length
  const allPass = passed === outcome.checks.length
  return (
    <div className="lab-outcome">
      <div className="lab-checks">
        {outcome.checks.map((c, i) => (
          <div key={i} className={`lab-check ${c.pass ? 'ok' : 'bad'}`}><span className="lab-tick">{c.pass ? '✓' : '✗'}</span>{c.label}</div>
        ))}
        <div className="lab-latency">{passed}/{outcome.checks.length} checks · {outcome.ms} ms{allPass ? '' : ' · FAILED'}</div>
      </div>
      <Json label="Request" value={outcome.request} />
      {outcome.fhir && <Json label={`FHIR · ${outcome.fhir.title}`} value={outcome.fhir.body} />}
      <Json label="Response" value={outcome.response} open={!allPass} />
      {outcome.audit != null && <Json label="ATNA AuditEvent (logged on every access)" value={outcome.audit} />}
    </div>
  )
}

// ── Manual console ───────────────────────────────────────────────────────────
function ManualConsole({ record }: { record: CasualtyRecord }) {
  const [op, setOp] = useState<'match' | 'handover' | 'context'>('match')
  const [outage, setOutage] = useState(false)
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  // $match inputs
  const [hcn, setHcn] = useState('1234567890')
  const [family, setFamily] = useState('')
  const [given, setGiven] = useState('')
  const [dob, setDob] = useState('')
  // context input
  const [pid, setPid] = useState('pcr-1001')
  // handover payload (prefilled; "use current" swaps in the live casualty)
  const [payload, setPayload] = useState(() => JSON.stringify(sampleCasualty(), null, 2))

  const gateway = (): EhrGateway => {
    const base = new MockGateway()
    return outage ? new FaultyGateway(base, new Set([op])) : base
  }

  async function run() {
    setBusy(true)
    try {
      if (op === 'match') {
        const query: PatientIdentity = {}
        if (hcn.trim()) query.healthCardNumber = hcn.trim()
        if (family.trim()) query.familyName = family.trim()
        if (given.trim()) query.givenName = given.trim()
        if (dob.trim()) query.birthDate = dob.trim()
        const { value, error, ms } = await timed(() => gateway().matchPatient(query))
        setOutcome({
          ms, request: query, response: error ? errText(error) : value, threw: error ? errText(error) : undefined,
          fhir: { title: 'PCR Patient/$match Parameters', body: buildPatientMatchParameters(query, { count: 5 }) },
          audit: buildAccessAuditEvent({ action: 'R', outcome: error ? '8' : '0', recordedIso: nowIso(), agentId: 'oneid|demo.clinician', query: 'Patient/$match (manual)', patientId: (value as MatchResult | undefined)?.matches[0]?.id }),
          checks: [{ label: error ? 'rejected' : 'returned a result', pass: !error }],
        })
      } else if (op === 'context') {
        const { value, error, ms } = await timed(() => gateway().fetchContext!(pid.trim()))
        setOutcome({ ms, request: { patientId: pid.trim() }, response: error ? errText(error) : value, threw: error ? errText(error) : undefined, checks: [{ label: error ? 'rejected' : 'returned a bundle', pass: !error }] })
      } else {
        let record: CasualtyRecord
        try { record = JSON.parse(payload) } catch { setOutcome({ ms: 0, request: null, response: 'Payload is not valid JSON', checks: [{ label: 'valid JSON payload', pass: false }] }); return }
        const { value, error, ms } = await timed(() => gateway().contributeHandover!(record))
        setOutcome({
          ms, request: { id: record.id, name: record.tombstone?.name }, response: error ? errText(error) : value, threw: error ? errText(error) : undefined,
          fhir: { title: 'Ontario contribution Bundle (transaction)', body: toOntarioContributionBundle(record) },
          audit: buildAccessAuditEvent({ action: 'C', outcome: error ? '8' : '0', recordedIso: nowIso(), agentId: 'oneid|demo.clinician', query: 'Contribute handover (manual)' }),
          checks: [{ label: error ? 'rejected' : 'accepted', pass: !error && (value as ContributionResult)?.accepted === true }],
        })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="lab-manual">
      <div className="lab-ops">
        {(['match', 'handover', 'context'] as const).map((o) => (
          <button key={o} type="button" className={op === o ? 'on' : ''} onClick={() => { setOp(o); setOutcome(null) }}>
            {o === 'match' ? 'Patient $match' : o === 'handover' ? 'Send to EHR' : 'Fetch context'}
          </button>
        ))}
      </div>

      {op === 'match' && (
        <div className="lab-form grid2">
          <label className="field"><span>Health-card number</span><input className="mono" value={hcn} onChange={(e) => setHcn(e.target.value)} placeholder="OHIP number" /></label>
          <label className="field"><span>Date of birth</span><input value={dob} onChange={(e) => setDob(e.target.value)} placeholder="YYYY-MM-DD" /></label>
          <label className="field"><span>Family name</span><input value={family} onChange={(e) => setFamily(e.target.value)} placeholder="e.g. Doe" /></label>
          <label className="field"><span>Given name</span><input value={given} onChange={(e) => setGiven(e.target.value)} placeholder="e.g. Jane" /></label>
          <p className="lab-hint col2">Seeded patients: <code>1234567890</code> Jane Doe · <code>9876543210</code> John Roe (try name + DOB <code>1985-11-23</code>).</p>
        </div>
      )}
      {op === 'context' && (
        <div className="lab-form">
          <label className="field"><span>Patient id</span><input className="mono" value={pid} onChange={(e) => setPid(e.target.value)} /></label>
          <p className="lab-hint">Seeded ids: <button type="button" className="lab-chip" onClick={() => setPid('pcr-1001')}>pcr-1001</button> (has allergies/meds) · <button type="button" className="lab-chip" onClick={() => setPid('pcr-1002')}>pcr-1002</button> (empty).</p>
        </div>
      )}
      {op === 'handover' && (
        <div className="lab-form">
          <div className="lab-payload-actions">
            <button type="button" className="lab-chip" onClick={() => setPayload(JSON.stringify(record, null, 2))}>Use current casualty ({record.id})</button>
            <button type="button" className="lab-chip" onClick={() => setPayload(JSON.stringify(sampleCasualty(), null, 2))}>Reset sample</button>
          </div>
          <textarea className="lab-payload mono" value={payload} onChange={(e) => setPayload(e.target.value)} spellCheck={false} />
        </div>
      )}

      <div className="lab-run-row">
        <label className="lab-outage"><input type="checkbox" checked={outage} onChange={(e) => setOutage(e.target.checked)} /> Simulate EHR outage</label>
        <button type="button" className="btn primary" onClick={run} disabled={busy}>{busy ? 'Running…' : 'Run request'}</button>
      </div>

      {outcome && <OutcomeView outcome={outcome} />}
    </div>
  )
}

// ── Top-level console ────────────────────────────────────────────────────────
export function EhrTestConsole({ record, onClose }: { record: CasualtyRecord; onClose: () => void }) {
  const scenarios = useMemo(buildScenarios, [])
  const [tab, setTab] = useState<'suite' | 'manual'>('suite')
  const [results, setResults] = useState<Record<string, Outcome>>({})
  const [running, setRunning] = useState(false)

  async function runOne(s: Scenario) {
    const outcome = await s.run()
    setResults((r) => ({ ...r, [s.id]: outcome }))
    return outcome
  }
  async function runAll() {
    setRunning(true)
    setResults({})
    for (const s of scenarios) await runOne(s)
    setRunning(false)
  }

  const ran = scenarios.filter((s) => results[s.id])
  const passedCount = ran.filter((s) => { const o = results[s.id]; return o.checks.every((c) => c.pass) }).length
  const groups = [...new Set(scenarios.map((s) => s.group))]

  return (
    <div className="lab-overlay" onClick={onClose}>
      <div className="lab" onClick={(e) => e.stopPropagation()}>
        <header className="lab-head">
          <div>
            <h2>🧪 EHR Integration Test Lab</h2>
            <p className="lab-sub">Runs the real <code>MockGateway</code> in-browser — stubbed PCR / Send-to-EHR, fully offline. No ONE ID or backend.</p>
          </div>
          <button type="button" className="topbtn" onClick={onClose}>Close</button>
        </header>

        <div className="lab-tabs">
          <button type="button" className={tab === 'suite' ? 'on' : ''} onClick={() => setTab('suite')}>Scenario suite</button>
          <button type="button" className={tab === 'manual' ? 'on' : ''} onClick={() => setTab('manual')}>Manual console</button>
        </div>

        {tab === 'suite' && (
          <div className="lab-suite">
            <div className="lab-suite-bar">
              <button type="button" className="btn primary" onClick={runAll} disabled={running}>{running ? 'Running…' : '▶ Run all'}</button>
              {ran.length > 0 && (
                <span className={`lab-summary ${passedCount === ran.length ? 'ok' : 'bad'}`}>
                  {passedCount}/{ran.length} scenarios passed
                </span>
              )}
              <span className="lab-tip">Each scenario shows its request, the generated FHIR, the audit event, and the response.</span>
            </div>

            {groups.map((g) => (
              <section key={g} className="lab-group">
                <h3>{g}</h3>
                {scenarios.filter((s) => s.group === g).map((s) => {
                  const o = results[s.id]
                  const status = !o ? 'idle' : o.checks.every((c) => c.pass) ? 'pass' : 'fail'
                  return (
                    <div key={s.id} className={`lab-row ${status}`}>
                      <div className="lab-row-head">
                        <span className={`lab-pill ${status}`}>{status === 'idle' ? '—' : status === 'pass' ? 'PASS' : 'FAIL'}</span>
                        <div className="lab-row-meta">
                          <div className="lab-row-title">{s.title}</div>
                          <div className="lab-row-desc">{s.desc}</div>
                        </div>
                        <button type="button" className="btn" onClick={() => runOne(s)}>Run</button>
                      </div>
                      {o && <OutcomeView outcome={o} />}
                    </div>
                  )
                })}
              </section>
            ))}
          </div>
        )}

        {tab === 'manual' && <ManualConsole record={record} />}

        <footer className="lab-foot">
          <b>Server-side testing with Swagger:</b> run the sync-service with <code>EHR_ALLOW_MOCK=true npm start</code> and open
          <code> /docs</code> for interactive Swagger UI over the same routes (<code>POST /ehr/handover</code>, <code>POST /ehr/patient/$match</code>, …) — “Try it out” hits the stubbed gateway over HTTP.
        </footer>
      </div>
    </div>
  )
}
