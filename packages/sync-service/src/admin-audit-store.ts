// Audit trail for tenant-administration actions (create tenant, enable/disable,
// issue/revoke key). A SOC 2 / operational-forensics control: who changed what,
// when. NEVER records a token — only the key id, labels, and target tenant.
//
// "Who" is currently the holder of the shared admin token, so we record the
// source IP rather than an identity; once the admin surface moves to SSO this
// gains a real actor.
import type { Queryable } from './ops-store.js'

export type AdminAction = 'tenant.create' | 'tenant.status' | 'key.issue' | 'key.revoke'

export interface AdminAuditEntry {
  id?: number
  action: AdminAction
  /** The tenant the action targets. */
  tenantId: string | null
  /** Non-secret context: { name } / { status } / { keyId, label } / { keyId }. */
  detail: unknown
  ip: string | null
  createdAt?: string
}

export async function migrateAdminAudit(db: Queryable): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS admin_audit (
      id bigserial PRIMARY KEY,
      action text NOT NULL,
      tenant_id text,
      detail text,
      ip text,
      created_at timestamptz NOT NULL DEFAULT now()
    )`)
  await db.query(`CREATE INDEX IF NOT EXISTS admin_audit_tenant_idx ON admin_audit (tenant_id)`)
}

export class AdminAuditStore {
  constructor(private readonly db: Queryable) {}

  async record(e: AdminAuditEntry): Promise<void> {
    await this.db.query(
      `INSERT INTO admin_audit (action, tenant_id, detail, ip) VALUES ($1,$2,$3,$4)`,
      [e.action, e.tenantId, JSON.stringify(e.detail ?? null), e.ip],
    )
  }

  /** Newest-first admin actions, optionally filtered by target tenant. */
  async list(opts: { tenantId?: string; limit?: number } = {}): Promise<Required<AdminAuditEntry>[]> {
    const limit = Math.min(opts.limit ?? 100, 1000)
    const res = opts.tenantId != null
      ? await this.db.query(`SELECT * FROM admin_audit WHERE tenant_id = $1 ORDER BY id DESC LIMIT $2`, [opts.tenantId, limit])
      : await this.db.query(`SELECT * FROM admin_audit ORDER BY id DESC LIMIT $1`, [limit])
    return res.rows.map((r) => ({
      id: Number(r.id),
      action: r.action,
      tenantId: r.tenant_id ?? null,
      detail: r.detail == null ? null : JSON.parse(r.detail),
      ip: r.ip ?? null,
      createdAt: String(r.created_at),
    }))
  }
}
