import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Agent, request } from 'undici'
import { createServer, type Server } from 'node:https'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createMtlsDispatcher, mtlsDispatcherFromEnv, mtlsDispatcherFromFiles } from '../src/mtls.js'

// A throwaway PEM (never connects — the Agent is lazy, so the factory accepts
// any string and only validates the material at connection time).
const DUMMY = '-----BEGIN-----\nx\n-----END-----'

function hasOpenssl(): boolean {
  try { execFileSync('openssl', ['version'], { stdio: 'ignore' }); return true } catch { return false }
}

describe('mTLS dispatcher factory', () => {
  it('builds an undici Agent from cert + key', () => {
    const agent = createMtlsDispatcher({ cert: DUMMY, key: DUMMY })
    expect(agent).toBeInstanceOf(Agent)
  })

  it('fails closed when half the keypair is missing', () => {
    expect(() => createMtlsDispatcher({ cert: DUMMY, key: '' })).toThrow(/certificate and its private key/i)
    expect(() => createMtlsDispatcher({ cert: '', key: DUMMY })).toThrow(/certificate and its private key/i)
  })
})

describe('mtlsDispatcherFromEnv', () => {
  it('returns undefined when no cert material is configured', () => {
    expect(mtlsDispatcherFromEnv({})).toBeUndefined()
  })

  it('builds an Agent from inline PEM env vars', () => {
    const agent = mtlsDispatcherFromEnv({ ONE_ID_CLIENT_CERT: DUMMY, ONE_ID_CLIENT_KEY: DUMMY })
    expect(agent).toBeInstanceOf(Agent)
  })

  it('throws on partial inline config (cert without key, and vice-versa)', () => {
    expect(() => mtlsDispatcherFromEnv({ ONE_ID_CLIENT_CERT: DUMMY })).toThrow(/inline config incomplete/i)
    expect(() => mtlsDispatcherFromEnv({ ONE_ID_CLIENT_KEY: DUMMY })).toThrow(/inline config incomplete/i)
  })

  it('throws on partial file config', () => {
    expect(() => mtlsDispatcherFromEnv({ ONE_ID_CLIENT_CERT_FILE: '/x' })).toThrow(/file config incomplete/i)
  })
})

// A genuine mutual-TLS handshake: an https server that REQUIRES a client cert,
// and the dispatcher presenting one. Certs are generated fresh per run (so no
// key material is committed — gitleaks-safe). Skipped only if openssl is absent.
describe.skipIf(!hasOpenssl())('mTLS handshake (real TLS)', () => {
  let dir: string
  let serverCrt: string, clientCrt: string, clientKey: string
  let server: Server
  let url: string

  function genSelfSigned(name: string, subj: string, san?: string) {
    const key = join(dir, `${name}.key`)
    const crt = join(dir, `${name}.crt`)
    const args = ['req', '-x509', '-newkey', 'rsa:2048', '-nodes',
      '-keyout', key, '-out', crt, '-days', '1', '-subj', subj]
    if (san) args.push('-addext', `subjectAltName=${san}`)
    execFileSync('openssl', args, { stdio: 'ignore' })
    return { key: readFileSync(key, 'utf8'), crt: readFileSync(crt, 'utf8') }
  }

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'mtls-'))
    const server_ = genSelfSigned('server', '/CN=localhost', 'DNS:localhost,IP:127.0.0.1')
    const client_ = genSelfSigned('client', '/CN=triage-link-client')
    serverCrt = server_.crt; clientCrt = client_.crt; clientKey = client_.key

    server = createServer(
      { key: server_.key, cert: server_.crt, requestCert: true, rejectUnauthorized: true, ca: client_.crt },
      (req, res) => {
        const peer = (req.socket as import('node:tls').TLSSocket).getPeerCertificate()
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: true, clientCN: peer?.subject?.CN ?? null }))
      },
    )
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const port = (server.address() as import('node:net').AddressInfo).port
    url = `https://localhost:${port}/`
  })

  afterAll(() => {
    server?.close()
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('connects and presents the client certificate when the dispatcher carries it', async () => {
    const dispatcher = createMtlsDispatcher({ cert: clientCrt, key: clientKey, ca: serverCrt })
    const res = await request(url, { dispatcher })
    expect(res.statusCode).toBe(200)
    const body = (await res.body.json()) as { ok: boolean; clientCN: string | null }
    expect(body.ok).toBe(true)
    expect(body.clientCN).toBe('triage-link-client') // the server saw OUR cert
    await dispatcher.close()
  })

  it('is rejected when no client certificate is presented', async () => {
    // Trusts the server (so the failure is specifically the MISSING client cert),
    // but presents none → the server requires one and aborts the handshake.
    const noCert = new Agent({ connect: { ca: serverCrt, rejectUnauthorized: true } })
    await expect(request(url, { dispatcher: noCert })).rejects.toThrow()
    await noCert.close()
  })

  it('mtlsDispatcherFromFiles loads PEM paths and connects', async () => {
    const dispatcher = mtlsDispatcherFromFiles({
      certPath: join(dir, 'client.crt'), keyPath: join(dir, 'client.key'), caPath: join(dir, 'server.crt'),
    })
    const res = await request(url, { dispatcher })
    expect(res.statusCode).toBe(200)
    await dispatcher.close()
  })
})
