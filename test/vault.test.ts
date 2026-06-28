import { beforeEach, describe, expect, it } from 'vitest'
import { createEmptyRecord, type CasualtyRecord } from '@triage-link/core'
import { recordRepo } from '../src/db/repository'
import { db } from '../src/db/database'
import {
  enableVault, disableVault, unlock, lock, getState, isEnabled, getKey, _resetForTests,
} from '../src/db/vault'

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

// The 8-byte PNG file signature. We assert presence/absence of the WHOLE
// signature rather than a single byte: AES-GCM ciphertext is effectively random,
// so a one-byte "not 0x89" check false-fails ~1/256 of the time when the first
// ciphertext byte happens to collide with the header. Matching all 8 bytes drops
// that to ~2^-64 while keeping the intent ("at rest it isn't the plaintext PNG").
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const startsWithPng = (bytes: Uint8Array): boolean =>
  PNG_SIG.every((b, i) => bytes[i] === b)

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
    // Plaintext PNG signature present when not encrypted.
    expect(startsWithPng(photo.bytes)).toBe(true)
  })

  it('encrypts existing photos when enabled and stays readable', async () => {
    await recordRepo.save(recordWithPhoto('CASE-A'))

    await enableVault('correct horse battery staple')
    expect(getState()).toBe('unlocked')
    expect(isEnabled()).toBe(true)

    const [photo] = await db.photos.toArray()
    expect(ArrayBuffer.isView(photo.iv)).toBe(true); expect(photo.iv!.length).toBe(12)
    expect(startsWithPng(photo.bytes)).toBe(false) // ciphertext, not the PNG header

    // Transparent decryption on read while unlocked.
    const got = await recordRepo.get('CASE-A')
    expect(got!.injuries[0].photos[0]).toBe(TINY_PNG)
  })

  it('hides the whole record when locked and reveals it after unlock', async () => {
    await recordRepo.save(recordWithPhoto('CASE-A'))
    await enableVault('passphrase-1')

    lock()
    expect(getState()).toBe('locked')
    expect(getKey()).toBeNull()
    // Sealed record + ops are unreadable while locked: get() returns undefined,
    // list() returns nothing.
    expect(await recordRepo.get('CASE-A')).toBeUndefined()
    expect(await recordRepo.list()).toEqual([])

    expect(await unlock('wrong')).toBe(false)
    expect(getState()).toBe('locked')

    expect(await unlock('passphrase-1')).toBe(true)
    const unlocked = await recordRepo.get('CASE-A')
    expect(unlocked!.injuries[0].photos[0]).toBe(TINY_PNG) // record + photo readable again
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
    expect(startsWithPng(photo.bytes)).toBe(true) // plaintext PNG header restored
    expect((await recordRepo.get('CASE-A'))!.injuries[0].photos[0]).toBe(TINY_PNG)
  })
})
