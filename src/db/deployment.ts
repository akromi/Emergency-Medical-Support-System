// Deployment context — the operation a device's records belong to.
//
// Humanitarian / MCI coordination: a field team tags WHICH response and site
// they're documenting (operation name, response type, organization), so a
// multi-team / multi-site deployment stays organized and donor reports have
// provenance. It's device-wide (not per-casualty), offline, and stored in
// localStorage — no server. Blank by default: leaving it empty changes nothing.

export type DeploymentKind =
  | '' | 'flood' | 'earthquake' | 'conflict' | 'displacement' | 'outbreak' | 'gathering' | 'other'

export interface Deployment {
  /** Operation / response name, e.g. "Cyclone Response — Beira". */
  operation: string
  /** Type of response (drives a short coded label). */
  kind: DeploymentKind
  /** Operating organization / program, e.g. "Red Cross — Sofala". */
  org: string
  /** Disaster/MCI profile: a shared-device mode that makes encryption mandatory
   *  and surfaces the command roll-up. Off by default. */
  mci: boolean
}

const KEY = 'tl.deployment'
const blank = (): Deployment => ({ operation: '', kind: '', org: '', mci: false })

function load(): Deployment {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...blank(), ...(JSON.parse(raw) as Partial<Deployment>) }
  } catch { /* private mode / bad JSON — fall through to blank */ }
  return blank()
}

let current: Deployment = load()
const listeners = new Set<() => void>()

export const getDeployment = (): Deployment => current
export const hasDeployment = (d: Deployment = current): boolean => !!(d.operation || d.org || d.kind)

export function setDeployment(patch: Partial<Deployment>): void {
  current = { ...current, ...patch }
  try { localStorage.setItem(KEY, JSON.stringify(current)) } catch { /* session-only when storage is unavailable */ }
  listeners.forEach((l) => l())
}

/** Subscribe to deployment changes (for useSyncExternalStore). */
export function subscribeDeployment(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Display order + their short coded labels live in i18n as `deploy.kind.*`. */
export const DEPLOYMENT_KINDS: Exclude<DeploymentKind, ''>[] =
  ['flood', 'earthquake', 'conflict', 'displacement', 'outbreak', 'gathering', 'other']
