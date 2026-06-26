import { useState } from 'react'
import {
  identityFromTombstone,
  type Tombstone,
  type Sex,
  type PatientMatch,
  type FhirResource,
} from '@triage-link/core'
import { matchPatient, fetchContext, EhrUnavailableError } from '../ehr/client'
import { useLang } from '../i18n'

type Status = 'idle' | 'matching' | 'matched' | 'loading-context' | 'error'

const GENDER_TO_SEX: Record<string, Sex> = { female: 'female', male: 'male', other: 'other', unknown: 'unknown' }

/** Verify a casualty's identity against Ontario's Provincial Client Registry. */
export function PcrVerify({ tombstone, onApply }: {
  tombstone: Tombstone
  onApply: (patch: Partial<Tombstone>) => void
}) {
  const { t } = useLang()
  const [status, setStatus] = useState<Status>('idle')
  const [matches, setMatches] = useState<PatientMatch[]>([])
  const [resolvedId, setResolvedId] = useState<string | null>(null)
  const [context, setContext] = useState<FhirResource[] | null>(null)
  const [message, setMessage] = useState('')

  const query = identityFromTombstone(tombstone)
  const canQuery = !!query.healthCardNumber || !!(query.familyName && query.birthDate)

  async function verify() {
    setStatus('matching'); setMessage(''); setContext(null); setResolvedId(null)
    try {
      const res = await matchPatient(query)
      setMatches(res.matches)
      setResolvedId(res.resolved ? res.matches[0]?.id ?? null : null)
      setStatus('matched')
      if (res.matches.length === 0) setMessage(t('pcr.nomatch'))
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof EhrUnavailableError ? t('pcr.unreachable') : (err as Error).message)
    }
  }

  function apply(m: PatientMatch) {
    onApply({
      mrn: m.identifiers[0]?.value ?? m.id,
      name: m.familyName ? `${m.familyName}${m.givenName ? `, ${m.givenName}` : ''}` : tombstone.name,
      dob: m.birthDate ?? tombstone.dob,
      sex: m.gender ? GENDER_TO_SEX[m.gender] ?? tombstone.sex : tombstone.sex,
    })
    setResolvedId(m.id)
  }

  async function loadContext(id: string) {
    setStatus('loading-context'); setMessage('')
    try {
      const bundle = await fetchContext(id)
      setContext(bundle.entry.map((e) => e.resource))
      setStatus('matched')
    } catch (err) {
      setStatus('matched')
      setMessage(err instanceof EhrUnavailableError ? t('pcr.unreachable2') : (err as Error).message)
    }
  }

  return (
    <div className="pcr">
      <button className="btn full" onClick={verify} disabled={!canQuery || status === 'matching'}>
        {status === 'matching' ? t('pcr.querying') : t('pcr.verify')}
      </button>
      {!canQuery && <p className="hint">{t('pcr.hint')}</p>}
      {message && <p className="hint">{message}</p>}

      {matches.map((m) => (
        <div className={`row${m.id === resolvedId ? ' on' : ''}`} key={m.id}>
          <div className="body">
            <div className="ttl">
              {m.familyName ? `${m.familyName}${m.givenName ? `, ${m.givenName}` : ''}` : m.id}
              {m.grade && <span className="dim"> · {m.grade}</span>}
            </div>
            <div className="meta">
              {m.birthDate ?? '—'} · {m.identifiers[0]?.value ?? m.id}
              {typeof m.score === 'number' ? ` · ${Math.round(m.score * 100)}%` : ''}
            </div>
            <div className="chips">
              <button className="btn" onClick={() => apply(m)}>{t('pcr.use')}</button>
              <button className="btn" onClick={() => loadContext(m.id)} disabled={status === 'loading-context'}>
                {status === 'loading-context' ? t('pcr.loading') : t('pcr.loadctx')}
              </button>
            </div>
          </div>
        </div>
      ))}

      {context && (
        <div className="pcr-ctx">
          <div className="meta">{t(context.length === 1 ? 'pcr.ctx_one' : 'pcr.ctx_many', { n: context.length })}</div>
          {context.length === 0 && <div className="empty">{t('pcr.noctx')}</div>}
          {context.map((r, i) => (
            <div className="row" key={i}>
              <div className="body">
                <div className="ttl">{(r.resourceType as string)}</div>
                <div className="meta">{summarise(r)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Best-effort one-line summary of a FHIR resource for the context list. */
function summarise(r: FhirResource): string {
  const code = r.code as { text?: string } | undefined
  const med = r.medicationCodeableConcept as { text?: string } | undefined
  return code?.text ?? med?.text ?? (r.criticality ? `criticality: ${String(r.criticality)}` : (r.id as string) ?? '')
}
