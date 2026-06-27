import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { recordRepo } from '../src/db/repository'

// The camera is a file-input + canvas dance that jsdom can't drive — stub it.
vi.mock('../src/photo', () => ({ capturePhoto: vi.fn().mockResolvedValue('data:image/jpeg;base64,AAAA') }))

import { App } from '../src/App'
import { LangProvider } from '../src/i18n'

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

  it('derives age from a typed date of birth', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.type(screen.getByLabelText(/Date of birth/), '2000-06-15')
    // A complete DOB drives the "· <age>y from DOB" note next to the age band.
    expect(await screen.findByText(/from DOB/)).toBeInTheDocument()
  })

  it('opens the calendar popup with a year jump', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Open calendar' }))
    expect(await screen.findByRole('dialog', { name: /Pick date of birth/ })).toBeInTheDocument()
    expect(screen.getByLabelText('Year')).toBeInTheDocument() // year jump
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

describe('App — language toggle (FR)', () => {
  it('switches to French, persists the choice, and restores it on reload', async () => {
    localStorage.removeItem('tl.lang')
    const user = userEvent.setup()
    // The toggle needs a real LangProvider (the default context setter is a no-op).
    const { unmount } = render(<LangProvider><App /></LangProvider>)
    expect(await screen.findByText('Field Casualty Record')).toBeInTheDocument()

    // 🌐 button shows the *other* language; clicking it switches to French.
    await user.click(screen.getByRole('button', { name: /🌐/ }))
    expect(await screen.findByText('Fiche de blessé sur le terrain')).toBeInTheDocument()
    expect(localStorage.getItem('tl.lang')).toBe('fr')

    // Remount (simulating a reload): the stored choice sticks, and the toggle
    // now offers switching back to English.
    unmount()
    render(<LangProvider><App /></LangProvider>)
    expect(await screen.findByText('Fiche de blessé sur le terrain')).toBeInTheDocument()
    // The toggle cycles en → fr → ar, so from French it now offers Arabic.
    expect(screen.getByRole('button', { name: /🌐 AR/ })).toBeInTheDocument()

    localStorage.removeItem('tl.lang')
  })
})

describe('App — Arabic via URL switch (RTL)', () => {
  it('reads ?lang=ar, renders Arabic, sets RTL direction, and persists', async () => {
    localStorage.removeItem('tl.lang')
    window.history.replaceState({}, '', '/?lang=ar')
    try {
      render(<LangProvider><App /></LangProvider>)
      // Header subtitle is in Arabic.
      expect(await screen.findByText('سجل المصابين الميداني')).toBeInTheDocument()
      // Document language + writing direction flip to Arabic / RTL.
      expect(document.documentElement.lang).toBe('ar')
      expect(document.documentElement.dir).toBe('rtl')
      // The URL switch is persisted so it sticks after the param is gone.
      expect(localStorage.getItem('tl.lang')).toBe('ar')
    } finally {
      window.history.replaceState({}, '', '/')
      document.documentElement.dir = 'ltr'
      localStorage.removeItem('tl.lang')
    }
  })
})

describe('App — handover sign-off', () => {
  it('stamps a handover from the receiving clinician and can undo it', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.type(screen.getByLabelText('Receiving clinician'), 'Dr. Smith')
    await user.click(screen.getByRole('button', { name: /Mark handed over/ }))
    // The panel flips to a confirmation badge with the clinician name.
    expect(await screen.findByText(/Handed over/)).toBeInTheDocument()
    expect(screen.getByText(/Dr\. Smith/)).toBeInTheDocument()
    // A share action appears for exporting the FHIR handover slice.
    expect(screen.getByRole('button', { name: /Share handover/ })).toBeInTheDocument()
    // Undo returns to the entry form.
    await user.click(screen.getByRole('button', { name: /Undo handover/ }))
    expect(await screen.findByLabelText('Receiving clinician')).toBeInTheDocument()
  })
})
