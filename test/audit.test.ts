import { beforeEach, describe, expect, it } from 'vitest'
import { createEmptyRecord } from '@triage-link/core'
import { recordRepo } from '../src/db/repository'
import { db } from '../src/db/database'
import { audit, listAudit, verifyAudit, type AuditAction } from '../src/db/audit'
import { _resetForTests } from '../src/db/vault'

beforeEach(async () => {
  _resetForTests()
  await recordRepo.clear()
  await db.audit.clear()
  await db.meta.delete('audit.head')
  await db.meta.delete('vault')
  await db.meta.delete('vault.policy')
})

describe('hash-chained audit log', () => {
  it('appends entries linked by hash, in order', async () => {
    await audit('record.view', { recordId: 'CAS-1' })
    await audit('record.export', { recordId: 'CAS-1' })
    const rows = await listAudit()
    expect(rows.map((r) => r.action)).toEqual(['record.view', 'record.export'])
    expect(rows[0].prevHash).toBe('genesis')
    expect(rows[1].prevHash).toBe(rows[0].hash) // chained
    expect(rows[0].hash).not.toBe(rows[1].hash)
  })

  it('verifies an intact chain', async () => {
    for (const a of ['record.create', 'record.view', 'vault.lock'] as AuditAction[]) await audit(a)
    const res = await verifyAudit()
    expect(res.ok).toBe(true)
    expect(res.count).toBe(3)
  })

  it('detects a tampered entry', async () => {
    await audit('record.create', { recordId: 'CAS-1' })
    await audit('record.view', { recordId: 'CAS-1' })
    await audit('record.export', { recordId: 'CAS-1' })

    // Tamper: rewrite a stored entry's action without recomputing the chain.
    const rows = await listAudit()
    await db.audit.update(rows[1].seq!, { action: 'record.delete' })

    const res = await verifyAudit()
    expect(res.ok).toBe(false)
    expect(res.brokenAtSeq).toBe(rows[1].seq)
  })

  it('detects a deleted (excised) entry', async () => {
    await audit('record.create')
    await audit('record.view')
    await audit('record.export')
    const rows = await listAudit()
    await db.audit.delete(rows[1].seq!) // remove the middle link

    const res = await verifyAudit()
    expect(res.ok).toBe(false) // entry 3's prevHash no longer matches its predecessor
  })

  it('records a create event when a new record is saved', async () => {
    await recordRepo.save(createEmptyRecord('CAS-A'))
    const rows = await listAudit()
    const create = rows.find((r) => r.action === 'record.create')
    expect(create).toBeTruthy()
    expect(create!.recordId).toBe('CAS-A')
    expect((await verifyAudit()).ok).toBe(true)
  })

  it('records a delete event when a record is removed', async () => {
    await recordRepo.save(createEmptyRecord('CAS-A'))
    await recordRepo.remove('CAS-A')
    const actions = (await listAudit()).map((r) => r.action)
    expect(actions).toContain('record.delete')
  })

  it('does not audit per-edit autosaves (only creation)', async () => {
    const r = createEmptyRecord('CAS-A')
    await recordRepo.save(r) // create
    r.tombstone = { ...r.tombstone, name: 'Doe' }
    await recordRepo.save(r) // update — should NOT add an audit row
    const creates = (await listAudit()).filter((a) => a.action === 'record.create')
    const updates = (await listAudit()).filter((a) => a.action.startsWith('record.update'))
    expect(creates).toHaveLength(1)
    expect(updates).toHaveLength(0)
  })
})
