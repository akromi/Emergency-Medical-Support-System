import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createEmptyRecord, type CasualtyRecord } from '@triage-link/core'
import { recordRepo } from '../src/db/repository'
import { db } from '../src/db/database'
import {
  setVaultPolicy, initVault, getState, isRequired, isEnabled, getKey,
  enableVault, disableVault, lock, _resetForTests,
} from '../src/db/vault'
import { LockScreen } from '../src/components/VaultLock'

const NAME = 'Doe, Jane'
function named(id: string): CasualtyRecord {
  const r = createEmptyRecord(id)
  r.tombstone = { ...r.tombstone, name: NAME }
  return r
}
const rawText = async () => JSON.stringify(await db.records.toArray())

beforeEach(async () => {
  _resetForTests()
  await recordRepo.clear()
  await db.meta.delete('vault')
  await db.meta.delete('vault.policy')
})

describe('always-on encryption policy', () => {
  it('defaults to opt-in (disabled) with no policy', async () => {
    expect(await initVault()).toBe('disabled')
    expect(isRequired()).toBe(false)
  })

  it('requires setup before use when the policy is on', async () => {
    await setVaultPolicy(true)
    expect(await initVault()).toBe('setup')
    expect(isRequired()).toBe(true)
    expect(isEnabled()).toBe(false)
  })

  it('does not write plaintext while required-but-not-set-up', async () => {
    await setVaultPolicy(true)
    await initVault()
    await recordRepo.save(named('CAS-A')) // should be skipped (no key yet)
    expect(await db.records.count()).toBe(0)
  })

  it('refuses to disable a required vault', async () => {
    await setVaultPolicy(true)
    await initVault()
    await enableVault('passphrase-1')
    expect(getState()).toBe('unlocked')
    expect(await disableVault('passphrase-1')).toBe(false) // mandatory — cannot turn off
    expect(isEnabled()).toBe(true)
  })

  it('encrypts records once set up, and locks/unlocks normally', async () => {
    await setVaultPolicy(true)
    await initVault()
    await enableVault('passphrase-1')
    await recordRepo.save(named('CAS-A'))
    expect(await rawText()).not.toContain(NAME)
    lock()
    expect(getState()).toBe('locked') // enabled now, so it's lock — not setup
    expect(getKey()).toBeNull()
  })

  it('setup screen creates a passphrase and unlocks the vault', async () => {
    await setVaultPolicy(true)
    await initVault()
    expect(getState()).toBe('setup')

    render(<LockScreen />)
    expect(screen.getByText('Set up encryption')).toBeTruthy()
    const [pass, confirm] = screen.getAllByPlaceholderText(/Passphrase|Confirm/)
    const user = userEvent.setup()

    // Mismatch is rejected.
    await user.type(pass, 'correct-horse')
    await user.type(confirm, 'wrong-horse')
    await user.click(screen.getByRole('button', { name: 'Set passphrase' }))
    expect(screen.getByText('Passphrases don’t match.')).toBeTruthy()
    expect(getState()).toBe('setup')

    // Matching passphrase enables + unlocks.
    await user.clear(confirm)
    await user.type(confirm, 'correct-horse')
    await user.click(screen.getByRole('button', { name: 'Set passphrase' }))
    await waitFor(() => expect(isEnabled()).toBe(true), { timeout: 5000 })
    expect(getState()).toBe('unlocked')
  })
})
