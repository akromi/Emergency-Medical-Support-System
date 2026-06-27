import { useEffect, useState } from 'react'
import { listAudit, verifyAudit } from '../db/audit'
import type { AuditEntry } from '../db/database'
import { useLang } from '../i18n'

// Read-only viewer for the append-only, hash-chained audit log. Lists events
// newest-first, verifies the chain on demand, and exports the raw log. Event
// codes are shown verbatim (technical, language-neutral); the chrome localises.

const fmt = (ms: number): string =>
  new Date(ms).toLocaleString([], { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })

export function AuditLog({ onClose }: { onClose: () => void }) {
  const { t } = useLang()
  const [rows, setRows] = useState<AuditEntry[]>([])
  const [result, setResult] = useState<{ ok: boolean; brokenAtSeq?: number; count: number } | null>(null)

  useEffect(() => { listAudit().then((r) => setRows(r.slice().reverse())) }, [])

  async function runVerify() { setResult(await verifyAudit()) }

  function exportLog() {
    const chronological = rows.slice().reverse()
    const blob = new Blob([JSON.stringify(chronological, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `triage-link-audit-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="audit-overlay" onClick={onClose}>
      <div className="audit" onClick={(e) => e.stopPropagation()}>
        <header className="audit-head">
          <h2>{t('audit.title')} <span className="count">{rows.length}</span></h2>
          <div className="audit-actions">
            <button type="button" className="topbtn" onClick={runVerify}>{t('audit.verify')}</button>
            <button type="button" className="topbtn" onClick={exportLog} disabled={rows.length === 0}>{t('audit.export')}</button>
            <button type="button" className="topbtn" onClick={onClose}>{t('sm.close')}</button>
          </div>
        </header>

        {result && (
          <div className={result.ok ? 'audit-ok' : 'audit-bad'}>
            {result.ok ? t('audit.intact', { n: result.count }) : t('audit.broken', { seq: result.brokenAtSeq ?? 0 })}
          </div>
        )}

        {rows.length === 0 ? (
          <div className="sm-empty">{t('audit.empty')}</div>
        ) : (
          <table className="sm-tbl audit-tbl">
            <thead><tr>
              <th>{t('audit.time')}</th><th>{t('audit.action')}</th><th>{t('audit.case')}</th><th>{t('audit.actor')}</th>
            </tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.seq}>
                  <td className="mono">{fmt(e.ts)}</td>
                  <td className="mono">{e.action}{e.detail ? ` · ${e.detail}` : ''}</td>
                  <td className="mono">{e.recordId ?? '—'}</td>
                  <td className="mono">{e.actor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
