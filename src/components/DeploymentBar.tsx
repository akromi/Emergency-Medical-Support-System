import { useState, useSyncExternalStore } from 'react'
import { useLang } from '../i18n'
import {
  getDeployment, setDeployment, subscribeDeployment, hasDeployment,
  DEPLOYMENT_KINDS, type DeploymentKind,
} from '../db/deployment'

// A slim, always-visible banner naming the operation this device is documenting.
// Collapsed it shows the operation summary (or a prompt to set it); expanded it
// reveals three quick fields. Device-wide, offline, persisted to localStorage.
export function DeploymentBar() {
  const { t } = useLang()
  const dep = useSyncExternalStore(subscribeDeployment, getDeployment)
  const [open, setOpen] = useState(false)

  const kindLabel = (k: DeploymentKind) => (k ? t(`deploy.kind.${k}`) : '')
  const summary = [dep.operation, kindLabel(dep.kind), dep.org].filter(Boolean).join(' · ')

  return (
    <div className="deploybar" data-tour="deployment">
      <span className="deploy-ico" aria-hidden>🎒</span>
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
          <button type="button" className="deploy-done" onClick={() => setOpen(false)}>{t('deploy.done')}</button>
        </div>
      ) : (
        <button type="button" className="deploy-show" onClick={() => setOpen(true)}>
          <span className="deploy-label">{t('deploy.label')}</span>
          {hasDeployment(dep)
            ? <span className="deploy-summary">{summary}</span>
            : <span className="deploy-set">{t('deploy.set')}</span>}
        </button>
      )}
    </div>
  )
}
