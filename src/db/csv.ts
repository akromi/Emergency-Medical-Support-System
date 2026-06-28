import { createEmptyRecord, genCaseId, type CasualtyRecord, type Sex, type TriageCategory, type AgeBand } from '@triage-link/core'
import type { Deployment } from './deployment'

// Roster CSV import/export. One row per casualty covering the SCALAR identity +
// incident fields. Nested data (injuries, vitals, treatments, photos) is NOT
// represented — for full fidelity use a JSON backup. Import recreates the scalar
// layer so a service can onboard a patient list from paper/another system, then
// document the rest in-app. Round-trippable columns come first; export-only
// summary columns follow. RFC 4180-ish; no dependency.

/** Columns that map back to record fields on import (round-trippable). */
const FIELD_COLS = [
  'id', 'name', 'dob', 'sex', 'mrn', 'bloodType', 'address', 'nextOfKin', 'nextOfKinPhone',
  'injuryTime', 'mechanism', 'location', 'triage', 'ageBand',
] as const
/** Export-only summary columns (ignored on import). */
const SUMMARY_COLS = ['injuries', 'handedOver', 'author', 'updatedAt'] as const
/** Export-only deployment/provenance columns, stamped on every row when a
 *  deployment context is set (ignored on import). `responseType` is the stable
 *  kind CODE, not a localized label, so the CSV stays machine-readable. */
const DEPLOY_COLS = ['operation', 'responseType', 'organization'] as const

const TRIAGES: TriageCategory[] = ['immediate', 'delayed', 'minor', 'deceased']
const AGE_BANDS: AgeBand[] = ['infant', 'age1', 'age5', 'age10', 'age15', 'adult']
const SEXES: Sex[] = ['', 'female', 'male', 'other', 'unknown']

const esc = (v: string): string => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

/** Filter records to those LOGGED within [fromMs, toMs] (inclusive), by
 *  `createdAt` (when the casualty was first documented) — for exporting just the
 *  casualties from a given window. Bounds are optional: omit one for an open end. */
export function filterByDateRange(
  records: CasualtyRecord[], fromMs?: number, toMs?: number,
): CasualtyRecord[] {
  return records.filter((r) => {
    const t = r.createdAt
    return (fromMs == null || t >= fromMs) && (toMs == null || t <= toMs)
  })
}

export function recordsToCsv(records: CasualtyRecord[], deployment?: Deployment): string {
  // Stamp deployment/provenance columns only when a context is actually set, so
  // an export with no deployment is byte-for-byte unchanged (backward compatible).
  const dep = deployment && (deployment.operation || deployment.kind || deployment.org) ? deployment : null
  const header = [...FIELD_COLS, ...SUMMARY_COLS, ...(dep ? DEPLOY_COLS : [])].join(',')
  const rows = records.map((r) => {
    const t = r.tombstone, i = r.incident
    return [
      r.id, t.name, t.dob, t.sex, t.mrn, t.bloodType, t.address, t.nextOfKin, t.nextOfKinPhone,
      i.injuryTime, i.mechanism, i.location, i.triage, i.ageBand,
      String(r.injuries.length),
      r.handover ? (r.handover.facility || 'yes') : '',
      r.author?.name ?? '',
      r.updatedAt ? new Date(r.updatedAt).toISOString() : '',
      ...(dep ? [dep.operation, dep.kind, dep.org] : []),
    ].map((c) => esc(c ?? '')).join(',')
  })
  return [header, ...rows].join('\r\n')
}

/** Parse CSV text into rows of cells (handles quotes, commas, CRLF, escaped "). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], field = '', inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else inQuotes = false }
      else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c === '\r') { /* CRLF: handled on \n */ }
    else field += c
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === '')) // drop blank lines
}

/** Build records from a roster CSV. Unknown columns are ignored; unknown/blank
 *  ids get a fresh case id; enum fields are validated (bad values → default). */
export function csvToRecords(text: string): CasualtyRecord[] {
  const rows = parseCsv(text)
  if (rows.length < 2) return []
  const header = rows[0].map((h) => h.trim())
  const at = (cells: string[], name: string): string => {
    const j = header.indexOf(name)
    return j >= 0 ? (cells[j] ?? '').trim() : ''
  }
  const out: CasualtyRecord[] = []
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r]
    const rec = createEmptyRecord(at(cells, 'id') || genCaseId())
    const sex = at(cells, 'sex') as Sex
    const triage = at(cells, 'triage') as TriageCategory
    const ageBand = at(cells, 'ageBand') as AgeBand
    rec.tombstone = {
      ...rec.tombstone,
      name: at(cells, 'name'), dob: at(cells, 'dob'), sex: SEXES.includes(sex) ? sex : '',
      mrn: at(cells, 'mrn') || rec.tombstone.mrn, bloodType: at(cells, 'bloodType'),
      address: at(cells, 'address'), nextOfKin: at(cells, 'nextOfKin'), nextOfKinPhone: at(cells, 'nextOfKinPhone'),
    }
    rec.incident = {
      ...rec.incident,
      injuryTime: at(cells, 'injuryTime'), mechanism: at(cells, 'mechanism'), location: at(cells, 'location'),
      triage: TRIAGES.includes(triage) ? triage : '',
      ageBand: AGE_BANDS.includes(ageBand) ? ageBand : 'adult',
    }
    out.push(rec)
  }
  return out
}
