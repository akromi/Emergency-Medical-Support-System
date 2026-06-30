import { useState } from 'react'
import type { CasualtyRecord } from '@triage-link/core'
import { RegionCalibrator } from './RegionCalibrator'
import { OperatorPanel } from './OperatorPanel'
import { AuditLog } from './AuditLog'
import { EhrTestConsole } from './EhrTestConsole'
import { useLang } from '../i18n'

// Admin-only security & recovery guide. It lives INSIDE the gated Admin area, so
// only a signed-in admin (behind the step-up PIN) can read it — the lock /
// re-lock / recovery instructions are deliberately not in the public tour.
function AdminHelp({ onClose }: { onClose: () => void }) {
  const { t } = useLang()
  const sec = (head: string, items: string[]) => (
    <>
      <h3>{head}</h3>
      <ul>{items.map((k) => <li key={k}>{t(k)}</li>)}</ul>
    </>
  )
  return (
    <div className="calib-help" role="dialog" aria-modal="true" aria-label={t('admin.help.title')}
      onClick={(e) => { e.stopPropagation(); onClose() }}>
      <div className="calib-help-card" onClick={(e) => e.stopPropagation()}>
        <header className="calib-help-head">
          <h2>{t('admin.help.title')}</h2>
          <button type="button" onClick={onClose} title={t('sm.close')}>✕</button>
        </header>
        <div className="calib-help-body">
          {sec(t('admin.help.lock'), ['admin.help.lock1', 'admin.help.lock2'])}
          {sec(t('admin.help.forgot'), ['admin.help.forgot1', 'admin.help.forgot2', 'admin.help.forgot3'])}
          {sec(t('admin.help.relock'), ['admin.help.relock1'])}
          {sec(t('admin.help.tips'), ['admin.help.tips1', 'admin.help.tips2'])}
        </div>
      </div>
    </div>
  )
}

// Gated Admin area — a single home that groups the maintenance/config tools so
// they're not scattered across the menu (or reachable by a bare URL). Opened
// from the menu only by a signed-in admin AND behind a step-up PIN (see
// App.tsx `guard('admin.open')`). The launcher follows the app language; the
// deeper Region calibrator stays English-only (specialist maintenance tool).
type Tool = 'operators' | 'audit' | 'calibrator' | 'ehrlab'

export function AdminPanel({ record, onClose }: { record: CasualtyRecord; onClose: () => void }) {
  const { t } = useLang()
  const [tool, setTool] = useState<Tool | null>(null)
  const [showHelp, setShowHelp] = useState(false)
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
          <div className="op-head-actions">
            <button type="button" className="topbtn" onClick={() => setShowHelp(true)} title={t('admin.helpTitle')}>{t('admin.helpBtn')}</button>
            <button type="button" className="topbtn" onClick={onClose}>{t('sm.close')}</button>
          </div>
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
      {showHelp && <AdminHelp onClose={() => setShowHelp(false)} />}
    </div>
  )
}
