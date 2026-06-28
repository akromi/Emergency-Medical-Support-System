import { useEffect, useRef, useState } from 'react'
import {
  type CasualtyRecord, type InjuryTypeKey, type TriageCategory,
  type VitalSign, type Treatment, type TreatmentPlace, type Handover,
  createEmptyRecord, TRIAGE_COLORS,
  AGE_BAND_ORDER, AGE_BAND_LABELS, estimateBurnTBSA,
  ageFromDob, ageBandFromDob,
  GCS_EYE, GCS_VERBAL, GCS_MOTOR, formatGcs,
  genCaseId, genLocalId,
  INJURY_TYPES, injuryColor,
  toFhirBundle, toHandoverBundle,
} from '@triage-link/core'
import { recordRepo } from './db/repository'
import { exportAll, exportEncrypted, readBackupFile, decryptBackup, importBackup, type Backup, type ImportMode } from './db/backup'
import { recordsToCsv, csvToRecords } from './db/csv'
import { BodyChart, type NewInjuryPlacement } from './components/BodyChart'
import { CasualtySummary } from './components/CasualtySummary'
import { TriageBoard } from './components/TriageBoard'
import { capturePhoto } from './photo'
import { PhotoLightbox } from './components/PhotoLightbox'
import { Tip, OfflineBanner, InstallPrompt, useDismissed } from './components/hints'
import { Tutorial } from './components/Tutorial'
import { DeploymentBar } from './components/DeploymentBar'
import { getDeployment } from './db/deployment'
import { Elapsed } from './components/Elapsed'
import { VitalsTrend } from './components/VitalsTrend'
import { EhrTestConsole } from './components/EhrTestConsole'
import { PcrVerify } from './components/PcrVerify'
import { contributeHandover, EhrUnavailableError } from './ehr/client'
import { LockScreen, useVaultState } from './components/VaultLock'
import { initVault, enableVault, disableVault, lock as lockVault, noteActivity, isRequired } from './db/vault'
import { audit } from './db/audit'
import { requireStepUp } from './db/stepup'
import { AuditLog } from './components/AuditLog'
import { OperatorPanel, useOperators } from './components/OperatorPanel'
import { initOperators, canViewAdmin } from './db/operators'
import { useLang, regionLabel, nextLang, registerLanguage, saveLanguagePack, templatePack } from './i18n'

