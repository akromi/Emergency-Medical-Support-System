import { useState } from 'react'
import {
  type CasualtyRecord, type TriageCategory,
  estimateBurnTBSA, TRIAGE_COLORS,
} from '@triage-link/core'
import { useLang } from '../i18n'
import { Elapsed } from './Elapsed'

// Multi-casualty triage board: every saved record grouped into START columns
// (Immediate / Delayed / Minor / Deceased / Untriaged) — the scene picture for
// incident command. Tap a card to open that casualty. A search box filters the
// cards across all columns by name / ID / mechanism / location.

type Col = TriageCategory | 'unset'
// Scene-status filter: still on scene (no handover) vs handed over.
type Scope = 'all' | 'onscene' | 'handed'
const SCOPES: { key: Scope; tkey: string }[] = [
  { key: 'all', tkey: 'board.scope.all' },
  { key: 'onscene', tkey: 'board.scope.onscene' },
  { key: 'handed', tkey: 'board.scope.handed' },
]
const COLUMNS: { key: Col; tkey: string; color: string }[] = [
  { key: 'immediate', tkey: 'board.immediate', color: TRIAGE_COLORS.immediate },
  { key: 'delayed', tkey: 'board.delayed', color: TRIAGE_COLORS.delayed },
  { key: 'minor', tkey: 'board.minor', color: TRIAGE_COLORS.minor },
  { key: 'deceased', tkey: 'board.deceased', color: TRIAGE_COLORS.deceased },
  { key: 'unset', tkey: 'board.untriaged', color: '#3A4656' },
]

/** Case-insensitive match of a record against a free-text query (name/ID/
 *  mechanism/location). An empty query matches everything. */
export function matchesQuery(r: CasualtyRecord, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return [r.tombstone.name, r.id, r.incident.mechanism, r.incident.location]
    .some((s) => (s || '').toLowerCase().includes(needle))
}

export function TriageBoard({
  records, currentId, onSelect, onClose,
}: {
  records: ReadonlyArray<CasualtyRecord>
  currentId: string
  onSelect: (id: string) => void
  onClose: () => void
}) {
  const { t } = useLang()
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<Scope>('all')
  const inScope = (r: CasualtyRecord) => scope === 'all' || (scope === 'handed' ? !!r.handover : !r.handover)
  const textFiltered = records.filter((r) => matchesQuery(r, query))
  const filtered = textFiltered.filter(inScope)
  const byCol = (k: Col) => filtered.filter((r) => (r.incident.triage || 'unset') === k)
  const searching = query.trim().length > 0
  const filtering = searching || scope !== 'all'
  const scopeCounts: Record<Scope, number> = {
    all: textFiltered.length,
    onscene: textFiltered.filter((r) => !r.handover).length,
    handed: textFiltered.filter((r) => r.handover).length,
  }

  return (
    <div className="board-overlay" onClick={onClose}>
      <div className="board" onClick={(e) => e.stopPropagation()}>
        <header className="board-head">
          <div>
            <span className="board-title">{t('board.title')}</span>
            <span className="board-total">
              {filtering
                ? t('board.matchcount', { n: filtered.length, m: records.length })
                : t(records.length === 1 ? 'board.count_one' : 'board.count_many', { n: records.length })}
            </span>
          </div>
          <button type="button" className="topbtn" onClick={onClose}>{t('sm.close')}</button>
        </header>

        {records.length > 0 && (
          <div className="board-search">
            <input
              type="search"
              aria-label={t('board.search_ph')}
              placeholder={t('board.search_ph')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {searching && (
              <button type="button" className="board-search-x" aria-label={t('board.clear')} onClick={() => setQuery('')}>×</button>
            )}
          </div>
        )}

        {records.length > 0 && (
          <div className="board-scope" role="group" aria-label={t('board.scope.label')}>
            {SCOPES.map((s) => (
              <button key={s.key} type="button" className={scope === s.key ? 'on' : ''} onClick={() => setScope(s.key)}>
                {t(s.tkey)} <span className="n">{scopeCounts[s.key]}</span>
              </button>
            ))}
          </div>
        )}

        <div className="board-cols">
          {COLUMNS.map((c) => {
            const list = byCol(c.key)
            return (
              <div className="board-col" key={c.key}>
                <div className="board-colhead" style={{ borderColor: c.color }}>
                  <span className="dot" style={{ background: c.color }} />
                  {t(c.tkey)}
                  <span className="n">{list.length}</span>
                </div>
                <div className="board-cards">
                  {list.length === 0 && <div className="board-empty">—</div>}
                  {list.map((r) => {
                    const tbsa = estimateBurnTBSA(r.injuries, r.incident.ageBand)
                    return (
                      <button
                        type="button"
                        key={r.id}
                        className={`board-card${r.id === currentId ? ' active' : ''}`}
                        style={{ borderLeftColor: c.color }}
                        onClick={() => { onSelect(r.id); onClose() }}
                      >
                        <div className="bc-name">{r.tombstone.name || t('saved.unidentified')}</div>
                        <div className="bc-meta">{r.id}</div>
                        <div className="bc-stats">
                          <span>{r.injuries.length} {t('saved.inj')}</span>
                          {tbsa > 0 && <span className="bc-tbsa">🔥 {tbsa}%</span>}
                          <Elapsed injuryTime={r.incident.injuryTime} className="bc-elapsed" />
                          {r.handover && <span className="bc-ho">{t('board.handedover')}</span>}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {records.length === 0 && (
          <div className="board-none">{t('board.none')}</div>
        )}
        {records.length > 0 && filtering && filtered.length === 0 && (
          <div className="board-none">{searching ? t('board.nomatch', { q: query.trim() }) : t('board.noneinview')}</div>
        )}
      </div>
    </div>
  )
}
