// Cliente REST minimalista para PostgREST.
// Evita supabase-js (cuelga por auto-refresh roto en self-hosted).

const URL_BASE = import.meta.env.VITE_SUPABASE_URL
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY

export interface SbError extends Error {
  status: number
  raw: string
}

export interface SbSelectOptions {
  /** Pide solo el conteo (header Prefer: count=...) sin traer filas. */
  count?: 'exact' | 'planned' | 'estimated'
  signal?: AbortSignal
}

export interface SbSelectResult<T> {
  data: T[]
  count: number | null
}

type Token = string | null | undefined

function authHeaders(accessToken: Token): Record<string, string> {
  return {
    apikey: ANON,
    Authorization: `Bearer ${accessToken || ANON}`,
  }
}

function makeError(op: string, target: string, status: number, text: string): SbError {
  const err = new Error(`${op} ${target} ${status}: ${text}`) as SbError
  err.status = status
  err.raw = text
  return err
}

export async function sbSelect<T = any>(
  path: string,
  accessToken?: Token,
  opts: SbSelectOptions = {}
): Promise<SbSelectResult<T>> {
  const url = `${URL_BASE}/rest/v1/${path}`
  const headers: Record<string, string> = { ...authHeaders(accessToken) }
  if (opts.count) {
    headers.Prefer = `count=${opts.count}`
    headers.Range = '0-0'
  }
  const res = await fetch(url, { headers, signal: opts.signal })
  if (!res.ok) throw makeError('select', path, res.status, await res.text())
  let count: number | null = null
  const range = res.headers.get('content-range')
  if (range) {
    const m = range.match(/\/(\d+|\*)$/)
    if (m && m[1] !== '*') count = parseInt(m[1], 10)
  }
  return { data: opts.count ? [] : await res.json(), count }
}

export async function sbInsert<T = any>(
  table: string,
  payload: object | object[],
  accessToken?: Token,
  returnRow = true
): Promise<T | null> {
  const res = await fetch(`${URL_BASE}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(accessToken),
      Prefer: returnRow ? 'return=representation' : 'return=minimal',
    },
    body: JSON.stringify(Array.isArray(payload) ? payload : [payload]),
  })
  if (!res.ok) throw makeError('insert', table, res.status, await res.text())
  if (!returnRow) return null
  const rows = await res.json()
  return Array.isArray(rows) ? rows[0] : rows
}

export async function sbPatch<T = any>(
  table: string,
  query: string,
  payload: object,
  accessToken?: Token
): Promise<T> {
  const res = await fetch(`${URL_BASE}/rest/v1/${table}?${query}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(accessToken),
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw makeError('patch', table, res.status, await res.text())
  const rows = await res.json()
  return Array.isArray(rows) ? rows[0] : rows
}

export async function sbDelete(path: string, accessToken?: Token): Promise<true> {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  })
  if (!res.ok) throw makeError('delete', path.split('?')[0], res.status, await res.text())
  return true
}

export async function sbRpc<T = any>(
  fn: string,
  args?: object | null,
  accessToken?: Token
): Promise<T | null> {
  const res = await fetch(`${URL_BASE}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(accessToken),
    },
    body: JSON.stringify(args || {}),
  })
  if (!res.ok) throw makeError('rpc', fn, res.status, await res.text())
  const text = await res.text()
  return text ? JSON.parse(text) : null
}
