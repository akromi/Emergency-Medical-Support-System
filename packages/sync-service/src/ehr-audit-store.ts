// Durable storage for EHR-access AuditEvents.
//
// Ontario Health's privacy & security policy requires every access to the
// provincial EHR to be audited. The EhrGateway emits FHIR AuditEvents; this
// store persists them (full resource + queryable columns) so access is
// durably accountable, separate from the CRDT op `audit` table.
import type { FhirResource } from '@triage-link/core'
import type { Queryable } from './ops-store.js'

export interface EhrAuditRow {
  id: number
  recorded: string | null
  action: string | null
  outcome: string | null
  agentId: string | null
  patientRef: string | null
  query: string | null
  event: FhirResource
  createdAt: string
}

export async function migrateEhrAudit(db: Queryable): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS ehr_audit (
      id bigserial PRIMARY KEY,
      recorded timestamptz,
      action text,
      outcome text,
      agent_id text,
      patient_ref text,
      query text,
      event text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`)
  await db.query(`CREATE INDEX IF NOT EXISTS ehr_audit_patient_idx ON ehr_audit (patient_ref)`)
}

// Narrow accessors over the loosely-typed FHIR AuditEvent.
function firstAgentId(event: FhirResource): string | null {
  const agent = event.agent as Array<{ who?: { identifier?: { value?: string } } }> | undefined
  return agent?.[0]?.who?.identifier?.value ?? null
}
function firstEntity(event: FhirResource): { what?: { reference?: string }; detail?: Array<{ valueString?: string }> } | undefined {
  const entity = event.entity as Array<{ what?: { reference?: string }; detail?: Array<{ valueString?: string }> }> | undefined
  return entity?.[0]
}

export class EhrAuditStore {
  constructor(private readonly db: Queryable) {}

  /** Persist one AuditEvent, indexing the fields callers query by. */
  async record(event: FhirResource): Promise<void> {
    const entity = firstEntity(event)
    await this.db.query(
      `INSERT INTO ehr_audit (recorded, action, outcome, agent_id, patient_ref, query, event)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        typeof event.recorded === 'string' ? event.recorded : null,
        typeof event.action === 'string' ? event.action : null,
        typeof event.outcome === 'string' ? event.outcome : null,
        firstAgentId(event),
        entity?.what?.reference ?? null,
        entity?.detail?.[0]?.valueString ?? null,
        JSON.stringify(event),
      ],
    )
  }

  /** Most-recent audit entries, optionally filtered by patient reference. */
  async list(opts: { patientRef?: string; limit?: number } = {}): Promise<EhrAuditRow[]> {
    const limit = Math.min(opts.limit ?? 100, 1000)
    const res = opts.patientRef
      ? await this.db.query(
          `SELECT * FROM ehr_audit WHERE patient_ref = $1 ORDER BY id DESC LIMIT $2`,
          [opts.patientRef, limit],
        )
      : await this.db.query(`SELECT * FROM ehr_audit ORDER BY id DESC LIMIT $1`, [limit])
    return res.rows.map((r) => ({
      id: Number(r.id),
      recorded: r.recorded == null ? null : String(r.recorded),
      action: r.action ?? null,
      outcome: r.outcome ?? null,
      agentId: r.agent_id ?? null,
      patientRef: r.patient_ref ?? null,
      query: r.query ?? null,
      event: JSON.parse(r.event),
      createdAt: String(r.created_at),
    }))
  }
}
