import { useState } from 'react'
import type { CasualtyRecord } from '@triage-link/core'
import { RegionCalibrator } from './RegionCalibrator'
import { OperatorPanel } from './OperatorPanel'
import { AuditLog } from './AuditLog'
import { EhrTestConsole } from './EhrTestConsole'

// Gated Admin area — a single home that groups the maintenance/config tools so
// they're not scattered across the menu (or reachable by a bare URL). Opened
// from the menu only by a signed-in admin AND behind a step-up PIN (see
// App.tsx `guard('admin.open')`). It is admin-only maintenance furniture, so —
// like the calibrator — it is intentionally English-only and out of the tour.
type Tool = 'operators' | 'audit' | 'calibrator' | 'ehrlab'

export function AdminPanel({ record, onClose }: { record: CasualtyRecord; onClose: () => void }) {
  const [tool, setTool] = useState<Tool | null>(null)
  const back = () => setTool(null)

  // Each tool opens full-screen over the launcher; its Close returns here.
  if (tool === 'operators') return <OperatorPanel onClose={back} />
  if (tool === 'audit') return <AuditLog onClose={back} />
  if (tool === 'calibrator') return <RegionCalibrator onClose={back} />
  if (tool === 'ehrlab') return <EhrTestConsole record={record} onClose={back} />

  return (
    <div className="op-overlay" onClick={onClose}>
      <div className="op admin" onClick={(e) => e.stopPropagation()}>
        <header className="op-head">
          <h2>🛠 Admin</h2>
          <button type="button" className="topbtn" onClick={onClose}>Close</button>
        </header>
        <p className="op-hint">Authorized maintenance tools. Some actions inside will ask for your PIN again.</p>
        <div className="admin-grid">
          <button type="button" className="admin-tile" onClick={() => setTool('operators')}>
            <b>Operators</b><span>Add / remove operators, set PINs &amp; roles</span>
          </button>
          <button type="button" className="admin-tile" onClick={() => setTool('audit')}>
            <b>Audit log</b><span>Tamper-evident security &amp; access events</span>
          </button>
          <button type="button" className="admin-tile" onClick={() => setTool('calibrator')}>
            <b>Region calibrator</b><span>Fine-tune the body-chart tap regions</span>
          </button>
          {import.meta.env.DEV && (
            <button type="button" className="admin-tile" onClick={() => setTool('ehrlab')}>
              <b>EHR Test Lab</b><span>Dev / QA console (mock gateway)</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
