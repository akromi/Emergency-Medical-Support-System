import { beforeEach, describe, expect, it } from 'vitest'
import { createEmptyRecord, type CasualtyRecord } from '@triage-link/core'
import { recordRepo } from '../src/db/repository'
import { db } from '../src/db/database'
import { enableVault, disableVault, unlock, lock, _resetForTests } from '../src/db/vault'

const NAME = 'Doe, Jane'
function namedRecord(id: string): CasualtyRecord {
  const r = createEmptyRecord(id)
  r.tombstone = { ...r.tombstone, name: NAME }
  r.injuries.push({
    id: 'inj-1', view: 'anterior', x: 1, y: 2, region: 'Chest',
    type: 'laceration', severity: 'moderate', notes: 'secret note', photos: [],
  })
  return r
}

const rawText = async (): Promise<string> => JSON.stringify(await db.records.toArray()) + JSON.stringify(await db.ops.toArray())

beforeEach(async () => {
  _resetForTests()
  await recordRepo.clear()
  await db.meta.delete('vault')
})

describe('record + op-log text encryption at rest', () => {
  it('leaves PHI in the clear when the vault is off (default)', async () => {
    await recordRepo.save(namedRecord('CAS-A'))
    expect(await rawText()).toContain(NAME)
  })

  it('encrypts existing records and ops when the vault is enabled', async () => {
    await recordRepo.save(namedRecord('CAS-A'))
    await enableVault('passphrase-123')

    const raw = await rawText()
    expect(raw).not.toContain(NAME) // no plaintext name in records or ops
    expect(raw).not.toContain('secret note')
    // Rows keep their clear index keys but carry an `enc` blob.
    const [rec] = await db.records.toArray()
    expect(rec.id).toBe('CAS-A')
    expect((rec as { enc?: string }).enc).toMatch(/^v1:/)
    expect((await db.ops.toArray()).every((o) => typeof (o as { enc?: string }).enc === 'string')).toBe(true)

    // Transparent read-back while unlocked.
    expect((await recordRepo.get('CAS-A'))!.tombstone.name).toBe(NAME)
    expect((await recordRepo.list())[0].tombstone.name).toBe(NAME)
  })

  it('encrypts records saved while the vault is already on', async () => {
    await enableVault('pw-abcdefgh')
    await recordRepo.save(namedRecord('CAS-B'))
    expect(await rawText()).not.toContain(NAME)
    expect((await recordRepo.get('CAS-B'))!.tombstone.name).toBe(NAME)
  })

  it('round-trips edits (op-log diff) under the vault', async () => {
    await enableVault('pw-abcdefgh')
    await recordRepo.save(namedRecord('CAS-C'))
    const r = await recordRepo.get('CAS-C')
    r!.tombstone = { ...r!.tombstone, name: 'Roe, John' }
    await recordRepo.save(r!)
    expect((await recordRepo.get('CAS-C'))!.tombstone.name).toBe('Roe, John')
    expect(await rawText()).not.toContain('Roe, John')
  })

  it('does not write plaintext when a save races an auto-lock', async () => {
    await recordRepo.save(namedRecord('CAS-D'))
    await enableVault('pw-locking1')
    lock()
    // A debounced save firing after lock must not persist plaintext.
    await recordRepo.save(namedRecord('CAS-D'))
    expect(await rawText()).not.toContain(NAME)
    expect(await unlock('pw-locking1')).toBe(true)
  })

  it('decrypts everything back to plaintext when disabled', async () => {
    await recordRepo.save(namedRecord('CAS-A'))
    await enableVault('secret-pass')
    expect(await disableVault('secret-pass')).toBe(true)

    const raw = await rawText()
    expect(raw).toContain(NAME) // plaintext restored in records + ops
    const [rec] = await db.records.toArray()
    expect((rec as { enc?: string }).enc).toBeUndefined()
    expect((rec as CasualtyRecord).tombstone.name).toBe(NAME)
  })
})
