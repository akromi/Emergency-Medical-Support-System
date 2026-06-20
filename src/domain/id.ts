// Stable, offline-generatable identifiers. No server round-trip required.
export function genCaseId(): string {
  const t = Date.now().toString(36).toUpperCase().slice(-5)
  const r = Math.random().toString(36).slice(2, 5).toUpperCase()
  return `CAS-${t}${r}`
}

export function genLocalId(prefix = ''): string {
  return prefix + Math.random().toString(36).slice(2, 9)
}
