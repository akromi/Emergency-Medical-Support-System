import { beforeEach, describe, expect, it } from 'vitest'
import { createEmptyRecord, type CasualtyRecord } from '@triage-link/core'
import { recordRepo } from '../src/db/repository'
import { db } from '../src/db/database'
import { exportAll, importBackup, parseBackup } from '../src/db/backup'

// 1x1 PNG data URL — a stand-in wound photo.
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

function recordWithPhoto(id: string): CasualtyRecord {
  const r = createEmptyRecord(id)
  r.injuries.push({
    id: 'inj-1', view: 'anterior', x: 10, y: 20, region: 'Chest',
    type: 'burn', severity: 'severe', notes: 'n', photos: [TINY_PNG],
  })
  return r
}

beforeEach(async () => { await recordRepo.clear() })

describe('repository — out-of-line photo storage', () => {
  it('stores photos as blobs (ref in record) and rehydrates on get()', async () => {
    await recordRepo.save(recordWithPhoto('CASE-A'))

    const stored = await db.records.get('CASE-A')
    expect(stored!.injuries[0].photos[0]).toMatch(/^idb:/) // record holds only a ref
    expect(await db.photos.count()).toBe(1)

    const got = await recordRepo.get('CASE-A')
    expect(got!.injuries[0].photos[0]).toBe(TINY_PNG) // rehydrated for display
  })

  it('list() stays lightweight — refs are not rehydrated', async () => {
    await recordRepo.save(recordWithPhoto('CASE-A'))
    const [row] = await recordRepo.list()
    expect(row.injuries[0].photos[0]).toMatch(/^idb:/)
  })

  it('garbage-collects orphaned blobs when a photo is removed', async () => {
    await recordRepo.save(recordWithPhoto('CASE-A'))
    expect(await db.photos.count()).toBe(1)

    const r = await recordRepo.get('CASE-A')
    r!.injuries[0].photos = []
    await recordRepo.save(r!)
    expect(await db.photos.count()).toBe(0)
  })

  it('deletes the record’s blobs when the record is removed', async () => {
    await recordRepo.save(recordWithPhoto('CASE-A'))
    await recordRepo.remove('CASE-A')
    expect(await db.photos.count()).toBe(0)
    expect(await db.records.count()).toBe(0)
  })
})

describe('backup — export / import', () => {
  it('round-trips records with photos embedded (portable)', async () => {
    await recordRepo.save(recordWithPhoto('CASE-A'))

    const backup = await exportAll()
    expect(backup.app).toBe('triage-link')
    expect(backup.records).toHaveLength(1)
    expect(backup.records[0].injuries[0].photos[0]).toBe(TINY_PNG) // embedded, not a ref

    const text = JSON.stringify(backup)
    await recordRepo.clear()
    const n = await importBackup(parseBackup(text), 'replace')
    expect(n).toBe(1)

    const got = await recordRepo.get('CASE-A')
    expect(got!.injuries[0].photos[0]).toBe(TINY_PNG)
  })

  it('replace wipes existing data before importing', async () => {
    await recordRepo.save(createEmptyRecord('OLD-1'))
    const backup = await exportAll()
    await recordRepo.clear()
    await recordRepo.save(createEmptyRecord('NEW-1'))

    await importBackup(backup, 'replace')
    const ids = (await recordRepo.list()).map((r) => r.id)
    expect(ids).toEqual(['OLD-1']) // NEW-1 wiped, OLD-1 restored
  })

  it('merge keeps the newer copy of a duplicate id', async () => {
    const a = createEmptyRecord('CASE-A')
    a.tombstone.name = 'Old'
    await recordRepo.save(a)
    const backup = await exportAll()

    const local = await recordRepo.get('CASE-A')
    local!.tombstone.name = 'New'
    await recordRepo.save(local!) // local now newer than the backup copy

    const imported = await importBackup(backup, 'merge')
    expect(imported).toBe(0) // older backup copy skipped
    expect((await recordRepo.get('CASE-A'))!.tombstone.name).toBe('New')
  })

  it('rejects files that are not TRIAGE-LINK backups', () => {
    expect(() => parseBackup('not json')).toThrow()
    expect(() => parseBackup('{"app":"something-else","records":[]}')).toThrow()
  })
})
