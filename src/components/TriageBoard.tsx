import {
  type CasualtyRecord, type TriageCategory,
  estimateBurnTBSA, TRIAGE_COLORS,
} from '@triage-link/core'

// Multi-casualty triage board: every saved record grouped into START columns
// (Immediate / Delayed / Minor / Deceased / Untriaged) — the scene picture for
// incident command. Tap a card to open that casualty.

type Col = TriageCategory | 'unset'
const COLUMNS: { key: Col; label: string; color: string }[] = [
  { key: 'immediate', label: 'Immediate', color: TRIAGE_COLORS.immediate },
  { key: 'delayed', label: 'Delayed', color: TRIAGE_COLORS.delayed },
  { key: 'minor', label: 'Minor', color: TRIAGE_COLORS.minor },
  { key: 'deceased', label: 'Deceased', color: TRIAGE_COLORS.deceased },
  { key: 'unset', label: 'Untriaged', color: '#3A4656' },
]

export function TriageBoard({
  records, currentId, onSelect, onClose,
}: {
  records: ReadonlyArray<CasualtyRecord>
  currentId: string
  onSelect: (id: string) => void
  onClose: () => void
}) {
  const byCol = (k: Col) => records.filter((r) => (r.incident.triage || 'unset') === k)

  return (
    <div className="board-overlay" onClick={onClose}>
      <div className="board" onClick={(e) => e.stopPropagation()}>
        <header className="board-head">
          <div>
            <span className="board-title">Triage board</span>
            <span className="board-total">{records.length} casualt{records.length === 1 ? 'y' : 'ies'}</span>
          </div>
          <button type="button" className="topbtn" onClick={onClose}>Close</button>
        </header>

        <div className="board-cols">
          {COLUMNS.map((c) => {
            const list = byCol(c.key)
            return (
              <div className="board-col" key={c.key}>
                <div className="board-colhead" style={{ borderColor: c.color }}>
                  <span className="dot" style={{ background: c.color }} />
                  {c.label}
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
                        <div className="bc-name">{r.tombstone.name || 'Unidentified'}</div>
                        <div className="bc-meta">{r.id}</div>
                        <div className="bc-stats">
                          <span>{r.injuries.length} inj</span>
                          {tbsa > 0 && <span className="bc-tbsa">🔥 {tbsa}%</span>}
                          {r.handover && <span className="bc-ho">handed over</span>}
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
          <div className="board-none">No casualties yet — records appear here as you create them.</div>
        )}
      </div>
    </div>
  )
}
