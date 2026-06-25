import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { recordRepo } from '../src/db/repository'

// The camera is a file-input + canvas dance that jsdom can't drive — stub it.
vi.mock('../src/photo', () => ({ capturePhoto: vi.fn().mockResolvedValue('data:image/jpeg;base64,AAAA') }))

import { App } from '../src/App'

beforeEach(async () => { await recordRepo.clear() })

describe('App — core flows (jsdom)', () => {
  it('mounts with the field record chrome', async () => {
    render(<App />)
    expect(await screen.findByText(/TRIAGE-LINK/)).toBeInTheDocument()
    expect(screen.getByText(/Field Casualty Record/)).toBeInTheDocument()
  })

  it('records a timestamped set of vitals', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.type(screen.getByPlaceholderText('bpm'), '120')
    await user.click(screen.getByRole('button', { name: 'Record vitals' }))
    // Shown both in the vitals log and the acuity glance.
    expect((await screen.findAllByText('HR 120')).length).toBeGreaterThan(0)
  })

  it('computes GCS from eye/verbal/motor into the vitals field', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByText(/GCS calculator/))
    await user.selectOptions(screen.getByLabelText('GCS verbal'), '4') // Confused
    const gcs = screen.getByPlaceholderText(/3.15/) as HTMLInputElement
    expect(gcs.value).toBe('14 (E4 V4 M6)')
  })

  it('opens the casualty card with an AT-MIST handover block', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /Summary/ }))
    expect(await screen.findByText('AT-MIST handover')).toBeInTheDocument()
    // Strings unique to the AT-MIST block (vs the incident form behind it).
    expect(screen.getByText(/Age \/ sex/)).toBeInTheDocument()
    expect(screen.getByText(/Time of incident/)).toBeInTheDocument()
  })

  it('derives age from the day/month/year date-of-birth control', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.selectOptions(screen.getByLabelText('Birth day'), '15')
    await user.selectOptions(screen.getByLabelText('Birth month'), '06')
    await user.type(screen.getByLabelText('Birth year'), '2000')
    // A complete DOB drives the "· <age>y from DOB" note next to the age band.
    expect(await screen.findByText(/from DOB/)).toBeInTheDocument()
  })

  it('sets triage from the header tag', async () => {
    const user = userEvent.setup()
    render(<App />)
    const triagebar = screen.getByLabelText('Triage category')
    await user.click(within(triagebar).getByRole('button', { name: /Immediate/ }))
    // Reflected in the triage bar's current-label and the acuity glance.
    expect((await screen.findAllByText(/Immediate \(Red\)/)).length).toBeGreaterThan(0)
  })
})
