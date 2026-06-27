// Generic OIDC bearer-token verification for the admin surface — vendor-neutral
// (Auth0, Okta, Entra ID, Keycloak, Google, …). Validates an IdP-issued JWT
// against the issuer's JWKS: signature, issuer, audience, and time claims.
//
// Dependency-free: Node's crypto verifies RSA signatures from a JWK directly.
// Only the RSA family (RS256/384/512 — the default for every major IdP) is
// accepted; `none`, HS* (symmetric, the classic alg-confusion vector), and EC
// are rejected outright. JWKS is fetched on demand, cached, and refetched once
// on an unknown `kid` so key rotation is picked up without a restart.
import { createPublicKey, verify as cryptoVerify, type JsonWebKey } from 'node:crypto'

export interface OidcConfig {
  /** Expected token issuer (the `iss` claim, and discovery base). */
  issuer: string
  /** Expected audience — the `aud` claim must include it. Recommended. */
  audience?: string
  /** JWKS endpoint. Defaults to the issuer's discovery `jwks_uri`. */
  jwksUri?: string
}

export interface OidcVerifier {
  /** Verify a raw JWT (no "Bearer " prefix); resolves to its claims or throws. */
  verify(token: string): Promise<Record<string, unknown>>
}

export class OidcError extends Error {}

interface Jwk extends JsonWebKey { kid?: string; kty?: string }
type JwksFetch = (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>

const RSA_HASH: Record<string, string> = { RS256: 'sha256', RS384: 'sha384', RS512: 'sha512' }
const JWKS_TTL_MS = 10 * 60_000

const seg = (s: string): Record<string, unknown> => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'))

export function createOidcVerifier(config: OidcConfig, opts: { fetch?: JwksFetch; now?: () => number } = {}): OidcVerifier {
  const doFetch: JwksFetch = opts.fetch ?? ((url) => fetch(url) as unknown as ReturnType<JwksFetch>)
  const nowSec = () => Math.floor((opts.now ? opts.now() : Date.now()) / 1000)
  let cache: { keys: Jwk[]; at: number } | null = null

  async function jwksUri(): Promise<string> {
    if (config.jwksUri) return config.jwksUri
    const res = await doFetch(`${config.issuer.replace(/\/$/, '')}/.well-known/openid-configuration`)
    if (!res.ok) throw new OidcError(`OIDC discovery failed (${res.status})`)
    const doc = (await res.json()) as { jwks_uri?: unknown }
    if (typeof doc.jwks_uri !== 'string') throw new OidcError('OIDC discovery missing jwks_uri')
    return doc.jwks_uri
  }

  async function keys(force: boolean): Promise<Jwk[]> {
    const fresh = cache && (opts.now ? opts.now() : Date.now()) - cache.at < JWKS_TTL_MS
    if (!force && fresh) return cache!.keys
    const res = await doFetch(await jwksUri())
    if (!res.ok) throw new OidcError(`JWKS fetch failed (${res.status})`)
    const doc = (await res.json()) as { keys?: unknown }
    const list = Array.isArray(doc.keys) ? (doc.keys as Jwk[]) : []
    cache = { keys: list, at: opts.now ? opts.now() : Date.now() }
    return list
  }

  async function keyFor(kid: string | undefined): Promise<Jwk> {
    const match = (ks: Jwk[]) => ks.find((k) => k.kty === 'RSA' && (kid ? k.kid === kid : true))
    return match(await keys(false)) ?? match(await keys(true)) // refetch once on miss (rotation)
      ?? (() => { throw new OidcError('No matching JWKS key') })()
  }

  return {
    async verify(token: string): Promise<Record<string, unknown>> {
      const parts = token.split('.')
      if (parts.length !== 3) throw new OidcError('Malformed JWT')
      const [h, p, s] = parts
      const header = seg(h) as { alg?: string; kid?: string }
      const hash = header.alg ? RSA_HASH[header.alg] : undefined
      if (!hash) throw new OidcError(`Unsupported alg: ${header.alg}`) // rejects none / HS* / ES*
      const key = createPublicKey({ key: await keyFor(header.kid), format: 'jwk' })
      if (!cryptoVerify(hash, Buffer.from(`${h}.${p}`), key, Buffer.from(s, 'base64url'))) {
        throw new OidcError('Invalid signature')
      }
      const claims = seg(p)
      if (claims.iss !== config.issuer) throw new OidcError('Issuer mismatch')
      if (config.audience != null) {
        const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
        if (!aud.includes(config.audience)) throw new OidcError('Audience mismatch')
      }
      const now = nowSec()
      if (typeof claims.exp === 'number' && now >= claims.exp) throw new OidcError('Token expired')
      if (typeof claims.nbf === 'number' && now < claims.nbf) throw new OidcError('Token not yet valid')
      return claims
    },
  }
}
