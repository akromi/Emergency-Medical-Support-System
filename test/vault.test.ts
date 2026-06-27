import { beforeEach, describe, expect, it } from 'vitest'
import { createEmptyRecord, type CasualtyRecord } from '@triage-link/core'
import { recordRepo } from '../src/db/repository'
import { db } from '../src/db/database'
import {
  enableVault, disableVault, unlock, lock, getState, isEnabled, getKey, _resetForTests,
} from '../src/db/vault'

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

beforeEach(async () => {
  _resetForTests()
  await recordRepo.clear()
  await db.meta.delete('vault')
})

describe('photo vault (opt-in at-rest encryption)', () => {
  it('is disabled by default — photos are stored in the clear', async () => {
    expect(getState()).toBe('disabled')
    await recordRepo.save(recordWithPhoto('CASE-A'))
    const [photo] = await db.photos.toArray()
    expect(photo.iv).toBeUndefined()
    // Plaintext PNG signature byte present when not encrypted.
    expect(photo.bytes[0]).toBe(0x89)
  })

  it('encrypts existing photos when enabled and stays readable', async () => {
    await recordRepo.save(recordWithPhoto('CASE-A'))

    await enableVault('correct horse battery staple')
    expect(getState()).toBe('unlocked')
    expect(isEnabled()).toBe(true)

    const [photo] = await db.photos.toArray()
    expect(ArrayBuffer.isView(photo.iv)).toBe(true); expect(photo.iv!.length).toBe(12)
    expect(photo.bytes[0]).not.toBe(0x89) // ciphertext, not the PNG header

    // Transparent decryption on read while unlocked.
    const got = await recordRepo.get('CASE-A')
    expect(got!.injuries[0].photos[0]).toBe(TINY_PNG)
  })

  it('hides photos when locked and reveals them after unlock', async () => {
    await recordRepo.save(recordWithPhoto('CASE-A'))
    await enableVault('passphrase-1')

    lock()
    expect(getState()).toBe('locked')
    expect(getKey()).toBeNull()
    const locked = await recordRepo.get('CASE-A')
    expect(locked!.injuries[0].photos[0]).toMatch(/^idb:/) // unreadable ref, no bytes

    expect(await unlock('wrong')).toBe(false)
    expect(getState()).toBe('locked')

    expect(await unlock('passphrase-1')).toBe(true)
    const unlocked = await recordRepo.get('CASE-A')
    expect(unlocked!.injuries[0].photos[0]).toBe(TINY_PNG)
  })

  it('round-trips photos saved while the vault is on', async () => {
    await enableVault('pw-12345678')
    await recordRepo.save(recordWithPhoto('CASE-B'))
    const [photo] = await db.photos.toArray()
    expect(ArrayBuffer.isView(photo.iv)).toBe(true); expect(photo.iv!.length).toBe(12)
    expect((await recordRepo.get('CASE-B'))!.injuries[0].photos[0]).toBe(TINY_PNG)
  })

  it('disable requires the passphrase and decrypts photos back to plaintext', async () => {
    await recordRepo.save(recordWithPhoto('CASE-A'))
    await enableVault('secret-pass')

    expect(await disableVault('nope')).toBe(false)
    expect(isEnabled()).toBe(true)

    expect(await disableVault('secret-pass')).toBe(true)
    expect(getState()).toBe('disabled')
    const [photo] = await db.photos.toArray()
    expect(photo.iv).toBeUndefined()
    expect(photo.bytes[0]).toBe(0x89) // plaintext PNG header restored
    expect((await recordRepo.get('CASE-A'))!.injuries[0].photos[0]).toBe(TINY_PNG)
  })
})
