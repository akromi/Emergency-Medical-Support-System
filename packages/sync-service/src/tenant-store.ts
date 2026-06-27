// Runtime tenant registry: organizations and their API keys, in the database
// (vs. the static SYNC_TENANTS env list). This is what lets a hosted deployment
// PROVISION tenants and ROTATE keys without a restart.
//
// Keys are stored only as a SHA-256 hash (like the app's operator PINs) — the
// plaintext token is shown exactly once, at issue time, and can never be
// recovered. Authentication hashes the presented bearer token and looks it up,
// so a database leak never exposes a usable credential.
import { createHash, randomBytes } from 'node:crypto'
import type { Queryable } from './ops-store.js'

export interface Tenant {
  id: string
  name: string
  status: 'active' | 'disabled'
  createdAt: string
}

export interface TenantKey {
  id: number
  tenantId: string
  label: string | null
  /** Last 4 chars of the token, to identify a key in listings (never the key). */
  hint: string
  createdAt: string
  revokedAt: string | null
}

/** Token prefix — recognizable, and a useful secret-scanner signature. */
const KEY_PREFIX = 'tlk_'

export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex')

/** A fresh opaque API key (192 bits of entropy, url-safe). */
export const generateToken = (): string => KEY_PREFIX + randomBytes(24).toString('base64url')

/** Strip the `Bearer ` prefix from an Authorization header, if present. */
export function bearerToken(header: string | undefined): string | null {
  if (!header || !header.startsWith('Bearer ')) return null
  return header.slice('Bearer '.length)
}

export async function migrateTenants(db: Queryable): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS tenants (
      id text PRIMARY KEY,
      name text NOT NULL,
      status text NOT NULL DEFAULT 'active',
      created_at timestamptz NOT NULL DEFAULT now()
    )`)
  await db.query(`
    CREATE TABLE IF NOT EXISTS tenant_keys (
      id bigserial PRIMARY KEY,
      tenant_id text NOT NULL,
      key_hash text NOT NULL,
      label text,
      hint text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      revoked_at timestamptz
    )`)
  await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS tenant_keys_hash_idx ON tenant_keys (key_hash)`)
  await db.query(`CREATE INDEX IF NOT EXISTS tenant_keys_tenant_idx ON tenant_keys (tenant_id)`)
}

const rowToTenant = (r: any): Tenant => ({
  id: r.id, name: r.name, status: r.status, createdAt: String(r.created_at),
})
const rowToKey = (r: any): TenantKey => ({
  id: Number(r.id), tenantId: r.tenant_id, label: r.label ?? null, hint: r.hint,
  createdAt: String(r.created_at), revokedAt: r.revoked_at == null ? null : String(r.revoked_at),
})

export class TenantStore {
  constructor(private readonly db: Queryable) {}

  /** Create a tenant. Throws if the id is already taken. (Pre-check rather than
   *  ON CONFLICT … RETURNING, whose already-present behaviour pg-mem diverges
   *  on; the id PK still guards against a concurrent double-insert.) */
  async createTenant(id: string, name: string): Promise<Tenant> {
    const exists = await this.db.query(`SELECT 1 FROM tenants WHERE id = $1`, [id])
    if (exists.rows.length > 0) throw new Error(`Tenant '${id}' already exists.`)
    const res = await this.db.query(
      `INSERT INTO tenants (id, name) VALUES ($1, $2) RETURNING id, name, status, created_at`,
      [id, name],
    )
    return rowToTenant(res.rows[0])
  }

  async listTenants(): Promise<Tenant[]> {
    const res = await this.db.query(`SELECT id, name, status, created_at FROM tenants ORDER BY created_at ASC, id ASC`)
    return res.rows.map(rowToTenant)
  }

  async getTenant(id: string): Promise<Tenant | null> {
    const res = await this.db.query(`SELECT id, name, status, created_at FROM tenants WHERE id = $1`, [id])
    return res.rows.length ? rowToTenant(res.rows[0]) : null
  }

  /** Enable/disable a tenant. A disabled tenant's keys stop authenticating. */
  async setTenantStatus(id: string, status: 'active' | 'disabled'): Promise<boolean> {
    const res = await this.db.query(`UPDATE tenants SET status = $2 WHERE id = $1 RETURNING id`, [id, status])
    return res.rows.length > 0
  }

  /** Issue a new API key. Returns the PLAINTEXT token ONCE (only its hash is
   *  stored). Key rotation = issue a new key, then revoke the old one. */
  async issueKey(tenantId: string, label?: string): Promise<{ token: string; key: TenantKey }> {
    const token = generateToken()
    const res = await this.db.query(
      `INSERT INTO tenant_keys (tenant_id, key_hash, label, hint) VALUES ($1, $2, $3, $4)
       RETURNING id, tenant_id, label, hint, created_at, revoked_at`,
      [tenantId, hashToken(token), label ?? null, token.slice(-4)],
    )
    return { token, key: rowToKey(res.rows[0]) }
  }

  async listKeys(tenantId: string): Promise<TenantKey[]> {
    const res = await this.db.query(
      `SELECT id, tenant_id, label, hint, created_at, revoked_at
       FROM tenant_keys WHERE tenant_id = $1 ORDER BY id ASC`,
      [tenantId],
    )
    return res.rows.map(rowToKey)
  }

  /** Revoke a key (idempotent — only an active key is revoked). */
  async revokeKey(tenantId: string, keyId: number): Promise<boolean> {
    const res = await this.db.query(
      `UPDATE tenant_keys SET revoked_at = now()
       WHERE tenant_id = $1 AND id = $2 AND revoked_at IS NULL RETURNING id`,
      [tenantId, keyId],
    )
    return res.rows.length > 0
  }

  /** Resolve an ACTIVE tenant id from a presented bearer token via hash lookup.
   *  Null when the token is unknown, revoked, or its tenant is disabled. */
  async resolveToken(token: string): Promise<string | null> {
    const res = await this.db.query(
      `SELECT k.tenant_id FROM tenant_keys k JOIN tenants t ON t.id = k.tenant_id
       WHERE k.key_hash = $1 AND k.revoked_at IS NULL AND t.status = 'active'`,
      [hashToken(token)],
    )
    return res.rows.length ? res.rows[0].tenant_id : null
  }
}
