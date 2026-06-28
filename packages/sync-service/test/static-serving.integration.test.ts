import { describe, it, expect, beforeEach } from 'vitest'
import { fileURLToPath } from 'node:url'
import { newDb } from 'pg-mem'
import { buildApp } from '../src/app.js'
import { OpStore, migrate, type Queryable } from '../src/ops-store.js'

// Air-gapped single-process deploy: with `staticDir` set, the service serves the
// built PWA from the same origin (so a field laptop runs app + sync in one
// process, offline) while the API still answers under its own prefixes. Default
// unset → API-only, so the hosted backend is byte-for-byte unchanged.

const WEBROOT = fileURLToPath(new URL('./fixtures/webroot', import.meta.url))

async function harness(opts: { staticDir?: string } = {}) {
  const db = newDb()
  const pg = db.adapters.createPg()
  const pool = new pg.Pool() as unknown as Queryable
  await migrate(pool)
  return buildApp({ store: new OpStore(pool), staticDir: opts.staticDir })
}

describe('static PWA serving (air-gapped single-process)', () => {
  describe('with staticDir set', () => {
    let app: Awaited<ReturnType<typeof harness>>
    beforeEach(async () => { app = await harness({ staticDir: WEBROOT }) })

    it('serves index.html at the root', async () => {
      const res = await app.inject({ method: 'GET', url: '/' })
      expect(res.statusCode).toBe(200)
      expect(res.headers['content-type']).toContain('text/html')
      expect(res.body).toContain('app-shell')
    })

    it('serves static assets with the right content type', async () => {
      const res = await app.inject({ method: 'GET', url: '/assets/app.js' })
      expect(res.statusCode).toBe(200)
      expect(res.headers['content-type']).toContain('javascript')
      expect(res.body).toContain('triage-link bundle')
    })

    it('falls back to the app shell for unknown browser routes (SPA)', async () => {
      const res = await app.inject({ method: 'GET', url: '/some/deep/spa/route' })
      expect(res.statusCode).toBe(200)
      expect(res.body).toContain('app-shell')
    })

    it('still serves the API and 404s unknown API paths as JSON (no SPA fallback)', async () => {
      const health = await app.inject({ method: 'GET', url: '/health' })
      expect(health.statusCode).toBe(200)
      expect(health.json()).toMatchObject({ ok: true })

      // An unknown path under an API prefix must 404 as JSON, NOT serve the SPA
      // shell (`/admin/*` isn't mounted here, so it hits the not-found handler).
      const missing = await app.inject({ method: 'GET', url: '/admin/nope' })
      expect(missing.statusCode).toBe(404)
      expect(missing.headers['content-type']).toContain('application/json')
      expect(missing.json()).toMatchObject({ error: 'Not Found', statusCode: 404 })
    })
  })

  describe('without staticDir (API-only, the hosted default)', () => {
    it('404s the root as JSON — no web app is served', async () => {
      const app = await harness()
      const res = await app.inject({ method: 'GET', url: '/' })
      expect(res.statusCode).toBe(404)
      expect(res.headers['content-type']).toContain('application/json')
      expect(res.json()).toMatchObject({ error: 'Not Found', statusCode: 404 })
    })
  })
})
