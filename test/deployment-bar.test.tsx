import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { DeploymentBar } from '../src/components/DeploymentBar'
import { setDeployment } from '../src/db/deployment'
import { addOperator, setActiveOperator, _resetOperatorsForTests } from '../src/db/operators'
import { db } from '../src/db/database'

// The MCI kiosk extension adds an "assign on-duty operator" prompt to the bar:
// in MCI mode a shared device should have a named operator on duty so records
// are attributed. Off (the default), the bar is unchanged.

beforeEach(async () => {
  try { localStorage.clear() } catch { /* ignore */ }
  setDeployment({ operation: '', kind: '', org: '', mci: false })
  _resetOperatorsForTests()
  await db.operators.clear()
})
afterEach(async () => {
  await setActiveOperator(null)
  _resetOperatorsForTests()
})

describe('DeploymentBar — MCI operator-required prompt', () => {
  it('does not prompt for an operator when MCI is off', () => {
    render(<DeploymentBar onOperators={() => {}} />)
    expect(screen.queryByText(/assign on-duty operator/i)).toBeNull()
  })

  it('prompts to assign an operator in MCI mode with nobody on duty', () => {
    setDeployment({ mci: true })
    const onOperators = vi.fn()
    render(<DeploymentBar onOperators={onOperators} />)
    const btn = screen.getByText(/assign on-duty operator/i)
    fireEvent.click(btn)
    expect(onOperators).toHaveBeenCalledTimes(1)
  })

  it('stops prompting once an operator is on duty', async () => {
    setDeployment({ mci: true })
    const op = await addOperator('Medic A', 'lead')
    await setActiveOperator(op.id)
    render(<DeploymentBar onOperators={() => {}} />)
    expect(screen.queryByText(/assign on-duty operator/i)).toBeNull()
  })
})
