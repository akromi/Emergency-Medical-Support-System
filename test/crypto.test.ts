import { describe, it, expect } from 'vitest'
import {
  deriveKey, randomSaltB64, encryptString, decryptString, encryptJson, decryptJson,
} from '../src/db/crypto'

describe('at-rest crypto (AES-GCM + PBKDF2)', () => {
  it('round-trips a string through derive → encrypt → decrypt', async () => {
    const salt = randomSaltB64()
    const key = await deriveKey('correct horse battery staple', salt, 1000)
    const blob = await encryptString(key, 'patient: Doe, Jane')
    expect(blob).toMatch(/^v1:[^:]+:[^:]+$/)
    expect(blob).not.toContain('Doe') // ciphertext doesn't leak plaintext
    expect(await decryptString(key, blob)).toBe('patient: Doe, Jane')
  })

  it('round-trips structured JSON', async () => {
    const key = await deriveKey('pw', randomSaltB64(), 1000)
    const value = { id: 'CAS-1', injuries: [{ region: 'Chest', severity: 'critical' }] }
    expect(await decryptJson(key, await encryptJson(key, value))).toEqual(value)
  })

  it('fails to decrypt with the wrong passphrase (authenticated encryption)', async () => {
    const salt = randomSaltB64()
    const right = await deriveKey('right', salt, 1000)
    const wrong = await deriveKey('wrong', salt, 1000)
    const blob = await encryptString(right, 'secret')
    await expect(decryptString(wrong, blob)).rejects.toBeTruthy()
  })

  it('uses a fresh IV per encryption (same input → different ciphertext)', async () => {
    const key = await deriveKey('pw', randomSaltB64(), 1000)
    expect(await encryptString(key, 'x')).not.toBe(await encryptString(key, 'x'))
  })

  it('rejects a tampered ciphertext', async () => {
    const key = await deriveKey('pw', randomSaltB64(), 1000)
    const blob = await encryptString(key, 'integrity matters')
    const tampered = blob.slice(0, -2) + (blob.endsWith('A') ? 'B' : 'A')
    await expect(decryptString(key, tampered)).rejects.toBeTruthy()
  })
})
