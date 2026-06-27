import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmptyRecord } from '@triage-link/core'
import { db } from '../src/db/database'
import { recordRepo } from '../src/db/repository'
import { syncWithServer } from '../src/db/oplog'
import { _resetForTests as resetVault } from '../src/db/vault'

// The sync client checkpoints the server's `cursor` and replays it as `since`
// on the next sync, so it pulls only the delta instead of full state.

const jsonResponse = (body: unknown): Response =>
  ({ ok: true, status: 200, json: async () => body } as Response)

const bodyOf = (mock: ReturnType<typeof vi.fn>, call: number) =>
  JSON.parse((mock.mock.calls[call][1] as RequestInit).body as string)

beforeEach(async () => {
  resetVault()
  await db.records.clear()
  await db.ops.clear()
  await db.meta.clear()
})
afterEach(() => vi.restoreAllMocks())

describe('sync client cursor checkpointing', () => {
  it('omits `since` on the first sync, then replays the checkpointed cursor', async () => {
    await recordRepo.save(createEmptyRecord('CAS-1')) // local ops to push

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ records: {}, ops: [], cursor: 7 }))
      .mockResolvedValueOnce(jsonResponse({ records: {}, ops: [], cursor: 9 }))
    vi.stubGlobal('fetch', fetchMock)

    await syncWithServer('http://sync.test')
    expect(bodyOf(fetchMock, 0).since).toBeUndefined() // first sync → full pull
    expect((await db.meta.get('sync.cursor'))?.value).toBe('7')

    await syncWithServer('http://sync.test')
    expect(bodyOf(fetchMock, 1).since).toBe(7) // replays the checkpoint
    expect((await db.meta.get('sync.cursor'))?.value).toBe('9')
  })

  it('does not advance the cursor when the response omits one', async () => {
    await recordRepo.save(createEmptyRecord('CAS-1'))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ records: {}, ops: [] })))
    await syncWithServer('http://sync.test')
    expect(await db.meta.get('sync.cursor')).toBeUndefined()
  })

  it('resets the cursor when the store is cleared (forces a full re-pull)', async () => {
    await db.meta.put({ key: 'sync.cursor', value: '5' })
    await recordRepo.clear()
    expect(await db.meta.get('sync.cursor')).toBeUndefined()
  })
})
