'use client'

/**
 * Typed fetch wrapper for the PathShala API.
 * Every endpoint responds { ok, data } | { ok:false, error }.
 *
 * Resilience (fixes "click korle kichu hoi na" + login errors):
 *  - Every attempt is bounded by an AbortController timeout (no infinite hangs
 *    while the dev server compiles a route on demand).
 *  - Transient failures are retried automatically with a short backoff so a
 *    single click always lands. Retrying is SAFETY-GRADED:
 *      • Reads (GET): retry on network errors, timeouts and transient codes.
 *      • Mutations (POST/PUT/PATCH/DELETE): only retry when we can be sure the
 *        handler never executed — 404 (dev-compile race), 502/503/504 (server
 *        not reachable) or a connection-level TypeError (request never left).
 *        Ambiguous failures (500, request timeout) are NOT retried, so a
 *        payment/order can never be created twice.
 *  - REAL user errors (401 wrong password, 403 blocked, 422 validation…) are
 *    never retried — the error surfaces immediately.
 */
export interface ApiEnvelope<T> {
  ok: boolean
  data?: T
  error?: string
}

const REQUEST_TIMEOUT_MS = 25_000
const MAX_ATTEMPTS = 3
const RETRY_BASE_DELAY_MS = 700

/** Route never ran — the request can be replayed safely, even for mutations. */
const SAFE_RETRY_STATUS = new Set([404, 502, 503, 504])
/** Additional states that are only replayable for read-only requests. */
const READ_RETRY_STATUS = new Set([408, 425, 429, 500])

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function fetchOnce(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  const isRead = !init.method || init.method === 'GET' || init.method === 'HEAD'
  let lastError: unknown = null

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const canRetry = attempt < MAX_ATTEMPTS
    try {
      const res = await fetchOnce(url, init, REQUEST_TIMEOUT_MS)
      const statusRetryable = SAFE_RETRY_STATUS.has(res.status) || (isRead && READ_RETRY_STATUS.has(res.status))
      if (statusRetryable && canRetry) {
        lastError = new Error(`Transient ${res.status} from ${url}`)
        await sleep(RETRY_BASE_DELAY_MS * attempt)
        continue
      }
      return res
    } catch (err) {
      lastError = err
      if (!canRetry) break
      const isAbort = err instanceof Error && err.name === 'AbortError'
      // Connection-level failure (TypeError): the request never reached the
      // server — safe to replay for any method. A timeout (AbortError) is
      // ambiguous: only reads may be replayed.
      if (isAbort && !isRead) break
      await sleep(RETRY_BASE_DELAY_MS * attempt)
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Network request failed')
}

export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetchWithRetry(url, { credentials: 'include' })
  const json = (await res.json()) as ApiEnvelope<T>
  if (!json.ok) throw new Error(json.error || 'Request failed')
  return json.data as T
}

export async function apiSend<T>(
  url: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body?: unknown
): Promise<T> {
  const res = await fetchWithRetry(url, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = (await res.json()) as ApiEnvelope<T>
  if (!json.ok) throw new Error(json.error || 'Request failed')
  return json.data as T
}

export const apiPost = <T,>(url: string, body?: unknown) => apiSend<T>(url, 'POST', body)
export const apiPut = <T,>(url: string, body?: unknown) => apiSend<T>(url, 'PUT', body)
export const apiPatch = <T,>(url: string, body?: unknown) => apiSend<T>(url, 'PATCH', body)
export const apiDelete = <T,>(url: string) => apiSend<T>(url, 'DELETE')
