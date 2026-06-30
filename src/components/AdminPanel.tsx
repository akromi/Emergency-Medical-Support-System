import { useState } from 'react'
import type { CasualtyRecord } from '@triage-link/core'
import { RegionCalibrator } from './RegionCalibrator'
import { OperatorPanel } from './OperatorPanel'
import { AuditLog } from './AuditLog'
import { EhrTestConsole } from './EhrTestConsole'
import { useLang } from '../i18n'

// Gated Admin area — a single home that groups the maintenance/config tools so
// they're not scattered across the menu (or reachable by a bare URL). Opened
// from the menu only by a signed-in admin AND behind a step-up PIN (see
// App.tsx `guard('admin.open')`). The launcher follows the app language; the
// deeper Region calibrator stays English-only (specialist maintenance tool).
type Tool = 'operators' | 'audit' | 'calibrator' | 'ehrlab'

export function AdminPanel({ record, onClose }: { record: CasualtyRecord; onClose: () => void }) {
  const { t } = useLang()
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
          <h2>{t('hdr.admin')}</h2>
          <button type="button" className="topbtn" onClick={onClose}>{t('sm.close')}</button>
        </header>
        <p className="op-hint">{t('admin.hint')}</p>
        <div className="admin-grid">
          <button type="button" className="admin-tile" onClick={() => setTool('operators')}>
            <b>{t('op.menu')}</b><span>{t('admin.operatorsDesc')}</span>
          </button>
          <button type="button" className="admin-tile" onClick={() => setTool('audit')}>
            <b>{t('audit.menu')}</b><span>{t('admin.auditDesc')}</span>
          </button>
          <button type="button" className="admin-tile" onClick={() => setTool('calibrator')}>
            <b>{t('admin.calibrator')}</b><span>{t('admin.calibratorDesc')}</span>
          </button>
          {import.meta.env.DEV && (
            <button type="button" className="admin-tile" onClick={() => setTool('ehrlab')}>
              <b>{t('admin.ehrlab')}</b><span>{t('admin.ehrlabDesc')}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
