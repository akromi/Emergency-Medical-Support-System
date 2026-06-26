import {
  type CasualtyRecord, type TriageCategory,
  estimateBurnTBSA, TRIAGE_COLORS,
} from '@triage-link/core'
import { useLang } from '../i18n'

// Multi-casualty triage board: every saved record grouped into START columns
// (Immediate / Delayed / Minor / Deceased / Untriaged) — the scene picture for
// incident command. Tap a card to open that casualty.

type Col = TriageCategory | 'unset'
const COLUMNS: { key: Col; tkey: string; color: string }[] = [
  { key: 'immediate', tkey: 'board.immediate', color: TRIAGE_COLORS.immediate },
  { key: 'delayed', tkey: 'board.delayed', color: TRIAGE_COLORS.delayed },
  { key: 'minor', tkey: 'board.minor', color: TRIAGE_COLORS.minor },
  { key: 'deceased', tkey: 'board.deceased', color: TRIAGE_COLORS.deceased },
  { key: 'unset', tkey: 'board.untriaged', color: '#3A4656' },
]

export function TriageBoard({
  records, currentId, onSelect, onClose,
}: {
  records: ReadonlyArray<CasualtyRecord>
  currentId: string
  onSelect: (id: string) => void
  onClose: () => void
}) {
  const { t } = useLang()
  const byCol = (k: Col) => records.filter((r) => (r.incident.triage || 'unset') === k)

  return (
    <div className="board-overlay" onClick={onClose}>
      <div className="board" onClick={(e) => e.stopPropagation()}>
        <header className="board-head">
          <div>
            <span className="board-title">{t('board.title')}</span>
            <span className="board-total">{t(records.length === 1 ? 'board.count_one' : 'board.count_many', { n: records.length })}</span>
          </div>
          <button type="button" className="topbtn" onClick={onClose}>{t('sm.close')}</button>
        </header>

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
      </div>
    </div>
  )
}
