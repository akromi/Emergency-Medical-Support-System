import { describe, expect, it } from 'vitest'
import { createEmptyRecord, type CasualtyRecord } from '@triage-link/core'
import { recordsToCsv, parseCsv, csvToRecords } from '../src/db/csv'

function rec(id: string, patch: Partial<CasualtyRecord['tombstone']>, triage: CasualtyRecord['incident']['triage'] = ''): CasualtyRecord {
  const r = createEmptyRecord(id)
  r.tombstone = { ...r.tombstone, ...patch }
  r.incident = { ...r.incident, triage, mechanism: 'Blast', location: 'Sector 4' }
  return r
}

describe('roster CSV', () => {
  it('parses RFC-4180 quoting (commas, quotes, newlines)', () => {
    const rows = parseCsv('a,b\r\n"x,y","he said ""hi"""\r\n"line\nbreak",z')
    expect(rows).toEqual([['a', 'b'], ['x,y', 'he said "hi"'], ['line\nbreak', 'z']])
  })

  it('exports a header + one row per record', () => {
    const csv = recordsToCsv([rec('CAS-1', { name: 'Doe, Jane' }, 'immediate')])
    const rows = parseCsv(csv)
    expect(rows[0]).toContain('name')
    expect(rows[0]).toContain('triage')
    expect(rows[1][rows[0].indexOf('name')]).toBe('Doe, Jane')
    expect(rows[1][rows[0].indexOf('triage')]).toBe('immediate')
  })

  it('round-trips the scalar identity + incident fields', () => {
    const csv = recordsToCsv([rec('CAS-1', { name: 'Roe, John', dob: '1990-05-01', sex: 'male' }, 'delayed')])
    const [back] = csvToRecords(csv)
    expect(back.id).toBe('CAS-1')
    expect(back.tombstone.name).toBe('Roe, John')
    expect(back.tombstone.dob).toBe('1990-05-01')
    expect(back.tombstone.sex).toBe('male')
    expect(back.incident.triage).toBe('delayed')
    expect(back.incident.mechanism).toBe('Blast')
  })

  it('quotes/escapes a name with a comma', () => {
    const csv = recordsToCsv([rec('CAS-1', { name: 'Smith, Dr. "Bones"' })])
    expect(csvToRecords(csv)[0].tombstone.name).toBe('Smith, Dr. "Bones"')
  })

  it('assigns a fresh id when the id column is blank', () => {
    const back = csvToRecords('id,name\r\n,Anon')
    expect(back).toHaveLength(1)
    expect(back[0].id).toBeTruthy()
    expect(back[0].tombstone.name).toBe('Anon')
  })

  it('rejects invalid enum values (falls back to defaults)', () => {
    const back = csvToRecords('id,triage,ageBand,sex\r\nCAS-1,bogus,nonsense,xx')
    expect(back[0].incident.triage).toBe('')
    expect(back[0].incident.ageBand).toBe('adult')
    expect(back[0].tombstone.sex).toBe('')
  })

  it('returns nothing for a header-only or empty file', () => {
    expect(csvToRecords('id,name')).toEqual([])
    expect(csvToRecords('')).toEqual([])
  })
})