const TRIAGE_ORDER: TriageCategory[] = ['immediate', 'delayed', 'minor', 'deceased']
// The EHR Test Lab is developer/QA furniture (offline, mock-only). It is gated
// on `import.meta.env.DEV`, so production builds tree-shake the whole console
// (and its mock gateway) out of the bundle — there is no production URL flag
// or other way to reach it.
const VITALS_KEYS = ['hr', 'bp', 'rr', 'spo2', 'gcs', 'pain'] as const
const VITALS_PH: Record<(typeof VITALS_KEYS)[number], string> = {
  hr: 'bpm', bp: '120/80', rr: '/min', spo2: '%', gcs: '3–15', pain: '0–10',
}
// Canonical (language-neutral) treatment keys; labels are translated at render.
const TREATMENT_TYPES = [
  'Tourniquet', 'Hemostatic dressing', 'Pressure dressing', 'Airway (NPA/OPA)',
  'Needle decompression', 'IV access / fluids', 'Medication', 'Splint / immobilisation',
  'Wound packing', 'Burn cooling', 'CPR', 'Other',
]

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function App() {
  const { t, lang, setLang } = useLang()
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
  const [showEhrLab, setShowEhrLab] = useState(false)
  const [showAudit, setShowAudit] = useState(false)
  const [showOperators, setShowOperators] = useState(false)
  const [langMsg, setLangMsg] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [tourOffered, dismissTourOffer] = useDismissed('tour-offered')
  const [backupMsg, setBackupMsg] = useState('')
  const [pendingImport, setPendingImport] = useState<{ backup: Backup; count: number } | null>(null)
  const saveTimer = useRef<number | undefined>(undefined)
  const vaultState = useVaultState()
  const { active: activeOperator } = useOperators()

  useEffect(() => {
    initVault()
    initOperators()
  }, [])

  // The saved list follows vault state: hidden while locked (records are sealed
  // and unreadable), (re)loaded once the vault is unlocked or disabled.
  useEffect(() => {
    if (vaultState === 'locked' || vaultState === 'setup') { setSaved([]); return }
    recordRepo.list().then(setSaved)
  }, [vaultState])

  // Auto-lock: any interaction resets the vault inactivity timer; when it
  // fires the key is dropped and the lock screen reappears. Cheap no-op while
  // the vault is locked/disabled (noteActivity only re-arms when unlocked).
  useEffect(() => {
    if (vaultState !== 'unlocked') return
    const onActivity = () => noteActivity()
    window.addEventListener('pointerdown', onActivity)
    window.addEventListener('keydown', onActivity)
    return () => {
      window.removeEventListener('pointerdown', onActivity)
      window.removeEventListener('keydown', onActivity)
    }
  }, [vaultState])

  // ---- photo vault (encrypt wound photos at rest) ----
  async function enablePhotoVault() {
    if (!(await guard('vault.enable'))) { setMenuOpen(false); return }
    const pass = window.prompt(t('vault.enablePrompt'))
    if (pass == null) return
    if (pass.length < 8) { flashBackup(t('backup.passShort')); return }
    try {
      await enableVault(pass)
      setSaved(await recordRepo.list())
      flashBackup(t('vault.enabled'))
    } catch { flashBackup('Could not enable the vault.') }
    setMenuOpen(false)
  }
  async function disablePhotoVault() {
    if (!(await guard('vault.disable'))) { setMenuOpen(false); return }
    const pass = window.prompt(t('vault.disablePrompt'))
    if (pass == null) return
    try {
      const ok = await disableVault(pass)
      flashBackup(ok ? t('vault.disabled') : t('vault.wrong'))
    } catch { flashBackup('Could not disable the vault.') }
    setMenuOpen(false)
  }

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
      setPhotoError(t('inj.photoerr'))
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

  const setHandover = (h: Handover | null) => persist({ ...record, handover: h })

  function newCase() {
    setSelectedInjury(null)
    const fresh = createEmptyRecord(genCaseId())
    setRecord(fresh)
  }
  async function loadCase(id: string) {
    const r = await recordRepo.get(id)
    if (r) { setRecord(r); setSelectedInjury(null); audit('record.view', { recordId: id }) }
  }
  async function deleteCase(id: string) {
    if (!(await guard('record.delete'))) return
    await recordRepo.remove(id)
    setSaved(await recordRepo.list())
    if (id === record.id) newCase()
  }

  // ---- backup / restore (all records) ----
  const flashBackup = (msg: string) => { setBackupMsg(msg); window.setTimeout(() => setBackupMsg(''), 5000) }
  // Step-up re-auth gate: sensitive actions re-prompt for the on-duty operator's
  // PIN ("login password"). A no-op when the roster is empty or the operator has
  // no PIN. On denial we flash a toast and the caller aborts.
  async function guard(action: string): Promise<boolean> {
    const ok = await requireStepUp(t, action)
    if (!ok) flashBackup(t('auth.denied'))
    return ok
  }
  const backupName = (suffix: string) => `triage-link-backup${suffix}-${new Date().toISOString().slice(0, 10)}.json`
  async function exportAllRecords() {
    if (!(await guard('backup.export'))) return
    try {
      const backup = await exportAll()
      downloadJson(backup, backupName(''))
      audit('backup.create')
      flashBackup(`Backed up ${backup.records.length} record${backup.records.length === 1 ? '' : 's'}.`)
    } catch { flashBackup('Backup failed.') }
  }
  async function exportEncryptedRecords() {
    if (!(await guard('backup.export.enc'))) return
    const pass = window.prompt(t('backup.encPrompt'))
    if (pass == null) return // cancelled
    if (pass.length < 8) { flashBackup(t('backup.passShort')); return }
    try {
      const env = await exportEncrypted(pass)
      downloadJson(env, backupName('-encrypted'))
      audit('backup.create', { detail: 'encrypted' })
      flashBackup(t('backup.encDone'))
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
        const res = readBackupFile(await file.text())
        if (res.encrypted) {
          const pass = window.prompt(t('backup.decPrompt'))
          if (pass == null) return // cancelled
          const backup = await decryptBackup(res.env, pass)
          setPendingImport({ backup, count: backup.records.length })
        } else {
          setPendingImport({ backup: res.backup, count: res.backup.records.length })
        }
      } catch (e) { flashBackup((e as Error).message) }
    }
    input.click()
  }
  // ---- CSV roster export / import (scalar identity + incident layer) ----
  async function exportRecordsCsv() {
    if (!(await guard('csv.export'))) return
    recordRepo.list().then((records) => {
      const blob = new Blob([recordsToCsv(records, getDeployment())], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `triage-link-roster-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
      audit('record.export', { detail: 'csv' })
      flashBackup(`Exported ${records.length} record${records.length === 1 ? '' : 's'} to CSV.`)
    }).catch(() => flashBackup('CSV export failed.'))
  }
  function pickCsvFile() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'text/csv,.csv'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      try {
        const records = csvToRecords(await file.text())
        if (records.length === 0) { flashBackup('No casualties found in that CSV.'); return }
        // Reuse the merge/replace confirm + import machinery via a Backup envelope.
        setPendingImport({ backup: { app: 'triage-link', format: 1, exportedAt: Date.now(), records }, count: records.length })
      } catch { flashBackup('Could not read that CSV.') }
    }
    input.click()
  }
  async function runImport(mode: ImportMode) {
    if (!pendingImport) return
    // Gate at EXECUTION time (not file-pick): this is the destructive step, and
    // the Merge/Replace buttons can be reached later by a different user.
    if (!(await guard('data.restore'))) return
    try {
      const n = await importBackup(pendingImport.backup, mode)
      setSaved(await recordRepo.list())
      audit('backup.restore', { detail: mode })
      flashBackup(`Imported ${n} record${n === 1 ? '' : 's'} (${mode}).`)
    } catch { flashBackup('Import failed.') }
    setPendingImport(null)
  }

  async function sendToEhr() {
    if (!(await guard('ehr.send'))) return
    setEhrStatus('Sending…')
    try {
      const res = await contributeHandover(record)
      setEhrStatus(res.accepted ? `Sent ✓ (${res.provider}${res.id ? ` · ${res.id}` : ''})` : 'Rejected')
    } catch (err) {
      setEhrStatus(err instanceof EhrUnavailableError ? 'EHR unreachable' : `Failed: ${(err as Error).message}`)
    }
    window.setTimeout(() => setEhrStatus(''), 5000)
  }

  function downloadJson(data: unknown, filename: string) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/fhir+json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }
  const exportFhir = async () => { if (!(await guard('record.export'))) return; downloadJson(toFhirBundle(record), `${record.id}-fhir-bundle.json`); audit('record.export', { recordId: record.id }) }

  // ---- runtime language packs (add a language with no code release) ----
  function downloadTemplate() {
    downloadJson(templatePack(), 'triage-link-language-template.json')
    setMenuOpen(false)
  }
  function loadLanguagePack() {
    setMenuOpen(false)
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json,.json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      try {
        const pack = JSON.parse(await file.text())
        const code = registerLanguage(pack)   // validates shape
        saveLanguagePack(pack)                 // persist across reloads
        setLang(code)                          // switch to it immediately
      } catch { setLangMsg(t('lang.packError')); window.setTimeout(() => setLangMsg(''), 5000) }
    }
    input.click()
  }
  const shareHandover = async () => { if (!(await guard('handover.share'))) return; downloadJson(toHandoverBundle(record), `${record.id}-handover-fhir.json`); audit('record.export', { recordId: record.id, detail: 'handover' }) }

  const selected = record.injuries.find((i) => i.id === selectedInjury) ?? null
  const triage = record.incident.triage
  const tbsa = estimateBurnTBSA(record.injuries, record.incident.ageBand)
  const dobAge = ageFromDob(record.tombstone.dob, Date.now())

  return (
    <>
    <div className="app">
      <header className="topbar">
        <div className="brand"><span className="mark">◇<span className="bn"> TRIAGE-LINK</span></span><span className="sub">{t('app.sub')}</span></div>
        <div className="pid"><span className="pid-label">{t('hdr.case')} </span><b>{record.id}</b></div>
        {activeOperator && (
          <button type="button" className="op-chip" onClick={() => setShowOperators(true)} title={t('op.title')}>
            👤 {activeOperator.name}
          </button>
        )}
        <button type="button" className="topbtn langbtn" onClick={() => setLang(nextLang(lang))} title="Language / Langue / اللغة">🌐 {t('lang.toggle')}</button>
        <button className="topbtn" onClick={newCase} title="Start a fresh record (the current one is auto-saved)">{t('hdr.new')}</button>
        <button className="topbtn" data-tour="board" onClick={() => setShowBoard(true)} title="All saved casualties grouped by triage (scene picture)">{t('hdr.board')}{saved.length > 0 ? ` · ${saved.length}` : ''}</button>
        <button type="button" className="topbtn more-btn" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)} title="More actions">{t('hdr.more')}</button>
        <div className={`topbar-rest${menuOpen ? ' open' : ''}`} onClick={() => setMenuOpen(false)}>
          <button className="topbtn" data-tour="summary" onClick={() => setShowSummary(true)} title="One-page casualty card — print or save as PDF for handover">{t('hdr.summary')}</button>
          <button className="topbtn" onClick={() => setShowTour(true)} title="Replay the guided tour">{t('hdr.tour')}</button>
          <button className="topbtn" onClick={loadLanguagePack} title="Load a custom language pack (JSON) — adds a language with no app update">{t('lang.pack')}</button>
          <button className="topbtn" onClick={downloadTemplate} title="Download the English strings as a starter template to translate">{t('lang.template')}</button>
          <button className="topbtn" onClick={() => { setShowOperators(true); setMenuOpen(false) }} title="Assign records to the operator on duty (shared-device attribution)">{t('op.menu')}</button>
          {canViewAdmin() && (
            <button className="topbtn" onClick={async () => { setMenuOpen(false); if (await guard('audit.view')) setShowAudit(true) }} title="Tamper-evident log of data access and security events">{t('audit.menu')}</button>
          )}
          <button className="topbtn" onClick={sendToEhr} title="Contribute this handover to the provincial EHR">{t('hdr.ehr')}</button>
          {vaultState === 'disabled' && (
            <button className="topbtn" onClick={enablePhotoVault} title="Encrypt all wound photos at rest behind a passphrase">{t('vault.enable')}</button>
          )}
          {vaultState === 'unlocked' && (
            <>
              <button className="topbtn" onClick={() => { lockVault(); setMenuOpen(false) }} title="Lock the vault now (data becomes unreadable until you unlock)">{t('vault.lockNow')}</button>
              {!isRequired() && (
                <button className="topbtn" onClick={disablePhotoVault} title="Decrypt all data and turn the vault off">{t('vault.disable')}</button>
              )}
            </>
          )}
          {import.meta.env.DEV && (
            <button className="topbtn" onClick={() => setShowEhrLab(true)} title="Interactive lab to test the EHR integration against a stubbed gateway">{t('hdr.ehrlab')}</button>
          )}
          <button className="topbtn primary" onClick={exportFhir} title="Download an interoperable FHIR record">{t('hdr.fhir')}</button>
        </div>
        {menuOpen && <div className="topmenu-backdrop" onClick={() => setMenuOpen(false)} />}
        {ehrStatus && <span className="ehr-status">{ehrStatus}</span>}
        {langMsg && <span className="ehr-status">{langMsg}</span>}
      </header>

      {/* Deployment context — the operation/site this device documents (offline,
          device-wide). Humanitarian/MCI coordination + donor-report provenance. */}
      <DeploymentBar />

      {/* Prominent, always-visible triage tag (acuity channel, distinct from
          injury-type marker colours). Quick-set here; persists on the record. */}
      <div
        className="triagebar"
        data-tour="triage"
        style={triage ? { background: `color-mix(in srgb, ${TRIAGE_COLORS[triage]} 16%, var(--panel))` } : undefined}
      >
        <span className="tb-label">{t('triage.label')}</span>
        <div className="tb-opts" role="group" aria-label="Triage category">
          {TRIAGE_ORDER.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`tb-opt${triage === cat ? ' on' : ''}`}
              style={triage === cat ? { background: TRIAGE_COLORS[cat], borderColor: TRIAGE_COLORS[cat], color: '#0c0c0c' } : undefined}
              onClick={() => setInc('triage', cat)}
              title={t(`triage.${cat}`)}
            >
              <span className="sw" style={{ background: TRIAGE_COLORS[cat] }} />
              {t(`triage.${cat}`).split(' ')[0]}
            </button>
          ))}
        </div>
        <span className="tb-current">
          {triage && <span className="tb-current-sw" style={{ background: TRIAGE_COLORS[triage] }} />}
          {triage ? t(`triage.${triage}`) : t('triage.notset')}
        </span>
      </div>

      <OfflineBanner />
      <InstallPrompt />
      {!tourOffered && !showTour && (
        <div className="tour-offer">
          <span>{t('tour.offer')}</span>
          <span className="tour-offer-actions">
            <button type="button" className="btn primary" onClick={() => { setShowTour(true); dismissTourOffer() }}>{t('tour.start')}</button>
            <button type="button" className="tip-x" aria-label="Dismiss" onClick={dismissTourOffer}>×</button>
          </span>
        </div>
      )}

      <div className="wrap">
        {/* Patient + Incident — top of the workflow: who, and what happened */}
        <div className="idband">
          {/* ---- tombstone ---- */}
          <section className="panel" data-tour="patient">
            <div className="panel-h"><h2>{t('tomb.title')}</h2></div>
            <div className="panel-b grid2">
              <label className="field col2"><span>{t('tomb.name')}</span><input value={record.tombstone.name} onChange={(e) => setTomb('name', e.target.value)} placeholder={t('tomb.name_ph')} /></label>
              <div className="col2 dob-sex">
                <label className="field"><span>{t('tomb.dob')}</span><DobField value={record.tombstone.dob} onChange={setDob} /></label>
                <label className="field"><span>{t('tomb.sex')}</span>
                  <select value={record.tombstone.sex} onChange={(e) => setTomb('sex', e.target.value)}>
                    <option value="">—</option><option value="female">{t('sex.female')}</option><option value="male">{t('sex.male')}</option><option value="other">{t('sex.other')}</option><option value="unknown">{t('sex.unknown')}</option>
                  </select>
                </label>
              </div>
              <label className="field"><span>{t('tomb.mrn')}</span><input className="mono" value={record.tombstone.mrn} onChange={(e) => setTomb('mrn', e.target.value)} /></label>
              <label className="field"><span>{t('tomb.blood')}</span><input value={record.tombstone.bloodType} onChange={(e) => setTomb('bloodType', e.target.value)} placeholder={t('tomb.blood_ph')} /></label>
              <label className="field"><span>{t('tomb.nok')}</span><input value={record.tombstone.nextOfKin} onChange={(e) => setTomb('nextOfKin', e.target.value)} /></label>
              <label className="field"><span>{t('tomb.nokphone')}</span><input className="mono" value={record.tombstone.nextOfKinPhone} onChange={(e) => setTomb('nextOfKinPhone', e.target.value)} /></label>
            </div>
            <div className="panel-b">
              <PcrVerify tombstone={record.tombstone} onApply={applyTomb} />
            </div>
          </section>

          {/* ---- incident (triage lives in the header tag) ---- */}
          <section className="panel">
            <div className="panel-h"><h2>{t('inc.title')}</h2></div>
            <div className="panel-b grid2">
              <label className="field"><span>{t('inc.time')}</span><input type="datetime-local" value={record.incident.injuryTime} onChange={(e) => setInc('injuryTime', e.target.value)} /></label>
              <label className="field"><span>{t('inc.mech')}</span><input value={record.incident.mechanism} onChange={(e) => setInc('mechanism', e.target.value)} placeholder={t('inc.mech_ph')} /></label>
              <label className="field col2"><span>{t('inc.loc')}</span><input value={record.incident.location} onChange={(e) => setInc('location', e.target.value)} placeholder={t('inc.loc_ph')} /></label>
              <div className="field col2"><span>{t('inc.ageband')} <em>{t('inc.ageband_note')}</em>
                {dobAge != null && <em className="derived">{t('inc.fromdob', { n: dobAge })}</em>}</span>
                <div className="ageband" role="group" aria-label="Patient age band">
                  {AGE_BAND_ORDER.map((b) => (
                    <button key={b} type="button" className={record.incident.ageBand === b ? 'on' : ''} onClick={() => setInc('ageBand', b)}>
                      {t(`age.${b}`)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Assessment: charts (injuries) · acuity + vitals (signs) · injury list */}
          <div className="workzone">
          <div className="workcol">
          {/* ---- injury chart ---- */}
          <section className="panel">
            <div className="chart-head">
              <h2>{t('chart.title')}</h2>
              <div className="palette" data-tour="palette">
                {INJURY_TYPES.map((it) => (
                  <button
                    key={it.key}
                    className={`tool${it.key === activeType ? ' active' : ''}`}
                    style={it.key === activeType ? { borderColor: it.color } : undefined}
                    onClick={() => setActiveType(it.key)}
                  >
                    <span className="dot" style={{ background: it.color }} />{t(`injury.${it.key}`)}
                  </button>
                ))}
              </div>
            </div>
            <div className="charts" data-tour="charts">
              <BodyChart view="anterior" injuries={record.injuries} selectedId={selectedInjury} onPlace={placeInjury} onSelect={setSelectedInjury} />
              <BodyChart view="posterior" injuries={record.injuries} selectedId={selectedInjury} onPlace={placeInjury} onSelect={setSelectedInjury} />
            </div>
            <p className="hint">{t('chart.hint')}</p>
            <div className="hintwrap">
              <Tip id="chart-flow">{t('chart.tip')}</Tip>
            </div>
          </section>

          <TreatmentPanel onAdd={addTreatment} treatments={record.treatments} onRemove={removeTreatment} />
          </div>

          {/* middle column: acuity glance + vitals (signs) */}
          <div className="workcol">
          <AcuityGlance record={record} tbsa={tbsa} />
          <VitalsPanel onAdd={addVital} vitals={record.vitals} onRemove={removeVital} />
          </div>

          {/* right column: the logged-injury list / editor */}
          <div className="workcol">
          {/* ---- injury list / editor ---- */}
          <section className="panel">
            <div className="panel-h">
              <h2>{t('inj.title')}</h2>
              {tbsa > 0 && (
                <span className="tbsa" title={`Burn TBSA · Lund–Browder, ${AGE_BAND_LABELS[record.incident.ageBand]}`}>
                  🔥 {tbsa}% {t('tbsa')}
                </span>
              )}
              <span className="count">{record.injuries.length}</span>
            </div>
            <div className="panel-b">
              {record.injuries.length === 0 && <div className="empty">{t('inj.empty')}</div>}
              {record.injuries.map((i) => (
                <div className={`row${i.id === selectedInjury ? ' on' : ''}`} key={i.id}>
                  <span className="tag" style={{ background: injuryColor(i.type) }} />
                  <div className="body" onClick={() => setSelectedInjury(i.id)}>
                    <div className="ttl">{t(`injury.${i.type}`)} · <span className="dim">{t(`sev.${i.severity}`)}</span></div>
                    <div className="meta">{regionLabel(i.region, lang)} · {t(`view.${i.view}`)}{i.notes ? ` · ${i.notes}` : ''}</div>
                  </div>
                  <button className="x" onClick={() => removeInjury(i.id)}>×</button>
                </div>
              ))}
              {selected && (
                <div className="editor" data-tour="editor">
                  <div className="sev">
                    {(['minor', 'moderate', 'severe', 'critical'] as const).map((s) => (
                      <button key={s} className={selected.severity === s ? 'on' : ''} onClick={() => updateInjury(selected.id, { severity: s })}>{t(`sev.${s}`)}</button>
                    ))}
                  </div>
                  <input
                    placeholder={t('inj.notes_ph')}
                    value={selected.notes}
                    onChange={(e) => updateInjury(selected.id, { notes: e.target.value })}
                  />
                  <div className="photos">
                    <button type="button" className="addphoto" onClick={() => addPhoto(selected.id)}>{t('inj.addphoto')}</button>
                    {selected.photos.length === 0 && !photoError && <span className="hint-inline">{t('inj.photohint')}</span>}
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
                <div className="hint-inline select-hint">{t('inj.selecthint')}</div>
              )}
            </div>
          </section>
          </div>
          </div>

          {/* ---- handover sign-off (who took over care, and when) ---- */}
          <HandoverPanel key={record.id} handover={record.handover} onChange={setHandover} onShare={shareHandover} />

          {/* ---- saved casualties (navigation, end of the record) ---- */}
          <section className="panel">
            <div className="panel-h"><h2>{t('saved.title')}</h2>
              <button type="button" className="minibtn" onClick={exportAllRecords} title="Download a backup file of every saved record">{t('saved.backup')}</button>
              <button type="button" className="minibtn" onClick={exportEncryptedRecords} title="Download a passphrase-encrypted backup (PHI is unreadable without the passphrase)">{t('saved.backupEnc')}</button>
              <button type="button" className="minibtn" onClick={pickBackupFile} title="Restore records from a backup file (encrypted or plain)">{t('saved.restore')}</button>
              <button type="button" className="minibtn" onClick={exportRecordsCsv} title="Export a roster CSV (identity + incident fields) for analytics or QA">{t('saved.csv')}</button>
              <button type="button" className="minibtn" onClick={pickCsvFile} title="Import a roster CSV to create casualty records (onboard a patient list)">{t('saved.csvin')}</button>
              <span className="count">{saved.length}</span>
            </div>
            <div className="panel-b">
              {backupMsg && <div className="backup-msg">{backupMsg}</div>}
              {pendingImport && (
                <div className="import-confirm">
                  <span>{t('imp.q', { n: pendingImport.count })}</span>
                  <span className="import-actions">
                    <button type="button" className="btn" onClick={() => runImport('merge')} title="Add these records, keeping the newer copy of any duplicates">{t('imp.merge')}</button>
                    <button type="button" className="btn danger" onClick={() => runImport('replace')} title="Delete all current records first, then import">{t('imp.replace')}</button>
                    <button type="button" className="tip-x" aria-label="Cancel import" onClick={() => setPendingImport(null)}>×</button>
                  </span>
                </div>
              )}
              {saved.length === 0 && <div className="empty">{t('saved.empty')}</div>}
              {saved.length > 1 && (
                <Tip id="handover-features">{t('saved.tip')}</Tip>
              )}
              {saved.map((r) => (
                <div className={`rec${r.id === record.id ? ' active' : ''}`} key={r.id}>
                  <span className="tri" style={{ background: r.incident.triage ? TRIAGE_COLORS[r.incident.triage] : '#2A3340' }} />
                  <div onClick={() => loadCase(r.id)} style={{ flex: 1, cursor: 'pointer' }}>
                    <div className="nm">{r.tombstone.name || t('saved.unidentified')}{r.handover ? t('saved.handedover') : ''}</div>
                    <div className="mt">{r.id} · {r.injuries.length} {t('saved.inj')} · {fmtTime(r.updatedAt)}</div>
                  </div>
                  <button className="x" onClick={() => deleteCase(r.id)}>×</button>
                </div>
              ))}
            </div>
          </section>
      </div>

      <p className="footnote">{t('footnote')}</p>
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
    {import.meta.env.DEV && showEhrLab && <EhrTestConsole record={record} onClose={() => setShowEhrLab(false)} />}
    {showAudit && <AuditLog onClose={() => setShowAudit(false)} />}
    {showOperators && <OperatorPanel onClose={() => setShowOperators(false)} />}
    {(vaultState === 'locked' || vaultState === 'setup') && <LockScreen />}
    </>
  )
}

// ---- acuity glance: triage + latest vitals, above the logged-injuries list ----
function AcuityGlance({ record, tbsa }: { record: CasualtyRecord; tbsa: number }) {
  const { t } = useLang()
  const triage = record.incident.triage
  const latest = record.vitals[record.vitals.length - 1]
  return (
    <aside className="glance">
      <div className="glance-h">{t('glance.title')}</div>
      <div
        className="glance-triage"
        style={triage ? { background: TRIAGE_COLORS[triage], color: '#0c0c0c', borderColor: TRIAGE_COLORS[triage] } : undefined}
      >
        {triage ? t(`triage.${triage}`) : t('glance.notriage')}
      </div>
      <Elapsed injuryTime={record.incident.injuryTime} className="glance-elapsed" label />
      <div className="glance-sec">
        <span className="glance-k">{t('glance.vitals')}</span>
        {latest ? (
          <>
            <div className="glance-chips">
              {latest.hr && <span>{t('vit.hr')} {latest.hr}</span>}{latest.bp && <span>{t('vit.bp')} {latest.bp}</span>}
              {latest.rr && <span>{t('vit.rr')} {latest.rr}</span>}{latest.spo2 && <span>{t('vit.spo2')} {latest.spo2}</span>}
              {latest.gcs && <span>{t('vit.gcs')} {latest.gcs}</span>}{latest.pain && <span>{t('vit.pain')} {latest.pain}</span>}
            </div>
            <div className="glance-time">{fmtTime(latest.takenAt)}</div>
            <VitalsTrend vitals={record.vitals} className="glance-trend" />
          </>
        ) : (
          <span className="glance-empty">{t('glance.novitals')}</span>
        )}
      </div>
      <div className="glance-stats">
        <div>{t(record.injuries.length === 1 ? 'glance.injuries_one' : 'glance.injuries_many', { n: record.injuries.length })}</div>
        {tbsa > 0 && <div className="glance-tbsa">🔥 {tbsa}% {t('tbsa')}</div>}
      </div>
    </aside>
  )
}

// ---- date-of-birth entry: a typed YYYY-MM-DD box plus a 📅 calendar popup with
// month + year jump (no decade-scrolling). Emits 'YYYY-MM-DD' (or '' if blank). ----
const DOB_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DOB_DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

/** True only for a real calendar date in strict YYYY-MM-DD form (no rollover). */
function isValidIso(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
}

function DobField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useLang()
  const [text, setText] = useState(value)
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => {
    const base = isValidIso(value) ? new Date(value) : new Date()
    return { y: base.getFullYear(), m: base.getMonth() } // m: 0-11
  })

  // Re-sync the box only when the record's value diverges from what we'd emit
  // (e.g. a new case is loaded) — so mid-typing isn't clobbered.
  useEffect(() => {
    if (value !== (isValidIso(text) ? text : '')) setText(value)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  // Close the popup on Escape while it's open.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const type = (s: string) => { setText(s); onChange(isValidIso(s) ? s : '') }
  const pick = (y: number, m: number, d: number) => {
    const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    setText(iso); onChange(iso); setOpen(false)
  }
  const toggle = () => {
    if (!open) { const base = isValidIso(text) ? new Date(text) : new Date(); setView({ y: base.getFullYear(), m: base.getMonth() }) }
    setOpen((o) => !o)
  }

  const thisYear = new Date().getFullYear()
  const years = Array.from({ length: 121 }, (_, i) => thisYear - i) // year jump: this year .. -120
  const firstDow = new Date(view.y, view.m, 1).getDay()
  const daysIn = new Date(view.y, view.m + 1, 0).getDate()
  const selected = isValidIso(text) ? text : null

  return (
    <div className="dobf">
      <div className="dobf-row">
        <input aria-label="Date of birth (YYYY-MM-DD)" className="mono" type="text" inputMode="numeric"
          placeholder={t('dob.ph')} maxLength={10} value={text} onChange={(e) => type(e.target.value)} />
        <button type="button" className="cal-btn" aria-label="Open calendar" aria-expanded={open} onClick={toggle}>📅</button>
      </div>
      {open && (
        <>
          <div className="cal-backdrop" onClick={() => setOpen(false)} />
          <div className="cal" role="dialog" aria-label="Pick date of birth">
            <div className="cal-head">
              <button type="button" className="cal-nav" aria-label="Previous month" onClick={() => setView((v) => (v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }))}>‹</button>
              <select aria-label="Month" value={view.m} onChange={(e) => setView((v) => ({ ...v, m: Number(e.target.value) }))}>
                {DOB_MONTHS.map((nm, i) => <option key={nm} value={i}>{nm}</option>)}
              </select>
              <select aria-label="Year" value={view.y} onChange={(e) => setView((v) => ({ ...v, y: Number(e.target.value) }))}>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              <button type="button" className="cal-nav" aria-label="Next month" onClick={() => setView((v) => (v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }))}>›</button>
            </div>
            <div className="cal-grid cal-dow">{DOB_DOW.map((w) => <span key={w} className="cal-w">{w}</span>)}</div>
            <div className="cal-grid">
              {Array.from({ length: firstDow }).map((_, i) => <span key={`b${i}`} />)}
              {Array.from({ length: daysIn }, (_, i) => i + 1).map((d) => {
                const iso = `${view.y}-${String(view.m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
                return <button key={d} type="button" className={`cal-day${selected === iso ? ' sel' : ''}`} onClick={() => pick(view.y, view.m, d)}>{d}</button>
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ---- vitals sub-panel ----
function VitalsPanel({ vitals, onAdd, onRemove }: {
  vitals: VitalSign[]
  onAdd: (v: Omit<VitalSign, 'id' | 'takenAt'>) => void
  onRemove: (id: string) => void
}) {
  const { t } = useLang()
  const [f, setF] = useState({ hr: '', bp: '', rr: '', spo2: '', gcs: '', pain: '' })
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }))
  function submit() {
    if (!Object.values(f).some(Boolean)) return
    onAdd({ ...f })
    setF({ hr: '', bp: '', rr: '', spo2: '', gcs: '', pain: '' })
  }
  return (
    <section className="panel" data-tour="vitals">
      <div className="panel-h"><h2>{t('vit.title')}</h2><span className="count">{vitals.length}</span></div>
      <div className="panel-b">
        <div className="grid3">
          {VITALS_KEYS.map((k) => (
            <label className="field" key={k} title={`${t(`vit.${k}_name`)} (${VITALS_PH[k]})`}>
              <span>{t(`vit.${k}`)}</span>
              <input className="mono" value={f[k]} onChange={(e) => set(k, e.target.value)} placeholder={VITALS_PH[k]} />
            </label>
          ))}
        </div>
        <GcsCalc value={f.gcs} onChange={(v) => set('gcs', v)} />
        <button className="btn full" onClick={submit}>{t('vit.record')}</button>
        {vitals.length === 0 && <p className="hint-inline panel-hint">{t('vit.hint')}</p>}
        {vitals.length >= 2 && (
          <div className="vtrend-block">
            <span className="vtrend-h">{t('vit.trend')}</span>
            <VitalsTrend vitals={vitals} />
          </div>
        )}
        {vitals.slice().reverse().map((v) => (
          <div className="row" key={v.id}>
            <div className="body">
              <div className="chips">
                {v.hr && <span>{t('vit.hr')} {v.hr}</span>}{v.bp && <span>{t('vit.bp')} {v.bp}</span>}{v.rr && <span>{t('vit.rr')} {v.rr}</span>}
                {v.spo2 && <span>{t('vit.spo2')} {v.spo2}</span>}{v.gcs && <span>{t('vit.gcs')} {v.gcs}</span>}{v.pain && <span>{t('vit.pain')} {v.pain}</span>}
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
  const { t } = useLang()
  const [e, setE] = useState(4)
  const [v, setV] = useState(5)
  const [m, setM] = useState(6)
  const apply = (ne: number, nv: number, nm: number) => { setE(ne); setV(nv); setM(nm); onChange(formatGcs(ne, nv, nm)) }
  const total = e + v + m
  return (
    <details className="gcs-calc">
      <summary>{t('vit.gcscalc')} <span className="gcs-total">{value ? value : `= ${total}`}</span></summary>
      <div className="gcs-rows">
        <label className="field"><span>{t('gcs.eye')}</span>
          <select aria-label="GCS eye" value={e} onChange={(ev) => apply(+ev.target.value, v, m)}>
            {GCS_EYE.map((o) => <option key={o.score} value={o.score}>{o.score} · {t(`gcsopt.${o.label}`)}</option>)}
          </select>
        </label>
        <label className="field"><span>{t('gcs.verbal')}</span>
          <select aria-label="GCS verbal" value={v} onChange={(ev) => apply(e, +ev.target.value, m)}>
            {GCS_VERBAL.map((o) => <option key={o.score} value={o.score}>{o.score} · {t(`gcsopt.${o.label}`)}</option>)}
          </select>
        </label>
        <label className="field"><span>{t('gcs.motor')}</span>
          <select aria-label="GCS motor" value={m} onChange={(ev) => apply(e, v, +ev.target.value)}>
            {GCS_MOTOR.map((o) => <option key={o.score} value={o.score}>{o.score} · {t(`gcsopt.${o.label}`)}</option>)}
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
  const { t } = useLang()
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
      <div className="panel-h"><h2>{t('tx.title')}</h2><span className="count">{treatments.length}</span></div>
      <div className="panel-b grid2">
        <label className="field col2"><span>{t('tx.intervention')}</span>
          <select value={type} onChange={(e) => setType(e.target.value)}>{TREATMENT_TYPES.map((opt) => <option key={opt} value={opt}>{t(`txt.${opt}`)}</option>)}</select>
        </label>
        <label className="field col2"><span>{t('tx.detail')}</span><input value={detail} onChange={(e) => setDetail(e.target.value)} placeholder={t('tx.detail_ph')} /></label>
        <label className="field"><span>{t('tx.location')}</span>
          <select value={place} onChange={(e) => setPlace(e.target.value as TreatmentPlace)}>
            <option value="scene">{t('tx.place.scene')}</option><option value="enroute">{t('tx.place.enroute')}</option><option value="handover">{t('tx.place.handover')}</option>
          </select>
        </label>
        <label className="field"><span>{t('tx.provider')}</span><input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder={t('tx.provider_ph')} /></label>
        <div className="col2"><button className="btn full" onClick={submit}>{t('tx.log')}</button></div>
        <div className="col2">
          {treatments.length === 0 && <p className="hint-inline panel-hint">{t('tx.hint')}</p>}
          {treatments.slice().reverse().map((tr) => (
            <div className="row" key={tr.id}>
              <span className="tag" style={{ background: '#3FE08A' }} />
              <div className="body">
                <div className="ttl">{t(`txt.${tr.type}`)}{tr.detail ? ` — ${tr.detail}` : ''}</div>
                <div className="meta">{fmtTime(tr.performedAt)} · {t(`tx.place.${tr.place}`)}{tr.provider ? ` · ${tr.provider}` : ''}</div>
              </div>
              <button className="x" onClick={() => onRemove(tr.id)}>×</button>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ---- handover sign-off: records the receiving clinician/facility and stamps
// the time. Reset per-record via a key on the call site. ----
function HandoverPanel({ handover, onChange, onShare }: {
  handover: Handover | null
  onChange: (h: Handover | null) => void
  onShare: () => void
}) {
  const { t } = useLang()
  const [clinician, setClinician] = useState(handover?.clinician ?? '')
  const [facility, setFacility] = useState(handover?.facility ?? '')
  const sign = () => onChange({ at: Date.now(), clinician: clinician.trim(), facility: facility.trim() })
  return (
    <section className="panel" data-tour="handover">
      <div className="panel-h"><h2>{t('ho.title')}</h2></div>
      <div className="panel-b">
        {handover ? (
          <div className="ho-done">
            <div className="ho-badge">✓ {t('ho.done')} · {fmtTime(handover.at)}</div>
            {(handover.clinician || handover.facility) && (
              <div className="ho-detail">{handover.clinician || '—'}{handover.facility ? ` · ${handover.facility}` : ''}</div>
            )}
            <div className="ho-actions">
              <button type="button" className="btn" onClick={onShare} title="Download a FHIR slice (Encounter + Provenance) for the receiving team">{t('ho.share')}</button>
              <button type="button" className="btn" onClick={() => onChange(null)}>{t('ho.undo')}</button>
            </div>
          </div>
        ) : (
          <div className="grid2">
            <label className="field"><span>{t('ho.clinician')}</span><input value={clinician} onChange={(e) => setClinician(e.target.value)} placeholder={t('ho.clinician_ph')} /></label>
            <label className="field"><span>{t('ho.facility')}</span><input value={facility} onChange={(e) => setFacility(e.target.value)} placeholder={t('ho.facility_ph')} /></label>
            <div className="col2"><button type="button" className="btn full primary" disabled={!clinician.trim()} onClick={sign}>{t('ho.sign')}</button></div>
            <p className="hint-inline panel-hint col2">{t('ho.hint')}</p>
          </div>
        )}
      </div>
    </section>
  )
}
