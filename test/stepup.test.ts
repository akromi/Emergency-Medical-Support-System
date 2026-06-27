import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../src/db/database'
import { listAudit } from '../src/db/audit'
import {
  addOperator, setActiveOperator, setOperatorPin, getActiveOperator,
  initOperators, _resetOperatorsForTests,
} from '../src/db/operators'
import { requireStepUp, requireManageStepUp, stepUpActive } from '../src/db/stepup'
import { _resetForTests as resetVault } from '../src/db/vault'

// A passthrough translator (the gate only needs the key string back).
const t = (k: string) => k

beforeEach(async () => {
  resetVault()
  _resetOperatorsForTests()
  await db.audit.clear()
  await db.operators.clear()
  await db.meta.delete('operator.active')
  await db.meta.delete('audit.head')
})

afterEach(() => vi.restoreAllMocks())

describe('step-up re-auth gate (login password for sensitive actions)', () => {
  it('is a no-op with an empty roster — proceeds, no prompt', async () => {
    await initOperators()
    const prompt = vi.spyOn(window, 'prompt')
    expect(stepUpActive()).toBe(false)
    expect(await requireStepUp(t, 'audit.view')).toBe(true)
    expect(prompt).not.toHaveBeenCalled()
    expect(await listAudit()).toHaveLength(0)
  })

  it('is a no-op when the on-duty operator has no PIN', async () => {
    const op = await addOperator('Medic A', 'admin') // no PIN
    await setActiveOperator(op.id)
    const prompt = vi.spyOn(window, 'prompt')
    expect(stepUpActive()).toBe(false)
    expect(await requireStepUp(t, 'backup.export')).toBe(true)
    expect(prompt).not.toHaveBeenCalled()
  })

  it('prompts and proceeds on the correct PIN, logging the attempt', async () => {
    const op = await addOperator('Medic A', 'admin', '1234')
    await setActiveOperator(op.id)
    vi.spyOn(window, 'prompt').mockReturnValue('1234')
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
    vi.spyOn(window, 'prompt').mockReturnValue('0000')
    expect(await requireStepUp(t, 'record.delete')).toBe(false)
    const log = await listAudit()
    expect(log).toHaveLength(1)
    expect(log[0].detail).toBe('record.delete:fail')
  })

  it('aborts silently (no audit) when the prompt is cancelled', async () => {
    const op = await addOperator('Medic A', 'admin', '1234')
    await setActiveOperator(op.id)
    vi.spyOn(window, 'prompt').mockReturnValue(null)
    expect(await requireStepUp(t, 'audit.view')).toBe(false)
    expect(await listAudit()).toHaveLength(0)
  })

  it('still requires a PIN to manage the roster when signed OUT (no escalation)', async () => {
    await addOperator('Admin', 'admin', '1234') // a PIN-protected admin exists
    await setActiveOperator(null) // …but nobody is on duty
    const prompt = vi.spyOn(window, 'prompt')

    prompt.mockReturnValue('0000') // wrong → blocked
    expect(await requireManageStepUp(t)).toBe(false)

    prompt.mockReturnValue('1234') // any registered operator PIN → allowed
    expect(await requireManageStepUp(t)).toBe(true)
  })

  it('leaves roster management open while no operator has a PIN (bootstrap)', async () => {
    await addOperator('Medic', 'admin') // no PIN
    await setActiveOperator(null)
    const prompt = vi.spyOn(window, 'prompt')
    expect(await requireManageStepUp(t)).toBe(true)
    expect(prompt).not.toHaveBeenCalled()
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
