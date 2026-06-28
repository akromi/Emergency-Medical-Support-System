// Mutual-TLS (client-certificate) transport for the ONE Access Gateway.
//
// Ontario Health's ONE Access Gateway requires a CLIENT certificate on every
// connection (mTLS), on top of the OAuth bearer token. The certificate is a
// transport concern, so it lives here as an undici `Agent` (a "dispatcher")
// that both the ONE ID token client and the FHIR gateway pass straight through
// to fetch — see one-id.ts / ontario-health-gateway.ts (`dispatcher`).
//
// This is server-side ONLY: the private key never reaches the browser. Nothing
// here is wired by default — a deployment supplies the cert material via env
// (see mtlsDispatcherFromEnv) and the sync-service passes the dispatcher in.
import { Agent } from 'undici'
import { readFileSync } from 'node:fs'

/** PEM material for a client certificate (mutual TLS). */
export interface MtlsOptions {
  /** PEM-encoded client certificate (chain). */
  cert: string | Buffer
  /** PEM-encoded private key for `cert`. */
  key: string | Buffer
  /** PEM-encoded CA bundle used to verify the SERVER. Omit to use the host trust store. */
  ca?: string | Buffer
  /** Passphrase for an encrypted private key. */
  passphrase?: string
  /** Verify the server certificate (default true). Set false ONLY for local
   *  testing against a self-signed server — never in production. */
  rejectUnauthorized?: boolean
}

/**
 * Build an undici Agent that presents `cert`/`key` on every TLS connection.
 * Pass the result as `dispatcher` to OneIdClient and OntarioHealthGateway.
 * Throws if either half of the keypair is missing (fails closed).
 */
export function createMtlsDispatcher(opts: MtlsOptions): Agent {
  if (!opts.cert || !opts.key) {
    throw new Error('mTLS requires BOTH a client certificate and its private key.')
  }
  return new Agent({
    connect: {
      cert: opts.cert,
      key: opts.key,
      ca: opts.ca,
      passphrase: opts.passphrase,
      rejectUnauthorized: opts.rejectUnauthorized ?? true,
    },
  })
}

/** Build the dispatcher from PEM file paths (the usual deploy shape — mount the
 *  cert/key as files and point env vars at them). */
export function mtlsDispatcherFromFiles(paths: {
  certPath: string
  keyPath: string
  caPath?: string
  passphrase?: string
}): Agent {
  return createMtlsDispatcher({
    cert: readFileSync(paths.certPath),
    key: readFileSync(paths.keyPath),
    ca: paths.caPath ? readFileSync(paths.caPath) : undefined,
    passphrase: paths.passphrase,
  })
}

/**
 * Build the mTLS dispatcher from the environment, or `undefined` when no client
 * certificate is configured (so the gateway runs without mTLS — e.g. against a
 * mock or a gateway that doesn't require it).
 *
 * Accepts the cert/key either inline (PEM in the var) or as file paths:
 *   - ONE_ID_CLIENT_CERT / ONE_ID_CLIENT_KEY            (inline PEM), or
 *   - ONE_ID_CLIENT_CERT_FILE / ONE_ID_CLIENT_KEY_FILE  (paths)
 *   - ONE_ID_CA_CERT / ONE_ID_CA_CERT_FILE              (optional CA bundle)
 *   - ONE_ID_CLIENT_KEY_PASSPHRASE                      (optional)
 *
 * Fails closed: if EITHER cert or key is given without the other, it throws
 * rather than silently connecting without a client certificate.
 */
export function mtlsDispatcherFromEnv(env: NodeJS.ProcessEnv = process.env): Agent | undefined {
  const certInline = env.ONE_ID_CLIENT_CERT
  const keyInline = env.ONE_ID_CLIENT_KEY
  const certPath = env.ONE_ID_CLIENT_CERT_FILE
  const keyPath = env.ONE_ID_CLIENT_KEY_FILE
  const caInline = env.ONE_ID_CA_CERT
  const caPath = env.ONE_ID_CA_CERT_FILE
  const passphrase = env.ONE_ID_CLIENT_KEY_PASSPHRASE

  const haveInline = Boolean(certInline || keyInline)
  const haveFile = Boolean(certPath || keyPath)
  if (!haveInline && !haveFile) return undefined // mTLS not configured — fine.

  if (haveFile) {
    if (!certPath || !keyPath) {
      throw new Error('mTLS file config incomplete: set BOTH ONE_ID_CLIENT_CERT_FILE and ONE_ID_CLIENT_KEY_FILE.')
    }
    return mtlsDispatcherFromFiles({ certPath, keyPath, caPath, passphrase })
  }
  if (!certInline || !keyInline) {
    throw new Error('mTLS inline config incomplete: set BOTH ONE_ID_CLIENT_CERT and ONE_ID_CLIENT_KEY.')
  }
  return createMtlsDispatcher({ cert: certInline, key: keyInline, ca: caInline, passphrase })
}
