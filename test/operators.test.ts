import { beforeEach, describe, expect, it } from 'vitest'
import { createEmptyRecord } from '@triage-link/core'
import { recordRepo } from '../src/db/repository'
import { db } from '../src/db/database'
import { listAudit } from '../src/db/audit'
import {
  addOperator, listOperators, removeOperator, setActiveOperator, getActiveOperator,
  verifyPin, canViewAdmin, canManageOperators, initOperators, _resetOperatorsForTests,
} from '../src/db/operators'
import { _resetForTests as resetVault } from '../src/db/vault'

beforeEach(async () => {
  resetVault()
  _resetOperatorsForTests()
  await recordRepo.clear()
  await db.audit.clear()
  await db.operators.clear()
  await db.meta.delete('operator.active')
  await db.meta.delete('audit.head')
})

describe('operator roster + attribution + RBAC-lite', () => {
  it('is fully open with an empty roster (community default)', async () => {
    await initOperators()
    expect(canViewAdmin()).toBe(true)
    expect(canManageOperators()).toBe(true)
    expect(getActiveOperator()).toBeNull()
  })

  it('adds operators and activates one', async () => {
    const a = await addOperator('Medic A', 'admin')
    await addOperator('Medic B', 'field')
    expect((await listOperators()).map((o) => o.name)).toEqual(['Medic A', 'Medic B'])
    await setActiveOperator(a.id)
    expect(getActiveOperator()?.name).toBe('Medic A')
  })

  it('gates admin views by role once a roster exists', async () => {
    const field = await addOperator('Medic F', 'field')
    await setActiveOperator(field.id)
    expect(canViewAdmin()).toBe(false) // field can't see audit/admin
    expect(canManageOperators()).toBe(false)

    const lead = await addOperator('Medic L', 'lead')
    await setActiveOperator(lead.id)
    expect(canViewAdmin()).toBe(true)
    expect(canManageOperators()).toBe(false) // only admin manages
  })

  it('attributes a newly saved record to the active operator', async () => {
    const op = await addOperator('Dr. Roe', 'lead')
    await setActiveOperator(op.id)
    await recordRepo.save(createEmptyRecord('CAS-A'))
    const rec = await recordRepo.get('CAS-A')
    expect(rec!.author).toEqual({ id: op.id, name: 'Dr. Roe' })
  })

  it('leaves records unattributed when no operator is active', async () => {
    await recordRepo.save(createEmptyRecord('CAS-A'))
    expect((await recordRepo.get('CAS-A'))!.author).toBeUndefined()
  })

  it('stamps the audit actor with the active operator', async () => {
    const op = await addOperator('Dr. Roe', 'admin')
    await setActiveOperator(op.id)
    await recordRepo.save(createEmptyRecord('CAS-A'))
    const create = (await listAudit()).find((a) => a.action === 'record.create')
    expect(create!.actor).toBe('Dr. Roe (admin)')
  })

  it('verifies an optional PIN', async () => {
    const op = await addOperator('Dr. Roe', 'admin', '1234')
    expect(await verifyPin(op.id, '1234')).toBe(true)
    expect(await verifyPin(op.id, '0000')).toBe(false)
    const noPin = await addOperator('Dr. Doe', 'field')
    expect(await verifyPin(noPin.id, 'anything')).toBe(true) // no PIN → always ok
  })

  it('clears the active operator when it is removed', async () => {
    const op = await addOperator('Dr. Roe', 'admin')
    await setActiveOperator(op.id)
    await removeOperator(op.id)
    expect(getActiveOperator()).toBeNull()
    expect(canManageOperators()).toBe(true) // roster empty again → open
  })
})
