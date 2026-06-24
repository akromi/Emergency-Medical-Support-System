import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createEmptyRecord } from '@triage-link/core'
import { EhrTestConsole } from '../src/components/EhrTestConsole'

describe('EHR Test Lab (in-browser MockGateway)', () => {
  it('runs the full scenario suite and every scenario passes', async () => {
    const user = userEvent.setup()
    render(<EhrTestConsole record={createEmptyRecord('CASE-T')} onClose={() => {}} />)

    await user.click(screen.getByRole('button', { name: /Run all/ }))

    // All six scenarios resolve to PASS.
    const summary = await screen.findByText(/scenarios passed/, {}, { timeout: 4000 })
    expect(summary.textContent).toMatch(/^6\/6 scenarios passed$/)
    expect(screen.queryAllByText('FAIL')).toHaveLength(0)
    expect(screen.getAllByText('PASS').length).toBe(6)
  })

  it('Send to EHR contributes a handover and shows the FHIR transaction bundle', async () => {
    const user = userEvent.setup()
    render(<EhrTestConsole record={createEmptyRecord('CASE-T')} onClose={() => {}} />)

    await user.click(screen.getByRole('button', { name: /Manual console/ }))
    await user.click(screen.getByRole('button', { name: 'Send to EHR' }))
    await user.click(screen.getByRole('button', { name: /Run request/ }))

    expect(await screen.findByText(/Ontario contribution Bundle/)).toBeInTheDocument()
    expect(screen.getAllByText(/accepted/).length).toBeGreaterThan(0)
  })

  it('simulated outage surfaces a retryable failure on Send to EHR', async () => {
    const user = userEvent.setup()
    render(<EhrTestConsole record={createEmptyRecord('CASE-T')} onClose={() => {}} />)

    await user.click(screen.getByRole('button', { name: /Manual console/ }))
    await user.click(screen.getByRole('button', { name: 'Send to EHR' }))
    await user.click(screen.getByLabelText(/Simulate EHR outage/))
    await user.click(screen.getByRole('button', { name: /Run request/ }))

    // The response JSON shows the EhrError with the unavailable code.
    expect(await screen.findByText(/EhrError\[unavailable/)).toBeInTheDocument()
  })
})
