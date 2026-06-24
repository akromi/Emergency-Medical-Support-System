// Thin HTTP layer shared by the ONE ID token client and the Ontario gateway.
//
// Responsibilities:
//   - turn transport/HTTP failures into typed EhrError (core's vocabulary)
//   - retry idempotent calls with exponential backoff on retryable failures
//   - leave a seam for mutual TLS — the ONE Access Gateway requires a client
//     certificate, supplied in production via an undici Dispatcher on `fetchImpl`
//
// No global state, no secrets: everything is injected so it stays unit-testable.

import { EhrError, type EhrErrorCode } from '@triage-link/core'

/** Minimal fetch surface we depend on (the global `fetch`, or an injected one). */
export type FetchLike = (url: string, init?: RequestInitLike) => Promise<ResponseLike>

export interface RequestInitLike {
  method?: string
  headers?: Record<string, string>
  body?: string
  /** undici Dispatcher carrying the client cert for mTLS, passed straight through. */
  dispatcher?: unknown
  signal?: AbortSignal
}

export interface ResponseLike {
  ok: boolean
  status: number
  text(): Promise<string>
}

export interface HttpClientOptions {
  baseUrl: string
  fetchImpl?: FetchLike
  /** Passed through on every request — carries the mTLS client certificate. */
  dispatcher?: unknown
  /** Total attempts for a retryable failure (default 4 → 1 try + 3 retries). */
  maxAttempts?: number
  /** Base backoff in ms; doubles each retry (default 200 → 200/400/800). */
  backoffBaseMs?: number
  /** Per-request timeout in ms (default 15000). */
  timeoutMs?: number
  /** Injected for tests so backoff doesn't actually sleep. */
  sleep?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

function codeForStatus(status: number): EhrErrorCode {
  if (status === 401) return 'unauthorized'
  if (status === 403) return 'forbidden'
  if (status === 404) return 'not-found'
  if (status === 422 || status === 400) return 'invalid-request'
  if (status === 429) return 'rate-limited'
  if (status >= 500) return 'unavailable'
  return 'unknown'
}

export class HttpClient {
  private readonly baseUrl: string
  private readonly fetchImpl: FetchLike
  private readonly dispatcher?: unknown
  private readonly maxAttempts: number
  private readonly backoffBaseMs: number
  private readonly timeoutMs: number
  private readonly sleep: (ms: number) => Promise<void>

  constructor(opts: HttpClientOptions) {
    const fallback = (globalThis as { fetch?: FetchLike }).fetch
    const chosen = opts.fetchImpl ?? fallback
    if (!chosen) throw new EhrError('transport', 'No fetch implementation available')
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '')
    this.fetchImpl = chosen
    this.dispatcher = opts.dispatcher
    this.maxAttempts = opts.maxAttempts ?? 4
    this.backoffBaseMs = opts.backoffBaseMs ?? 200
    this.timeoutMs = opts.timeoutMs ?? 15_000
    this.sleep = opts.sleep ?? defaultSleep
  }

  /** Perform a request, parsing JSON on success and throwing EhrError otherwise. */
  async request<T = unknown>(
    path: string,
    init: { method?: string; headers?: Record<string, string>; body?: string; idempotent?: boolean } = {},
  ): Promise<T> {
    const url = path.startsWith('http') ? path : `${this.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`
    // Only retry requests that are safe to repeat. Defaults to GET-only so a
    // non-idempotent write (e.g. contributing a handover) is never replayed
    // after a timeout; callers can opt a safe POST in (e.g. PCR $match).
    const idempotent = init.idempotent ?? (init.method ?? 'GET').toUpperCase() === 'GET'
    const maxAttempts = idempotent ? this.maxAttempts : 1
    let lastErr: EhrError | undefined

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), this.timeoutMs)
      try {
        const res = await this.fetchImpl(url, {
          method: init.method ?? 'GET',
          headers: init.headers,
          body: init.body,
          dispatcher: this.dispatcher,
          signal: controller.signal,
        })
        if (res.ok) {
          const text = await res.text()
          return (text ? JSON.parse(text) : undefined) as T
        }
        const body = await res.text().catch(() => '')
        lastErr = new EhrError(codeForStatus(res.status), `EHR request failed: ${res.status} ${body.slice(0, 300)}`, {
          status: res.status,
        })
      } catch (cause) {
        // Network error, abort/timeout, or JSON parse failure → transport.
        lastErr = cause instanceof EhrError ? cause : new EhrError('transport', `EHR request error: ${String(cause)}`, { cause })
      } finally {
        clearTimeout(timer)
      }

      if (!lastErr.retryable || attempt === maxAttempts) break
      await this.sleep(this.backoffBaseMs * 2 ** (attempt - 1))
    }

    throw lastErr ?? new EhrError('unknown', 'EHR request failed with no error captured')
  }
}
