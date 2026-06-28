import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getDeployment, setDeployment, subscribeDeployment, hasDeployment, DEPLOYMENT_KINDS,
} from '../src/db/deployment'

describe('deployment context store', () => {
  beforeEach(() => {
    try { localStorage.clear() } catch { /* ignore */ }
    setDeployment({ operation: '', kind: '', org: '' }) // reset module state
  })

  it('is blank by default (hasDeployment false)', () => {
    expect(hasDeployment(getDeployment())).toBe(false)
  })

  it('persists a patch and reflects it in getDeployment + localStorage', () => {
    setDeployment({ operation: 'Cyclone Response — Beira', kind: 'flood' })
    setDeployment({ org: 'Red Cross — Sofala' })
    const d = getDeployment()
    expect(d).toMatchObject({ operation: 'Cyclone Response — Beira', kind: 'flood', org: 'Red Cross — Sofala' })
    expect(hasDeployment(d)).toBe(true)
    expect(JSON.parse(localStorage.getItem('tl.deployment')!)).toMatchObject({ kind: 'flood' })
  })

  it('treats any single non-empty field as a deployment', () => {
    setDeployment({ org: 'MSF' })
    expect(hasDeployment(getDeployment())).toBe(true)
  })

  it('notifies subscribers on change and stops after unsubscribe', () => {
    const cb = vi.fn()
    const off = subscribeDeployment(cb)
    setDeployment({ operation: 'Op A' })
    expect(cb).toHaveBeenCalledTimes(1)
    off()
    setDeployment({ operation: 'Op B' })
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('exposes the response-type options', () => {
    expect(DEPLOYMENT_KINDS).toContain('earthquake')
    expect(DEPLOYMENT_KINDS).not.toContain('')
  })
})
