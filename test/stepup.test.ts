import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../src/db/database'
import { listAudit } from '../src/db/audit'
import {
  addOperator, setActiveOperator, setOperatorPin, getActiveOperator,
  initOperators, _resetOperatorsForTests,
} from '../src/db/operators'
import { requireStepUp, requireManageStepUp, stepUpActive } from '../src/db/stepup'
import { askSecret } from '../src/db/secret-prompt'
import { _resetForTests as resetVault } from '../src/db/vault'

// The PIN is entered through a masked dialog (askSecret); mock it so the gate
// logic can be driven headlessly (it replaced the clear-text window.prompt).
vi.mock('../src/db/secret-prompt', () => ({ askSecret: vi.fn() }))
const mockAsk = vi.mocked(askSecret)

// A passthrough translator (the gate only needs the key string back).
const t = (k: string) => k

beforeEach(async () => {
  resetVault()
  _resetOperatorsForTests()
  mockAsk.mockReset()
  await db.audit.clear()
  await db.operators.clear()
  await db.meta.delete('operator.active')
  await db.meta.delete('audit.head')
})

afterEach(() => vi.restoreAllMocks())

describe('step-up re-auth gate (login password for sensitive actions)', () => {
  it('is a no-op with an empty roster — proceeds, no prompt', async () => {
    await initOperators()
    expect(stepUpActive()).toBe(false)
    expect(await requireStepUp(t, 'audit.view')).toBe(true)
    expect(mockAsk).not.toHaveBeenCalled()
    expect(await listAudit()).toHaveLength(0)
  })

  it('is a no-op when the on-duty operator has no PIN', async () => {
    const op = await addOperator('Medic A', 'admin') // no PIN
    await setActiveOperator(op.id)
    expect(stepUpActive()).toBe(false)
    expect(await requireStepUp(t, 'backup.export')).toBe(true)
    expect(mockAsk).not.toHaveBeenCalled()
  })

  it('prompts and proceeds on the correct PIN, logging the attempt', async () => {
    const op = await addOperator('Medic A', 'admin', '1234')
    await setActiveOperator(op.id)
    mockAsk.mockResolvedValue('1234')
    expect(stepUpActive()).toBe(true)
    expect(await requireStepUp(t, 'backup.export')).toBe(true)
    const log = await listAudit()
    expect(log).toHaveLength(1)
    expect(log[0].action).toBe('auth.stepup')
    expect(log[0].detail).toBe('backup.export:ok')
  })

  it('blocks and logs a failure on the wrong PIN', async () => {
    const op = await addOperator('Medic A', 'admin', '1234')
    await setActiveOperator(op.id)
    mockAsk.mockResolvedValue('0000')
    expect(await requireStepUp(t, 'record.delete')).toBe(false)
    const log = await listAudit()
    expect(log).toHaveLength(1)
    expect(log[0].detail).toBe('record.delete:fail')
  })

  it('aborts silently (no audit) when the prompt is cancelled', async () => {
    const op = await addOperator('Medic A', 'admin', '1234')
    await setActiveOperator(op.id)
    mockAsk.mockResolvedValue(null)
    expect(await requireStepUp(t, 'audit.view')).toBe(false)
    expect(await listAudit()).toHaveLength(0)
  })

  it('requires an ADMIN PIN to manage when signed OUT (no escalation)', async () => {
    await addOperator('Admin', 'admin', 'admin1') // a PIN-protected admin exists
    await setActiveOperator(null) // …but nobody is on duty

    mockAsk.mockResolvedValue('0000') // wrong → blocked
    expect(await requireManageStepUp(t)).toBe(false)

    mockAsk.mockResolvedValue('admin1') // the admin's PIN → allowed
    expect(await requireManageStepUp(t)).toBe(true)
  })

  it('a non-admin operator’s PIN never unlocks roster management (no self-promotion)', async () => {
    await addOperator('Boss', 'admin', 'admin1')   // admin has a PIN → roster is locked
    const medic = await addOperator('Medic', 'field', 'field1')
    await setActiveOperator(medic.id) // a field op is on duty, knows their own PIN

    mockAsk.mockResolvedValue('field1') // their own (field) PIN must NOT pass
    expect(await requireManageStepUp(t)).toBe(false)

    mockAsk.mockResolvedValue('admin1') // only an admin PIN does
    expect(await requireManageStepUp(t)).toBe(true)
  })

  it('signed-in admin re-auths against their own PIN', async () => {
    const boss = await addOperator('Boss', 'admin', 'admin1')
    await setActiveOperator(boss.id)
    mockAsk.mockResolvedValue('nope'); expect(await requireManageStepUp(t)).toBe(false)
    mockAsk.mockResolvedValue('admin1'); expect(await requireManageStepUp(t)).toBe(true)
  })

  it('stays open only until an admin sets a PIN (bootstrap / post-recovery)', async () => {
    const admin = await addOperator('Medic', 'admin') // admin, but no PIN yet
    await setActiveOperator(null)
    expect(await requireManageStepUp(t)).toBe(true) // bootstrap-open
    expect(mockAsk).not.toHaveBeenCalled()

    await setOperatorPin(admin.id, '4321') // now an admin has a PIN → locked
    mockAsk.mockResolvedValue('4321')
    expect(await requireManageStepUp(t)).toBe(true)

    await setOperatorPin(admin.id, '') // recovery clears the admin PIN → open again
    expect(await requireManageStepUp(t)).toBe(true)
  })

  it('setOperatorPin adds, then clears, the gate', async () => {
    const op = await addOperator('Medic A', 'admin') // no PIN
    await setActiveOperator(op.id)
    expect(stepUpActive()).toBe(false)

    await setOperatorPin(op.id, '4321')
    expect(stepUpActive()).toBe(true)
    expect(getActiveOperator()?.pinHash).toBeTruthy()

    await setOperatorPin(op.id, '') // clear
    expect(stepUpActive()).toBe(false)
    expect((await db.operators.get(op.id))?.pinHash).toBeUndefined()
  })
})
