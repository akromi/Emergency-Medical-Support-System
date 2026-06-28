import { describe, it, expect } from 'vitest'
import { newDb } from 'pg-mem'
import { buildApp } from '../src/app.js'
import { OpStore, migrate, type Queryable } from '../src/ops-store.js'
import { TenantStore, migrateTenants } from '../src/tenant-store.js'

// The admin console at GET /console is opt-in (security.adminConsole) and only
// mounts when the admin API is also configured. The page holds no secrets — it
// lives outside the /admin/* bearer gate and prompts for the credential — so it
// is safe to serve unauthenticated; the API gate enforces access.

async function build(security: Record<string, unknown>) {
  const db = newDb()
  const pg = db.adapters.createPg()
  const pool = new pg.Pool() as unknown as Queryable
  await migrate(pool)
  await migrateTenants(pool)
  return buildApp({ store: new OpStore(pool), tenantStore: new TenantStore(pool), security })
}

describe('admin console', () => {
  it('serves the console (HTML, no auth) when enabled + admin configured', async () => {
    const app = await build({ adminToken: 'a', adminConsole: true })
    const res = await app.inject({ method: 'GET', url: '/console' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/html')
    expect(res.body).toContain('Sync Admin')
    expect(res.body).toContain('/admin/tenants') // the page calls the real API
  })

  it('is NOT mounted when the flag is off (default)', async () => {
    const app = await build({ adminToken: 'a' })
    expect((await app.inject({ method: 'GET', url: '/console' })).statusCode).toBe(404)
  })

  it('is NOT mounted when the admin API is unconfigured, even if the flag is on', async () => {
    const app = await build({ adminConsole: true }) // no adminToken / OIDC
    expect((await app.inject({ method: 'GET', url: '/console' })).statusCode).toBe(404)
  })
})
