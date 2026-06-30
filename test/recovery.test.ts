import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../src/db/database'
import { listAudit } from '../src/db/audit'
import {
  addOperator, setActiveOperator, getActiveOperator, listOperators,
  _resetOperatorsForTests,
} from '../src/db/operators'
import {
  recoveryCodeExists, generateRecoveryCode, ensureRecoveryCode,
  verifyRecoveryCode, recoverWithCode, localResetCredentials,
} from '../src/db/recovery'

beforeEach(async () => {
  _resetOperatorsForTests()
  await db.audit.clear()
  await db.operators.clear()
  await db.records.clear()
  await db.meta.delete('operator.active')
  await db.meta.delete('audit.head')
  await db.meta.delete('op.recovery')
})

describe('admin-access recovery ladder', () => {
  it('issues a code (hash only at rest), and verifies it case/format-insensitively', async () => {
    expect(await recoveryCodeExists()).toBe(false)
    const code = await generateRecoveryCode()
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/)
    expect(await recoveryCodeExists()).toBe(true)

    // Stored value is a salted hash, never the plaintext code.
    const stored = (await db.meta.get('op.recovery'))?.value ?? ''
    expect(stored).not.toContain(code.replace(/-/g, ''))

    expect(await verifyRecoveryCode(code)).toBe(true)
    expect(await verifyRecoveryCode(code.toLowerCase().replace(/-/g, ' '))).toBe(true) // forgiving
    expect(await verifyRecoveryCode('WRON-GWRO-NGWR')).toBe(false)
    expect(await verifyRecoveryCode('')).toBe(false)
  })

  it('ensureRecoveryCode issues once, then leaves the existing code in place', async () => {
    const first = await ensureRecoveryCode()
    expect(first).toBeTruthy()
    expect(await ensureRecoveryCode()).toBeNull()
    expect(await verifyRecoveryCode(first as string)).toBe(true) // unchanged
  })

  it('regenerating invalidates the previous code', async () => {
    const a = await generateRecoveryCode()
    const b = await generateRecoveryCode()
    expect(b).not.toBe(a)
    expect(await verifyRecoveryCode(a)).toBe(false)
    expect(await verifyRecoveryCode(b)).toBe(true)
  })

  it('a correct code clears admin PINs (and only those); wrong code changes nothing', async () => {
    const admin = await addOperator('Chief', 'admin', '1234')
    const field = await addOperator('Medic', 'field', '5678')
    const code = await generateRecoveryCode()

    expect(await recoverWithCode('NOPE-NOPE-NOPE')).toBe(false)
    expect((await db.operators.get(admin.id))?.pinHash).toBeTruthy() // untouched

    expect(await recoverWithCode(code)).toBe(true)
    expect((await db.operators.get(admin.id))?.pinHash).toBeUndefined() // admin PIN cleared
    expect((await db.operators.get(field.id))?.pinHash).toBeTruthy()    // field PIN kept

    const log = await listAudit()
    expect(log.map((e) => e.detail)).toEqual(expect.arrayContaining(['fail', 'ok']))
  })

  it('local reset clears every sign-in + the code, but keeps casualty records', async () => {
    const admin = await addOperator('Chief', 'admin', '1234')
    await setActiveOperator(admin.id)
    await generateRecoveryCode()
    await db.records.put({ id: 'r1', updatedAt: 1 } as never) // a casualty record exists

    await localResetCredentials()

    expect(await listOperators()).toHaveLength(0)
    expect(getActiveOperator()).toBeNull()
    expect(await recoveryCodeExists()).toBe(false)
    expect(await db.records.get('r1')).toBeTruthy()            // records preserved
    expect((await listAudit()).some((e) => e.action === 'auth.recovery.localreset')).toBe(true)
  })
})
