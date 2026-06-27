import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { createEmptyRecord, type CasualtyRecord, type TriageCategory } from '@triage-link/core'
import { SceneSummary } from '../src/components/SceneSummary'

function rec(id: string, triage: TriageCategory | '', opts: { name?: string; handed?: boolean } = {}): CasualtyRecord {
  const r = createEmptyRecord(id)
  r.tombstone = { ...r.tombstone, name: opts.name ?? '' }
  r.incident = { ...r.incident, triage }
  if (opts.handed) r.handover = { at: 1_700_000_000_000, clinician: 'Dr X', facility: 'County General' }
  return r
}

const RECORDS = [
  rec('CAS-1', 'immediate', { name: 'Doe, Jane' }),
  rec('CAS-2', 'immediate', { name: 'Roe, John', handed: true }),
  rec('CAS-3', 'delayed'),
  rec('CAS-4', 'deceased'),
  rec('CAS-5', ''),
]
const noop = () => {}

describe('SceneSummary — incident-command roll-up', () => {
  it('tallies casualties by triage category', () => {
    const { container } = render(<SceneSummary records={RECORDS} onClose={noop} />)
    // Tally tiles render in order: immediate, delayed, minor, deceased, untriaged.
    const nums = [...container.querySelectorAll('.scene-tile-n')].map((e) => e.textContent)
    expect(nums).toEqual(['2', '1', '0', '1', '1'])
  })

  it('splits on-scene vs handed-over', () => {
    const { container } = render(<SceneSummary records={RECORDS} onClose={noop} />)
    const status = container.querySelector('.scene-status')!.textContent
    expect(status).toContain('4') // 4 still on scene
    expect(status).toContain('1') // 1 handed over
  })

  it('lists every casualty in the roster, most-acute first', () => {
    const { container } = render(<SceneSummary records={RECORDS} onClose={noop} />)
    const rows = container.querySelectorAll('.scene-tbl tbody tr')
    expect(rows).toHaveLength(5)
    // First row is an immediate casualty; the untriaged one sorts last.
    expect(within(rows[0] as HTMLElement).getByText('Immediate')).toBeTruthy()
    expect(rows[0].textContent).toMatch(/CAS-1|CAS-2/)
    expect(rows[4].textContent).toContain('CAS-5')
  })

  it('shows the total and an unidentified fallback name', () => {
    render(<SceneSummary records={RECORDS} onClose={noop} />)
    expect(screen.getByText('Scene summary')).toBeTruthy()
    expect(screen.getAllByText('Unidentified').length).toBeGreaterThan(0)
  })

  it('renders an empty state with no casualties', () => {
    render(<SceneSummary records={[]} onClose={noop} />)
    expect(screen.getByText('No casualties recorded yet.')).toBeTruthy()
  })
})
