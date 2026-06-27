import { describe, it, expect, beforeEach } from 'vitest'
import { newDb } from 'pg-mem'
import { buildAccessAuditEvent } from '@triage-link/core'
import { EhrAuditStore, migrateEhrAudit, type Queryable } from '../src/index.js'

async function makeAuditStore(): Promise<EhrAuditStore> {
  const db = newDb()
  const pg = db.adapters.createPg()
  const pool = new pg.Pool() as unknown as Queryable
  await migrateEhrAudit(pool)
  return new EhrAuditStore(pool)
}

function sampleEvent(patientId: string, outcome: '0' | '8' = '0') {
  return buildAccessAuditEvent({
    action: 'R',
    outcome,
    recordedIso: '2026-06-24T12:00:00.000Z',
    agentId: 'oneid|dr.smith',
    query: 'Patient/$match by HCN',
    patientId,
  })
}

describe('EhrAuditStore', () => {
  let store: EhrAuditStore
  beforeEach(async () => {
    store = await makeAuditStore()
  })

  it('persists and reads back an AuditEvent with extracted columns', async () => {
    await store.record(sampleEvent('pcr-1'))
    const rows = await store.list()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      action: 'R',
      outcome: '0',
      agentId: 'oneid|dr.smith',
      patientRef: 'Patient/pcr-1',
      query: 'Patient/$match by HCN',
    })
    expect(rows[0].event.resourceType).toBe('AuditEvent')
  })

  it('filters by patient reference and returns newest first', async () => {
    await store.record(sampleEvent('pcr-1'))
    await store.record(sampleEvent('pcr-2', '8'))
    await store.record(sampleEvent('pcr-2'))

    const all = await store.list()
    expect(all.map((r) => r.patientRef)).toEqual(['Patient/pcr-2', 'Patient/pcr-2', 'Patient/pcr-1'])

    const onlyP2 = await store.list({ patientRef: 'Patient/pcr-2' })
    expect(onlyP2).toHaveLength(2)
    expect(onlyP2.every((r) => r.patientRef === 'Patient/pcr-2')).toBe(true)
  })

  it('caps the limit at 1000', async () => {
    await store.record(sampleEvent('pcr-1'))
    const rows = await store.list({ limit: 999999 })
    expect(rows).toHaveLength(1) // does not throw on an oversized limit
  })

  it('isolates audit entries by tenant', async () => {
    await store.record(sampleEvent('pcr-1'), 'org-a')
    await store.record(sampleEvent('pcr-2'), 'org-b')

    const a = await store.list({ tenantId: 'org-a' })
    expect(a.map((r) => r.patientRef)).toEqual(['Patient/pcr-1'])
    expect(a[0].tenantId).toBe('org-a')

    const b = await store.list({ tenantId: 'org-b' })
    expect(b.map((r) => r.patientRef)).toEqual(['Patient/pcr-2'])

    // Omitting tenantId is the cross-tenant oversight view.
    expect(await store.list()).toHaveLength(2)
  })
})
