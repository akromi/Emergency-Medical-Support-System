// ONE ID authentication — Ontario Health's identity & access service.
//
// Server-to-server access to the ONE Access Gateway uses the OAuth 2.0
// client-credentials grant (OpenID Connect). This client fetches and caches a
// bearer token, refreshing it shortly before expiry. The client secret /
// private key never leaves the backend — this is why the integration lives in
// a server package, not the PWA.

import { EhrError } from '@triage-link/core'
import { HttpClient, type FetchLike } from './http.js'

export interface OneIdConfig {
  /** ONE ID token endpoint (OIDC token URL). */
  tokenUrl: string
  clientId: string
  clientSecret: string
  /** Space-delimited scopes granted for the target repositories. */
  scope?: string
  fetchImpl?: FetchLike
  /** undici Dispatcher carrying the mTLS client certificate. */
  dispatcher?: unknown
  /** Refresh this many seconds before the token actually expires (default 60). */
  refreshSkewSeconds?: number
  /** Injected clock (ms since epoch) for deterministic tests. */
  now?: () => number
}

interface TokenResponse {
  access_token: string
  token_type?: string
  expires_in?: number
}

export class OneIdClient {
  private readonly http: HttpClient
  private readonly cfg: OneIdConfig
  private readonly now: () => number
  private readonly skewMs: number
  private cached?: { token: string; expiresAtMs: number }

  constructor(cfg: OneIdConfig) {
    this.cfg = cfg
    this.now = cfg.now ?? (() => Date.now())
    this.skewMs = (cfg.refreshSkewSeconds ?? 60) * 1000
    this.http = new HttpClient({ baseUrl: cfg.tokenUrl, fetchImpl: cfg.fetchImpl, dispatcher: cfg.dispatcher })
  }

  /** Return a valid bearer token, fetching a fresh one only when needed. */
  async getAccessToken(): Promise<string> {
    if (this.cached && this.cached.expiresAtMs - this.skewMs > this.now()) {
      return this.cached.token
    }

    const form = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.cfg.clientId,
      client_secret: this.cfg.clientSecret,
    })
    if (this.cfg.scope) form.set('scope', this.cfg.scope)

    const res = await this.http.request<TokenResponse>(this.cfg.tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: form.toString(),
    })

    if (!res || !res.access_token) {
      throw new EhrError('unauthorized', 'ONE ID token response did not contain an access_token')
    }

    const ttlMs = (res.expires_in ?? 300) * 1000
    this.cached = { token: res.access_token, expiresAtMs: this.now() + ttlMs }
    return res.access_token
  }

  /** Drop the cached token (e.g. after a 401), forcing a refresh next call. */
  invalidate(): void {
    this.cached = undefined
  }
}
