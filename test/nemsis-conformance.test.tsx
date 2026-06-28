import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { createEmptyRecord } from '@triage-link/core'
import { NemsisConformance } from '../src/components/NemsisConformance'

// The conformance view must, above all, never be mistaken for certification: it
// surfaces capture gaps + placeholder-ruleset validator output, clearly labelled
// as an offline pre-check.

const noop = () => {}

describe('NemsisConformance — read-only conformance view', () => {
  it('shows the non-certification disclaimer prominently', () => {
    render(<NemsisConformance record={createEmptyRecord('CASE-X')} onClose={noop} />)
    expect(screen.getByText(/NOT certification/i)).toBeTruthy()
    // The placeholder provenance is shown next to the validator issues heading.
    expect(screen.getByText('placeholder ruleset')).toBeTruthy()
  })

  it('lists the capture gaps of a fresh (mostly empty) record', () => {
    render(<NemsisConformance record={createEmptyRecord('CASE-X')} onClose={noop} />)
    const heading = screen.getByRole('heading', { name: /Capture gaps/i })
    const section = heading.closest('section') as HTMLElement
    // A brand-new record hasn't captured eResponse/eTimes/eCrew/eScene yet.
    expect(within(section).getAllByRole('listitem').length).toBeGreaterThan(0)
  })

  it('offers a shaped-XML export and a close action', () => {
    const onClose = vi.fn()
    render(<NemsisConformance record={createEmptyRecord('CASE-X')} onClose={onClose} />)
    expect(screen.getByRole('button', { name: /Export shaped XML/i })).toBeTruthy()
  })
})
