// Persistence for the sync service. Deliberately decoupled from a concrete
// driver: anything implementing Queryable works, so production uses node-postgres
// (`pg`) and tests use an in-memory Postgres (`pg-mem`) with identical SQL.
//
// JSON payloads are stored as `text` (serialized here) rather than `jsonb` so the
// round-trip is byte-identical and driver/jsonb quirks don't leak into behaviour.
import type { Op } from '@triage-link/core'

export interface Queryable {
  query(text: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>
}

export interface AuditEntry {
  id?: number
  recordId: string
  opId: string | null
  eventType: string
  detail: unknown
  createdAt?: string
}

/** Default tenant used when no per-tenant identity is configured (dev, tests,
 *  and single-org deploys behave exactly as a single-tenant service). */
export const DEFAULT_TENANT = 'default'

// Every table is partitioned by `tenant_id`: ops/snapshots/audit are isolated
// per organization so one tenant can never read or resolve another's records.
// The id keys are composite ((tenant_id, id) / (tenant_id, record_id)) so op
// ids only need to be unique WITHIN a tenant. (This is a greenfield schema; an
// existing single-tenant deployment would add the column via a data migration
// that backfills tenant_id = 'default'.)
export async function migrate(db: Queryable): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS ops (
      tenant_id text NOT NULL DEFAULT 'default',
      id text NOT NULL,
      record_id text NOT NULL,
      client_id text NOT NULL,
      lamport bigint NOT NULL,
      ts bigint NOT NULL,
      kind text NOT NULL,
      path text NOT NULL,
      item_id text,
      value text,
      received_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (tenant_id, id)
    )`)
  await db.query(`CREATE INDEX IF NOT EXISTS ops_tenant_record_idx ON ops (tenant_id, record_id)`)
  await db.query(`
    CREATE TABLE IF NOT EXISTS snapshots (
      tenant_id text NOT NULL DEFAULT 'default',
      record_id text NOT NULL,
      record text NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (tenant_id, record_id)
    )`)
  await db.query(`
    CREATE TABLE IF NOT EXISTS audit (
      id bigserial PRIMARY KEY,
      tenant_id text NOT NULL DEFAULT 'default',
      record_id text NOT NULL,
      op_id text,
      event_type text NOT NULL,
      detail text,
      created_at timestamptz NOT NULL DEFAULT now()
    )`)
  await db.query(`CREATE INDEX IF NOT EXISTS audit_tenant_record_idx ON audit (tenant_id, record_id)`)
}

function rowToOp(r: any): Op {
  return {
    id: r.id,
    recordId: r.record_id,
    clientId: r.client_id,
    lamport: Number(r.lamport),
    ts: Number(r.ts),
    kind: r.kind,
    path: r.path,
    itemId: r.item_id ?? undefined,
    value: r.value == null ? undefined : JSON.parse(r.value),
  }
}

export class OpStore {
  constructor(private readonly db: Queryable) {}

  /**
   * Append ops idempotently. Returns the ids that were ACTUALLY newly inserted.
   *
   * An op counts as inserted only when the INSERT creates a row (RETURNING yields
   * one). The pre-check fast-paths the common replay case and avoids relying on
   * pg-mem's divergent `ON CONFLICT … RETURNING` behaviour for already-present
   * rows; the RETURNING check then closes the concurrency window where two
   * requests both pass the pre-check but only one row is actually written.
   * Append ops idempotently. Returns the ids that were newly inserted.
   * A fast existence check skips the common replay path; `ON CONFLICT DO
   * NOTHING RETURNING id` confirms actual insertion under concurrency.
   */
  async insertOps(ops: Op[], tenantId: string = DEFAULT_TENANT): Promise<string[]> {
    const inserted: string[] = []
    for (const op of ops) {
      const existing = await this.db.query(`SELECT 1 FROM ops WHERE tenant_id = $1 AND id = $2`, [tenantId, op.id])
      if (existing.rows.length > 0) continue
      const res = await this.db.query(
        `INSERT INTO ops (tenant_id, id, record_id, client_id, lamport, ts, kind, path, item_id, value)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (tenant_id, id) DO NOTHING
         RETURNING id`,
        [
          tenantId, op.id, op.recordId, op.clientId, op.lamport, op.ts, op.kind, op.path,
          op.itemId ?? null, op.value === undefined ? null : JSON.stringify(op.value),
        ],
      )
      if (res.rows.length > 0) inserted.push(op.id)
    }
    return inserted
  }

  async getOps(recordId: string, tenantId: string = DEFAULT_TENANT): Promise<Op[]> {
    const res = await this.db.query(
      `SELECT id, record_id, client_id, lamport, ts, kind, path, item_id, value
       FROM ops WHERE tenant_id = $1 AND record_id = $2`,
      [tenantId, recordId],
    )
    return res.rows.map(rowToOp)
  }

  /** Every record id the tenant holds ops for (for full-state sync). */
  async allRecordIds(tenantId: string = DEFAULT_TENANT): Promise<string[]> {
    const res = await this.db.query(`SELECT DISTINCT record_id FROM ops WHERE tenant_id = $1`, [tenantId])
    return res.rows.map((r) => r.record_id)
  }

  async upsertSnapshot(recordId: string, record: unknown, tenantId: string = DEFAULT_TENANT): Promise<void> {
    await this.db.query(
      `INSERT INTO snapshots (tenant_id, record_id, record, updated_at) VALUES ($1, $2, $3, now())
       ON CONFLICT (tenant_id, record_id) DO UPDATE SET record = EXCLUDED.record, updated_at = now()`,
      [tenantId, recordId, JSON.stringify(record)],
    )
  }

  async getSnapshot(recordId: string, tenantId: string = DEFAULT_TENANT): Promise<unknown | null> {
    const res = await this.db.query(`SELECT record FROM snapshots WHERE tenant_id = $1 AND record_id = $2`, [tenantId, recordId])
    return res.rows.length ? JSON.parse(res.rows[0].record) : null
  }

  async appendAudit(e: AuditEntry, tenantId: string = DEFAULT_TENANT): Promise<void> {
    await this.db.query(
      `INSERT INTO audit (tenant_id, record_id, op_id, event_type, detail) VALUES ($1,$2,$3,$4,$5)`,
      [tenantId, e.recordId, e.opId, e.eventType, JSON.stringify(e.detail ?? null)],
    )
  }

  async getAudit(recordId: string, tenantId: string = DEFAULT_TENANT): Promise<AuditEntry[]> {
    const res = await this.db.query(
      `SELECT id, record_id, op_id, event_type, detail, created_at
       FROM audit WHERE tenant_id = $1 AND record_id = $2 ORDER BY id ASC`,
      [tenantId, recordId],
    )
    return res.rows.map((r) => ({
      id: Number(r.id),
      recordId: r.record_id,
      opId: r.op_id ?? null,
      eventType: r.event_type,
      detail: r.detail == null ? null : JSON.parse(r.detail),
      createdAt: String(r.created_at),
    }))
  }
}
