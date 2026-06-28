import { useState, useSyncExternalStore } from 'react'
import { useLang } from '../i18n'
import {
  getDeployment, setDeployment, subscribeDeployment, hasDeployment,
  DEPLOYMENT_KINDS, type DeploymentKind,
} from '../db/deployment'
import { subscribeOperators, getOperatorSnapshot } from '../db/operators'
import { setVaultPolicy, setAutoLockMs, DEFAULT_AUTOLOCK_MS } from '../db/vault'

// Kiosk auto-lock window for shared-device MCI mode: a tighter 2-minute idle
// lock than the 5-minute default, so a casualty card left on a passed-around
// device re-seals quickly.
const MCI_AUTOLOCK_MS = 2 * 60_000

// A slim, always-visible banner naming the operation this device is documenting.
// Collapsed it shows the operation summary (or a prompt to set it); expanded it
// reveals the fields + the disaster/MCI profile toggle. Device-wide, offline,
// persisted to localStorage.
export function DeploymentBar({ onCommand, onOperators }: { onCommand?: () => void; onOperators?: () => void }) {
  const { t } = useLang()
  const dep = useSyncExternalStore(subscribeDeployment, getDeployment)
  const ops = useSyncExternalStore(subscribeOperators, getOperatorSnapshot)
  const [open, setOpen] = useState(false)

  const kindLabel = (k: DeploymentKind) => (k ? t(`deploy.kind.${k}`) : '')
  const summary = [dep.operation, kindLabel(dep.kind), dep.org].filter(Boolean).join(' · ')

  // In MCI mode a shared device should have a named operator on duty so every
  // record is attributed; prompt for one until somebody signs in.
  const needsOperator = dep.mci && !ops.active

  // MCI profile: a shared-device mode that makes encryption mandatory (via the
  // vault required-policy) and surfaces the command roll-up. Enabling it forces
  // the encryption-setup flow, so confirm first; disabling lifts the policy.
  // It also tightens the idle auto-lock for the shared-kiosk use case.
  function toggleMci(on: boolean) {
    if (on && !window.confirm(t('mci.confirm'))) return
    setDeployment({ mci: on })
    void setVaultPolicy(on)
    setAutoLockMs(on ? MCI_AUTOLOCK_MS : DEFAULT_AUTOLOCK_MS)
  }

  return (
    <div className={`deploybar${dep.mci ? ' mci' : ''}`} data-tour="deployment">
      <span className="deploy-ico" aria-hidden>{dep.mci ? '⛑️' : '🎒'}</span>
      {open ? (
        <div className="deploy-fields">
          <input
            className="deploy-op" value={dep.operation} placeholder={t('deploy.operation_ph')}
            aria-label={t('deploy.operation')} onChange={(e) => setDeployment({ operation: e.target.value })}
          />
          <select
            className="deploy-kind" value={dep.kind} aria-label={t('deploy.kind')}
            onChange={(e) => setDeployment({ kind: e.target.value as DeploymentKind })}
          >
            <option value="">{t('deploy.kind.none')}</option>
            {DEPLOYMENT_KINDS.map((k) => <option key={k} value={k}>{t(`deploy.kind.${k}`)}</option>)}
          </select>
          <input
            className="deploy-org" value={dep.org} placeholder={t('deploy.org_ph')}
            aria-label={t('deploy.org')} onChange={(e) => setDeployment({ org: e.target.value })}
          />
          <label className="deploy-mci" title={t('mci.help')}>
            <input type="checkbox" checked={dep.mci} onChange={(e) => toggleMci(e.target.checked)} />
            <span>{t('mci.toggle')}</span>
          </label>
          <button type="button" className="deploy-done" onClick={() => setOpen(false)}>{t('deploy.done')}</button>
        </div>
      ) : (
        <>
          <button type="button" className="deploy-show" onClick={() => setOpen(true)}>
            <span className="deploy-label">{t('deploy.label')}</span>
            {dep.mci && <span className="mci-badge" title={t('mci.help')}>{t('mci.badge')}</span>}
            {hasDeployment(dep)
              ? <span className="deploy-summary">{summary}</span>
              : <span className="deploy-set">{t('deploy.set')}</span>}
          </button>
          {dep.mci && onCommand && (
            <button type="button" className="deploy-command" onClick={onCommand} title={t('mci.command')}>
              {t('mci.command')}
            </button>
          )}
        </>
      )}
      {needsOperator && onOperators && (
        <button type="button" className="deploy-opreq" onClick={onOperators} title={t('mci.operator')}>
          ⚠ {t('mci.operator')}
        </button>
      )}
    </div>
  )
}
