import { useEffect, useRef, useState } from 'react'
import {
  type CasualtyRecord, type InjuryTypeKey, type TriageCategory,
  type VitalSign, type Treatment, type TreatmentPlace,
  createEmptyRecord, TRIAGE_LABELS, TRIAGE_COLORS,
  AGE_BAND_ORDER, AGE_BAND_LABELS, estimateBurnTBSA,
  ageFromDob, ageBandFromDob,
  GCS_EYE, GCS_VERBAL, GCS_MOTOR, formatGcs,
  genCaseId, genLocalId,
  INJURY_TYPES, injuryColor, injuryLabel,
  toFhirBundle,
} from '@triage-link/core'
import { recordRepo } from './db/repository'
import { exportAll, parseBackup, importBackup, type Backup, type ImportMode } from './db/backup'
import { BodyChart, type NewInjuryPlacement } from './components/BodyChart'
import { CasualtySummary } from './components/CasualtySummary'
import { TriageBoard } from './components/TriageBoard'
import { capturePhoto } from './photo'
import { PhotoLightbox } from './components/PhotoLightbox'
import { Tip, OfflineBanner, InstallPrompt, useDismissed } from './components/hints'
import { Tutorial } from './components/Tutorial'
import { PcrVerify } from './components/PcrVerify'
import { contributeHandover, EhrUnavailableError } from './ehr/client'

