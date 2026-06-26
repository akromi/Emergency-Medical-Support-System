import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createEmptyRecord, type CasualtyRecord } from '@triage-link/core'
import { TriageBoard, matchesQuery } from '../src/components/TriageBoard'

function rec(id: string, name: string, patch: Partial<CasualtyRecord['incident']> = {}): CasualtyRecord {
  const r = createEmptyRecord(id)
  r.tombstone = { ...r.tombstone, name }
  r.incident = { ...r.incident, triage: 'immediate', ...patch }
  return r
}

const RECORDS = [
  rec('CAS-1', 'Doe, Jane', { triage: 'immediate', mechanism: 'Blast' }),
  rec('CAS-2', 'Roe, John', { triage: 'delayed', mechanism: 'RTC' }),
]

const noop = () => {}

describe('matchesQuery', () => {
  it('matches on name, id, mechanism, and location case-insensitively', () => {
    const r = RECORDS[0]
    expect(matchesQuery(r, '')).toBe(true)
    expect(matchesQuery(r, 'jane')).toBe(true)
    expect(matchesQuery(r, 'cas-1')).toBe(true)
    expect(matchesQuery(r, 'blast')).toBe(true)
    expect(matchesQuery(r, 'nope')).toBe(false)
  })
})

describe('TriageBoard search', () => {
  it('filters cards by query and shows a no-match message', async () => {
    const user = userEvent.setup()
    render(<TriageBoard records={RECORDS} currentId="" onSelect={noop} onClose={noop} />)

    // Both casualties visible initially.
    expect(screen.getByText('Doe, Jane')).toBeInTheDocument()
    expect(screen.getByText('Roe, John')).toBeInTheDocument()

    // Typing a name narrows to the matching card.
    await user.type(screen.getByRole('searchbox'), 'jane')
    expect(screen.getByText('Doe, Jane')).toBeInTheDocument()
    expect(screen.queryByText('Roe, John')).not.toBeInTheDocument()

    // A non-matching query shows the empty-result message.
    await user.clear(screen.getByRole('searchbox'))
    await user.type(screen.getByRole('searchbox'), 'zzz')
    expect(screen.getByText(/No casualties match/)).toBeInTheDocument()
  })
})
