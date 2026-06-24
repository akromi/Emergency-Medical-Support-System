import { describe, it, expect, beforeAll } from 'vitest'
import { newDb } from 'pg-mem'
import { MockGateway } from '@triage-link/ehr-gateway'
import { buildApp } from '../src/app.js'
import { OpStore, migrate, type Queryable } from '../src/ops-store.js'
import { EhrAuditStore, migrateEhrAudit } from '../src/ehr-audit-store.js'

// Contract test: the /docs OpenAPI document must stay honest about the real
// routes. We assert the expected EHR operations are documented, and that every
// request EXAMPLE advertised in the doc actually succeeds when sent to the live
// app (stubbed by MockGateway). If a route or its example drifts from the docs,
// this fails — so "Try it out" in Swagger always works.

function makePool(): Queryable {
  const db = newDb()
  const pg = db.adapters.createPg()
  return new pg.Pool() as unknown as Queryable
}

interface OpenApiOperation {
  tags?: string[]
  summary?: string
  requestBody?: { content?: { 'application/json'?: { example?: unknown } } }
}
type OpenApiDoc = { openapi: string; paths: Record<string, Record<string, OpenApiOperation>> }

describe('OpenAPI contract (/docs) ⇄ live EHR routes', () => {
  let app: ReturnType<typeof buildApp>
  let doc: OpenApiDoc

  beforeAll(async () => {
    const pool = makePool()
    await migrate(pool)
    await migrateEhrAudit(pool)
    app = buildApp({ store: new OpStore(pool), ehr: new MockGateway(), ehrAudit: new EhrAuditStore(pool) })
    await app.ready()
    doc = (await app.inject({ method: 'GET', url: '/docs/json' })).json()
  })

  it('is an OpenAPI 3 document', () => {
    expect(doc.openapi).toMatch(/^3\./)
  })

  it('documents every expected EHR operation, tagged "ehr" with a summary', () => {
    const expected: Array<[string, string]> = [
      ['get', '/ehr/health'],
      ['post', '/ehr/patient/$match'],
      ['post', '/ehr/handover'],
      ['get', '/ehr/patient/{id}/context'],
      ['get', '/ehr/audit'],
    ]
    for (const [method, path] of expected) {
      const op = doc.paths?.[path]?.[method]
      expect(op, `${method.toUpperCase()} ${path} is missing from the OpenAPI doc`).toBeTruthy()
      expect(op.tags).toContain('ehr')
      expect(typeof op.summary).toBe('string')
    }
  })

  it('every documented request example actually succeeds (docs stay honest)', async () => {
    let checked = 0
    for (const [path, item] of Object.entries(doc.paths)) {
      for (const [method, op] of Object.entries(item)) {
        const example = op.requestBody?.content?.['application/json']?.example
        if (example === undefined) continue
        const res = await app.inject({ method: method.toUpperCase() as 'POST', url: path, payload: example as object })
        expect(res.statusCode, `${method.toUpperCase()} ${path} rejected its own documented example: ${res.body}`).toBeLessThan(300)
        checked++
      }
    }
    expect(checked).toBeGreaterThanOrEqual(2) // $match + handover at minimum
  })

  it('the documented $match example resolves a patient', async () => {
    const example = doc.paths['/ehr/patient/$match'].post.requestBody!.content!['application/json']!.example
    const res = await app.inject({ method: 'POST', url: '/ehr/patient/$match', payload: example as object })
    expect(res.json()).toMatchObject({ provider: 'mock', resolved: true })
  })

  it('the documented handover example is accepted (Send to EHR)', async () => {
    const example = doc.paths['/ehr/handover'].post.requestBody!.content!['application/json']!.example
    const res = await app.inject({ method: 'POST', url: '/ehr/handover', payload: example as object })
    expect(res.json()).toMatchObject({ provider: 'mock', accepted: true })
  })
})
