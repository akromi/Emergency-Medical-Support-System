import { describe, it, expect } from 'vitest'
import { EhrError } from '@triage-link/core'
import { HttpClient, type FetchLike } from '../src/index.js'

function countingFetch(status: number): { fetch: FetchLike; count: () => number } {
  let n = 0
  const fetch: FetchLike = async () => {
    n++
    return { ok: status >= 200 && status < 300, status, text: async () => '{}' }
  }
  return { fetch, count: () => n }
}

const noSleep = async () => {}

describe('HttpClient retry safety', () => {
  it('retries an idempotent GET on a 503 up to maxAttempts', async () => {
    const { fetch, count } = countingFetch(503)
    const http = new HttpClient({ baseUrl: 'https://x', fetchImpl: fetch, maxAttempts: 3, sleep: noSleep })
    await expect(http.request('/r', { method: 'GET' })).rejects.toMatchObject({ code: 'unavailable' })
    expect(count()).toBe(3)
  })

  it('does NOT retry a non-idempotent POST (no double-write)', async () => {
    const { fetch, count } = countingFetch(503)
    const http = new HttpClient({ baseUrl: 'https://x', fetchImpl: fetch, maxAttempts: 3, sleep: noSleep })
    await expect(http.request('/r', { method: 'POST', body: '{}' })).rejects.toBeInstanceOf(EhrError)
    expect(count()).toBe(1)
  })

  it('retries a POST that explicitly opts in as idempotent', async () => {
    const { fetch, count } = countingFetch(503)
    const http = new HttpClient({ baseUrl: 'https://x', fetchImpl: fetch, maxAttempts: 3, sleep: noSleep })
    await expect(http.request('/r', { method: 'POST', body: '{}', idempotent: true })).rejects.toBeInstanceOf(EhrError)
    expect(count()).toBe(3)
  })

  it('does not retry a non-retryable status (e.g. 403)', async () => {
    const { fetch, count } = countingFetch(403)
    const http = new HttpClient({ baseUrl: 'https://x', fetchImpl: fetch, maxAttempts: 3, sleep: noSleep })
    await expect(http.request('/r', { method: 'GET' })).rejects.toMatchObject({ code: 'forbidden' })
    expect(count()).toBe(1)
  })
})
