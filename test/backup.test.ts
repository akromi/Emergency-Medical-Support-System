import { describe, it, expect, vi, beforeEach } from 'vitest'

// recordRepo is the only collaborator exportAll() touches — stub it so the test
// is about the encryption envelope, not IndexedDB.
const sample = { id: 'CAS-1', updatedAt: 5, injuries: [{ region: 'Chest', severity: 'critical' }] }
vi.mock('../src/db/repository', () => ({
  recordRepo: {
    list: vi.fn(async () => [{ id: 'CAS-1' }]),
    get: vi.fn(async () => sample),
  },
}))

import { exportEncrypted, decryptBackup, readBackupFile, isEncryptedBackup } from '../src/db/backup'

describe('encrypted backup', () => {
  beforeEach(() => vi.clearAllMocks())

  it('round-trips: exportEncrypted → decryptBackup recovers the records', async () => {
    const env = await exportEncrypted('correct horse battery staple')
    expect(env.enc).toBe('pbkdf2-aesgcm-v1')
    const json = JSON.stringify(env)
    expect(json).not.toContain('CAS-1') // no plaintext PHI leaks into the file
    expect(json).not.toContain('Chest')

    const restored = await decryptBackup(env, 'correct horse battery staple')
    expect(restored.records).toEqual([sample])
  })

  it('rejects the wrong passphrase', async () => {
    const env = await exportEncrypted('right-passphrase')
    await expect(decryptBackup(env, 'wrong-passphrase')).rejects.toThrow(/passphrase|corrupted/i)
  })

  it('readBackupFile flags an encrypted file and parses a plain one', async () => {
    const env = await exportEncrypted('a-passphrase')
    const encRead = readBackupFile(JSON.stringify(env))
    expect(encRead.encrypted).toBe(true)
    expect(isEncryptedBackup(env)).toBe(true)

    const plain = { app: 'triage-link', format: 1, exportedAt: 1, records: [sample] }
    const plainRead = readBackupFile(JSON.stringify(plain))
    expect(plainRead.encrypted).toBe(false)
    if (!plainRead.encrypted) expect(plainRead.backup.records).toEqual([sample])
  })
})