const TRIAGE_ORDER: TriageCategory[] = ['immediate', 'delayed', 'minor', 'deceased']
const VITALS_META: Record<'hr' | 'bp' | 'rr' | 'spo2' | 'gcs' | 'pain', { label: string; name: string; ph: string }> = {
  hr: { label: 'HR', name: 'Heart rate', ph: 'bpm' },
  bp: { label: 'BP', name: 'Blood pressure', ph: '120/80' },
  rr: { label: 'RR', name: 'Respiratory rate', ph: '/min' },
  spo2: { label: 'SpO₂', name: 'Oxygen saturation', ph: '%' },
  gcs: { label: 'GCS', name: 'Glasgow Coma Scale', ph: '3–15' },
  pain: { label: 'Pain', name: 'Pain score', ph: '0–10' },
}
const TREATMENT_TYPES = [
  'Tourniquet', 'Hemostatic dressing', 'Pressure dressing', 'Airway (NPA/OPA)',
  'Needle decompression', 'IV access / fluids', 'Medication', 'Splint / immobilisation',
  'Wound packing', 'Burn cooling', 'CPR', 'Other',
]

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function App() {
  const [record, setRecord] = useState<CasualtyRecord>(() => createEmptyRecord(genCaseId()))
  const [saved, setSaved] = useState<CasualtyRecord[]>([])
  const [activeType, setActiveType] = useState<InjuryTypeKey>('laceration')
  const [selectedInjury, setSelectedInjury] = useState<string | null>(null)
  const [showSummary, setShowSummary] = useState(false)
  const [showBoard, setShowBoard] = useState(false)
  const [ehrStatus, setEhrStatus] = useState('')
  const [lightbox, setLightbox] = useState<{ photos: string[]; index: number } | null>(null)
  const [photoError, setPhotoError] = useState('')
  const [showTour, setShowTour] = useState(false)
  const [tourOffered, dismissTourOffer] = useDismissed('tour-offered')
  const [backupMsg, setBackupMsg] = useState('')
  const [pendingImport, setPendingImport] = useState<{ backup: Backup; count: number } | null>(null)
  const saveTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    recordRepo.list().then(setSaved)
  }, [])

  function persist(next: CasualtyRecord) {
    setRecord(next)
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(async () => {
      await recordRepo.save(next)
      setSaved(await recordRepo.list())
    }, 400)
  }

  // ---- mutators ----
  const setTomb = (key: keyof CasualtyRecord['tombstone'], value: string) =>
    persist({ ...record, tombstone: { ...record.tombstone, [key]: value } })
  const applyTomb = (patch: Partial<CasualtyRecord['tombstone']>) =>
    persist({ ...record, tombstone: { ...record.tombstone, ...patch } })
  const setInc = (key: keyof CasualtyRecord['incident'], value: string) =>
    persist({ ...record, incident: { ...record.incident, [key]: value } })
  // Entering a DOB auto-derives the Lund–Browder age band (clinician can still
  // override it manually afterwards); clearing the DOB leaves the band as-is.
  function setDob(value: string) {
    const band = ageBandFromDob(value, Date.now())
    persist({
      ...record,
      tombstone: { ...record.tombstone, dob: value },
      incident: { ...record.incident, ...(band ? { ageBand: band } : {}) },
    })
  }

  function placeInjury(p: NewInjuryPlacement) {
    const id = genLocalId('inj-')
    persist({
      ...record,
      injuries: [...record.injuries, { id, ...p, type: activeType, severity: 'moderate', notes: '', photos: [] }],
    })
    setSelectedInjury(id)
  }
  const removeInjury = (id: string) =>
    persist({ ...record, injuries: record.injuries.filter((i) => i.id !== id) })
  function updateInjury(id: string, patch: Partial<CasualtyRecord['injuries'][number]>) {
    persist({ ...record, injuries: record.injuries.map((i) => (i.id === id ? { ...i, ...patch } : i)) })
  }
  async function addPhoto(id: string) {
    try {
      const dataUrl = await capturePhoto()
      if (!dataUrl) return
      const inj = record.injuries.find((i) => i.id === id)
      if (inj) updateInjury(id, { photos: [...inj.photos, dataUrl] })
    } catch {
      setPhotoError('Couldn’t capture a photo — allow camera access in your browser/app settings.')
      window.setTimeout(() => setPhotoError(''), 6000)
    }
  }
  const removePhoto = (id: string, idx: number) => {
    const inj = record.injuries.find((i) => i.id === id)
    if (inj) updateInjury(id, { photos: inj.photos.filter((_, i) => i !== idx) })
  }

  const addVital = (v: Omit<VitalSign, 'id' | 'takenAt'>) =>
    persist({ ...record, vitals: [...record.vitals, { id: genLocalId('v-'), takenAt: Date.now(), ...v }] })
  const removeVital = (id: string) =>
    persist({ ...record, vitals: record.vitals.filter((v) => v.id !== id) })

  const addTreatment = (t: Omit<Treatment, 'id' | 'performedAt'>) =>
    persist({ ...record, treatments: [...record.treatments, { id: genLocalId('t-'), performedAt: Date.now(), ...t }] })
  const removeTreatment = (id: string) =>
    persist({ ...record, treatments: record.treatments.filter((t) => t.id !== id) })

  function newCase() {
    setSelectedInjury(null)
    const fresh = createEmptyRecord(genCaseId())
    setRecord(fresh)
  }
  async function loadCase(id: string) {
    const r = await recordRepo.get(id)
    if (r) { setRecord(r); setSelectedInjury(null) }
  }
  async function deleteCase(id: string) {
    await recordRepo.remove(id)
    setSaved(await recordRepo.list())
    if (id === record.id) newCase()
  }

  // ---- backup / restore (all records) ----
  const flashBackup = (msg: string) => { setBackupMsg(msg); window.setTimeout(() => setBackupMsg(''), 5000) }
  async function exportAllRecords() {
    try {
      const backup = await exportAll()
      const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `triage-link-backup-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      flashBackup(`Backed up ${backup.records.length} record${backup.records.length === 1 ? '' : 's'}.`)
    } catch { flashBackup('Backup failed.') }
  }
  function pickBackupFile() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json,.json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      try {
        const backup = parseBackup(await file.text())
        setPendingImport({ backup, count: backup.records.length })
      } catch (e) { flashBackup((e as Error).message) }
    }
    input.click()
  }
  async function runImport(mode: ImportMode) {
    if (!pendingImport) return
    try {
      const n = await importBackup(pendingImport.backup, mode)
      setSaved(await recordRepo.list())
      flashBackup(`Imported ${n} record${n === 1 ? '' : 's'} (${mode}).`)
    } catch { flashBackup('Import failed.') }
    setPendingImport(null)
  }

  async function sendToEhr() {
    setEhrStatus('Sending…')
    try {
      const res = await contributeHandover(record)
      setEhrStatus(res.accepted ? `Sent ✓ (${res.provider}${res.id ? ` · ${res.id}` : ''})` : 'Rejected')
    } catch (err) {
      setEhrStatus(err instanceof EhrUnavailableError ? 'EHR unreachable' : `Failed: ${(err as Error).message}`)
    }
    window.setTimeout(() => setEhrStatus(''), 5000)
  }

  function exportFhir() {
    const bundle = toFhirBundle(record)
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/fhir+json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${record.id}-fhir-bundle.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const selected = record.injuries.find((i) => i.id === selectedInjury) ?? null
  const triage = record.incident.triage
  const tbsa = estimateBurnTBSA(record.injuries, record.incident.ageBand)
  const dobAge = ageFromDob(record.tombstone.dob, Date.now())

  return (
    <>
    <div className="app">
      <header className="topbar">
        <div className="brand"><span className="mark">◇ TRIAGE-LINK</span><span className="sub">Field Casualty Record</span></div>
        <div className="pid">CASE <b>{record.id}</b></div>
        <button className="topbtn" onClick={newCase} title="Start a fresh record (the current one is auto-saved)">+ New casualty</button>
        <button className="topbtn" data-tour="board" onClick={() => setShowBoard(true)} title="All saved casualties grouped by triage (scene picture)">🚩 Board{saved.length > 0 ? ` · ${saved.length}` : ''}</button>
        <button className="topbtn" data-tour="summary" onClick={() => setShowSummary(true)} title="One-page casualty card — print or save as PDF for handover">🖨 Summary</button>
        <button className="topbtn" onClick={() => setShowTour(true)} title="Replay the guided tour">❔ Tour</button>
        <button className="topbtn" onClick={sendToEhr} title="Contribute this handover to the provincial EHR">Send to EHR ↑</button>
        <button className="topbtn primary" onClick={exportFhir} title="Download an interoperable FHIR record">Export FHIR ↓</button>
        {ehrStatus && <span className="ehr-status">{ehrStatus}</span>}
      </header>

      {/* Prominent, always-visible triage tag (acuity channel, distinct from
          injury-type marker colours). Quick-set here; persists on the record. */}
      <div
        className="triagebar"
        data-tour="triage"
        style={triage ? { background: `color-mix(in srgb, ${TRIAGE_COLORS[triage]} 16%, var(--panel))` } : undefined}
      >
        <span className="tb-label">Triage</span>
        <div className="tb-opts" role="group" aria-label="Triage category">
          {TRIAGE_ORDER.map((t) => (
            <button
              key={t}
              type="button"
              className={`tb-opt${triage === t ? ' on' : ''}`}
              style={triage === t ? { background: TRIAGE_COLORS[t], borderColor: TRIAGE_COLORS[t], color: '#0c0c0c' } : undefined}
              onClick={() => setInc('triage', t)}
              title={TRIAGE_LABELS[t]}
            >
              <span className="sw" style={{ background: TRIAGE_COLORS[t] }} />
              {TRIAGE_LABELS[t].split(' ')[0]}
            </button>
          ))}
        </div>
        <span className="tb-current" style={triage ? { color: TRIAGE_COLORS[triage] } : undefined}>
          {triage ? TRIAGE_LABELS[triage] : 'Not set — tap a level'}
        </span>
      </div>

      <OfflineBanner />
      <InstallPrompt />
      {!tourOffered && !showTour && (
        <div className="tour-offer">
          <span>👋 New here? Take a 60-second guided tour with voice-over.</span>
          <span className="tour-offer-actions">
            <button type="button" className="btn primary" onClick={() => { setShowTour(true); dismissTourOffer() }}>Start tour</button>
            <button type="button" className="tip-x" aria-label="Dismiss" onClick={dismissTourOffer}>×</button>
          </span>
        </div>
      )}

      <div className="wrap">
        <main>
          {/* ---- injury chart ---- */}
          <section className="panel">
            <div className="chart-head">
              <h2>Injury chart — anterior / posterior</h2>
              <div className="palette" data-tour="palette">
                {INJURY_TYPES.map((t) => (
                  <button
                    key={t.key}
                    className={`tool${t.key === activeType ? ' active' : ''}`}
                    style={t.key === activeType ? { color: t.color } : undefined}
                    onClick={() => setActiveType(t.key)}
                  >
                    <span className="dot" style={{ background: t.color }} />{t.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="charts" data-tour="charts">
              <BodyChart view="anterior" injuries={record.injuries} selectedId={selectedInjury} onPlace={placeInjury} onSelect={setSelectedInjury} />
              <BodyChart view="posterior" injuries={record.injuries} selectedId={selectedInjury} onPlace={placeInjury} onSelect={setSelectedInjury} />
            </div>
            <p className="hint">Pick an injury type · tap a body area to blow it up · tap again to drop a marker. Tap a marker to edit it below.</p>
            <div className="hintwrap">
              <Tip id="chart-flow">After dropping a marker, tap it to set <b>severity</b>, add notes, and <b>📷 attach wound photos</b>. When zoomed in, use <b>← Full body</b> to zoom back out.</Tip>
            </div>
          </section>

          {/* ---- injury list / editor ---- */}
          <section className="panel">
            <div className="panel-h">
              <h2>Logged injuries</h2>
              {tbsa > 0 && (
                <span className="tbsa" title={`Burn TBSA · Lund–Browder, ${AGE_BAND_LABELS[record.incident.ageBand]}`}>
                  🔥 {tbsa}% TBSA
                </span>
              )}
              <span className="count">{record.injuries.length}</span>
            </div>
            <div className="panel-b">
              {record.injuries.length === 0 && <div className="empty">No injuries marked yet.</div>}
              {record.injuries.map((i) => (
                <div className={`row${i.id === selectedInjury ? ' on' : ''}`} key={i.id}>
                  <span className="tag" style={{ background: injuryColor(i.type) }} />
                  <div className="body" onClick={() => setSelectedInjury(i.id)}>
                    <div className="ttl">{injuryLabel(i.type)} · <span className="dim">{i.severity}</span></div>
                    <div className="meta">{i.region} · {i.view}{i.notes ? ` · ${i.notes}` : ''}</div>
                  </div>
                  <button className="x" onClick={() => removeInjury(i.id)}>×</button>
                </div>
              ))}
              {selected && (
                <div className="editor" data-tour="editor">
                  <div className="sev">
                    {(['minor', 'moderate', 'severe', 'critical'] as const).map((s) => (
                      <button key={s} className={selected.severity === s ? 'on' : ''} onClick={() => updateInjury(selected.id, { severity: s })}>{s}</button>
                    ))}
                  </div>
                  <input
                    placeholder="Notes — size, depth, contamination…"
                    value={selected.notes}
                    onChange={(e) => updateInjury(selected.id, { notes: e.target.value })}
                  />
                  <div className="photos">
                    <button type="button" className="addphoto" onClick={() => addPhoto(selected.id)}>📷 Add photo</button>
                    {selected.photos.length === 0 && !photoError && <span className="hint-inline">Photograph the wound — saved with this injury</span>}
                    {photoError && <span className="hint-inline photo-err">{photoError}</span>}
                    {selected.photos.map((src, i) => (
                      <div className="thumb" key={i}>
                        <img src={src} alt={`injury photo ${i + 1}`} onClick={() => setLightbox({ photos: selected.photos, index: i })} />
                        <button type="button" className="rm" aria-label="Remove photo" onClick={() => removePhoto(selected.id, i)}>×</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {!selected && record.injuries.length > 0 && (
                <div className="hint-inline select-hint">Tap an injury marker (or a row above) to edit it or attach a 📷 photo.</div>
              )}
            </div>
          </section>

          <TreatmentPanel onAdd={addTreatment} treatments={record.treatments} onRemove={removeTreatment} />
        </main>

        <aside>
          {/* ---- tombstone ---- */}
          <section className="panel">
            <div className="panel-h"><h2>Tombstone — identity</h2></div>
            <div className="panel-b grid2">
              <label className="field col2"><span>Full name</span><input value={record.tombstone.name} onChange={(e) => setTomb('name', e.target.value)} placeholder="Surname, Given" /></label>
              <label className="field"><span>Date of birth</span><input type="date" value={record.tombstone.dob} onChange={(e) => setDob(e.target.value)} /></label>
              <label className="field"><span>Sex</span>
                <select value={record.tombstone.sex} onChange={(e) => setTomb('sex', e.target.value)}>
                  <option value="">—</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option><option value="unknown">Unknown</option>
                </select>
              </label>
              <label className="field"><span>Patient ID / MRN</span><input className="mono" value={record.tombstone.mrn} onChange={(e) => setTomb('mrn', e.target.value)} /></label>
              <label className="field"><span>Blood type</span><input value={record.tombstone.bloodType} onChange={(e) => setTomb('bloodType', e.target.value)} placeholder="Unknown" /></label>
              <label className="field"><span>Next of kin</span><input value={record.tombstone.nextOfKin} onChange={(e) => setTomb('nextOfKin', e.target.value)} /></label>
              <label className="field"><span>NOK phone</span><input className="mono" value={record.tombstone.nextOfKinPhone} onChange={(e) => setTomb('nextOfKinPhone', e.target.value)} /></label>
            </div>
            <div className="panel-b">
              <PcrVerify tombstone={record.tombstone} onApply={applyTomb} />
            </div>
          </section>

          {/* ---- incident (triage lives in the header tag) ---- */}
          <section className="panel">
            <div className="panel-h"><h2>Incident</h2></div>
            <div className="panel-b grid2">
              <label className="field"><span>Time of injury</span><input type="datetime-local" value={record.incident.injuryTime} onChange={(e) => setInc('injuryTime', e.target.value)} /></label>
              <label className="field"><span>Mechanism</span><input value={record.incident.mechanism} onChange={(e) => setInc('mechanism', e.target.value)} placeholder="Blunt, RTC, GSW…" /></label>
              <label className="field col2"><span>Location of incident</span><input value={record.incident.location} onChange={(e) => setInc('location', e.target.value)} placeholder="Address / grid / GPS" /></label>
              <div className="field col2"><span>Age band <em>· adjusts burn TBSA (Lund–Browder)</em>
                {dobAge != null && <em className="derived">· {dobAge}y from DOB</em>}</span>
                <div className="ageband" role="group" aria-label="Patient age band">
                  {AGE_BAND_ORDER.map((b) => (
                    <button key={b} type="button" className={record.incident.ageBand === b ? 'on' : ''} onClick={() => setInc('ageBand', b)}>
                      {AGE_BAND_LABELS[b]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <VitalsPanel onAdd={addVital} vitals={record.vitals} onRemove={removeVital} />

          {/* ---- saved ---- */}
          <section className="panel">
            <div className="panel-h"><h2>Saved casualties</h2>
              <button type="button" className="minibtn" onClick={exportAllRecords} title="Download a backup file of every saved record">⬇ Backup</button>
              <button type="button" className="minibtn" onClick={pickBackupFile} title="Restore records from a backup file">⬆ Restore</button>
              <span className="count">{saved.length}</span>
            </div>
            <div className="panel-b">
              {backupMsg && <div className="backup-msg">{backupMsg}</div>}
              {pendingImport && (
                <div className="import-confirm">
                  <span>Import {pendingImport.count} record{pendingImport.count === 1 ? '' : 's'}?</span>
                  <span className="import-actions">
                    <button type="button" className="btn" onClick={() => runImport('merge')} title="Add these records, keeping the newer copy of any duplicates">Merge</button>
                    <button type="button" className="btn danger" onClick={() => runImport('replace')} title="Delete all current records first, then import">Replace all</button>
                    <button type="button" className="tip-x" aria-label="Cancel import" onClick={() => setPendingImport(null)}>×</button>
                  </span>
                </div>
              )}
              {saved.length === 0 && <div className="empty">Records auto-save as you type.</div>}
              {saved.length > 1 && (
                <Tip id="handover-features">🚩 <b>Board</b> (top bar) shows every casualty grouped by triage · 🖨 <b>Summary</b> prints a one-page handover card.</Tip>
              )}
              {saved.map((r) => (
                <div className={`rec${r.id === record.id ? ' active' : ''}`} key={r.id}>
                  <span className="tri" style={{ background: r.incident.triage ? TRIAGE_COLORS[r.incident.triage] : '#2A3340' }} />
                  <div onClick={() => loadCase(r.id)} style={{ flex: 1, cursor: 'pointer' }}>
                    <div className="nm">{r.tombstone.name || 'Unidentified'}{r.handover ? ' · handed over' : ''}</div>
                    <div className="mt">{r.id} · {r.injuries.length} inj · {fmtTime(r.updatedAt)}</div>
                  </div>
                  <button className="x" onClick={() => deleteCase(r.id)}>×</button>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>

      <p className="footnote">Prototype — not a medical device, not for clinical use. Data is stored locally on this device only.</p>
    </div>
    {showSummary && <CasualtySummary record={record} onClose={() => setShowSummary(false)} />}
    {showBoard && (
      <TriageBoard records={saved} currentId={record.id} onSelect={loadCase} onClose={() => setShowBoard(false)} />
    )}
    {lightbox && (
      <PhotoLightbox photos={lightbox.photos} index={lightbox.index} onClose={() => setLightbox(null)} />
    )}
    {showTour && (
      <Tutorial
        signals={{ hasInjury: record.injuries.length > 0, hasTriage: !!record.incident.triage }}
        onClose={() => setShowTour(false)}
      />
    )}
    </>
  )
}

// ---- vitals sub-panel ----
function VitalsPanel({ vitals, onAdd, onRemove }: {
  vitals: VitalSign[]
  onAdd: (v: Omit<VitalSign, 'id' | 'takenAt'>) => void
  onRemove: (id: string) => void
}) {
  const [f, setF] = useState({ hr: '', bp: '', rr: '', spo2: '', gcs: '', pain: '' })
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }))
  function submit() {
    if (!Object.values(f).some(Boolean)) return
    onAdd({ ...f })
    setF({ hr: '', bp: '', rr: '', spo2: '', gcs: '', pain: '' })
  }
  return (
    <section className="panel" data-tour="vitals">
      <div className="panel-h"><h2>Vitals</h2><span className="count">{vitals.length}</span></div>
      <div className="panel-b">
        <div className="grid3">
          {(['hr', 'bp', 'rr', 'spo2', 'gcs', 'pain'] as const).map((k) => (
            <label className="field" key={k} title={`${VITALS_META[k].name} (${VITALS_META[k].ph})`}>
              <span>{VITALS_META[k].label}</span>
              <input className="mono" value={f[k]} onChange={(e) => set(k, e.target.value)} placeholder={VITALS_META[k].ph} />
            </label>
          ))}
        </div>
        <GcsCalc value={f.gcs} onChange={(v) => set('gcs', v)} />
        <button className="btn full" onClick={submit}>Record vitals</button>
        {vitals.length === 0 && <p className="hint-inline panel-hint">Enter any fields and tap Record — log a fresh timestamped set at each reassessment.</p>}
        {vitals.slice().reverse().map((v) => (
          <div className="row" key={v.id}>
            <div className="body">
              <div className="chips">
                {v.hr && <span>HR {v.hr}</span>}{v.bp && <span>BP {v.bp}</span>}{v.rr && <span>RR {v.rr}</span>}
                {v.spo2 && <span>SpO₂ {v.spo2}</span>}{v.gcs && <span>GCS {v.gcs}</span>}{v.pain && <span>Pain {v.pain}</span>}
              </div>
              <div className="meta">{fmtTime(v.takenAt)}</div>
            </div>
            <button className="x" onClick={() => onRemove(v.id)}>×</button>
          </div>
        ))}
      </div>
    </section>
  )
}

// ---- GCS calculator: E/V/M selectors that compute the total into the vitals
// GCS field as e.g. "14 (E4 V4 M6)". Collapsed by default. ----
function GcsCalc({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [e, setE] = useState(4)
  const [v, setV] = useState(5)
  const [m, setM] = useState(6)
  const apply = (ne: number, nv: number, nm: number) => { setE(ne); setV(nv); setM(nm); onChange(formatGcs(ne, nv, nm)) }
  const total = e + v + m
  return (
    <details className="gcs-calc">
      <summary>GCS calculator <span className="gcs-total">{value ? value : `= ${total}`}</span></summary>
      <div className="gcs-rows">
        <label className="field"><span>Eye (E)</span>
          <select aria-label="GCS eye" value={e} onChange={(ev) => apply(+ev.target.value, v, m)}>
            {GCS_EYE.map((o) => <option key={o.score} value={o.score}>{o.score} · {o.label}</option>)}
          </select>
        </label>
        <label className="field"><span>Verbal (V)</span>
          <select aria-label="GCS verbal" value={v} onChange={(ev) => apply(e, +ev.target.value, m)}>
            {GCS_VERBAL.map((o) => <option key={o.score} value={o.score}>{o.score} · {o.label}</option>)}
          </select>
        </label>
        <label className="field"><span>Motor (M)</span>
          <select aria-label="GCS motor" value={m} onChange={(ev) => apply(e, v, +ev.target.value)}>
            {GCS_MOTOR.map((o) => <option key={o.score} value={o.score}>{o.score} · {o.label}</option>)}
          </select>
        </label>
      </div>
    </details>
  )
}

// ---- treatment sub-panel ----
function TreatmentPanel({ treatments, onAdd, onRemove }: {
  treatments: Treatment[]
  onAdd: (t: Omit<Treatment, 'id' | 'performedAt'>) => void
  onRemove: (id: string) => void
}) {
  const [type, setType] = useState(TREATMENT_TYPES[0])
  const [detail, setDetail] = useState('')
  const [place, setPlace] = useState<TreatmentPlace>('scene')
  const [provider, setProvider] = useState('')
  function submit() {
    onAdd({ type, detail, place, provider })
    setDetail('')
  }
  return (
    <section className="panel">
      <div className="panel-h"><h2>Treatment log</h2><span className="count">{treatments.length}</span></div>
      <div className="panel-b grid2">
        <label className="field col2"><span>Intervention</span>
          <select value={type} onChange={(e) => setType(e.target.value)}>{TREATMENT_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
        </label>
        <label className="field col2"><span>Detail (dose / route / site)</span><input value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="e.g. Morphine 10mg IM" /></label>
        <label className="field"><span>Location</span>
          <select value={place} onChange={(e) => setPlace(e.target.value as TreatmentPlace)}>
            <option value="scene">At scene</option><option value="enroute">En route</option><option value="handover">At handover</option>
          </select>
        </label>
        <label className="field"><span>Provider</span><input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="Initials / unit" /></label>
        <div className="col2"><button className="btn full" onClick={submit}>Log intervention</button></div>
        <div className="col2">
          {treatments.length === 0 && <p className="hint-inline panel-hint">Logged interventions appear here with time, place, and provider.</p>}
          {treatments.slice().reverse().map((t) => (
            <div className="row" key={t.id}>
              <span className="tag" style={{ background: '#3FE08A' }} />
              <div className="body">
                <div className="ttl">{t.type}{t.detail ? ` — ${t.detail}` : ''}</div>
                <div className="meta">{fmtTime(t.performedAt)} · {t.place}{t.provider ? ` · ${t.provider}` : ''}</div>
              </div>
              <button className="x" onClick={() => onRemove(t.id)}>×</button>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
