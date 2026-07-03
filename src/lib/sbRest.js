// Cliente REST minimalista para PostgREST.
// Evita supabase-js (cuelga por auto-refresh roto en self-hosted).

const URL_BASE = import.meta.env.VITE_SUPABASE_URL
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY

function authHeaders(accessToken) {
  return {
    apikey: ANON,
    Authorization: `Bearer ${accessToken || ANON}`,
  }
}

export async function sbSelect(path, accessToken, opts = {}) {
  const url = `${URL_BASE}/rest/v1/${path}`
  const headers = { ...authHeaders(accessToken) }
  if (opts.count) {
    headers.Prefer = `count=${opts.count}`
    headers.Range = '0-0'
  }
  const res = await fetch(url, { headers, signal: opts.signal })
  if (!res.ok) throw new Error(`select ${path} ${res.status}: ${await res.text()}`)
  let count = null
  const range = res.headers.get('content-range')
  if (range) {
    const m = range.match(/\/(\d+|\*)$/)
    if (m && m[1] !== '*') count = parseInt(m[1], 10)
  }
  return { data: opts.count ? [] : await res.json(), count }
}

export async function sbInsert(table, payload, accessToken, returnRow = true) {
  const res = await fetch(`${URL_BASE}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(accessToken),
      Prefer: returnRow ? 'return=representation' : 'return=minimal',
    },
    body: JSON.stringify(Array.isArray(payload) ? payload : [payload]),
  })
  if (!res.ok) {
    const err = new Error(`insert ${table} ${res.status}: ${await res.text()}`)
    err.status = res.status
    throw err
  }
  if (!returnRow) return null
  const rows = await res.json()
  return Array.isArray(rows) ? rows[0] : rows
}

export async function sbDelete(path, accessToken) {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  })
  if (!res.ok) {
    const err = new Error(`delete ${path} ${res.status}: ${await res.text()}`)
    err.status = res.status
    throw err
  }
  return true
}

export async function sbRpc(fn, args, accessToken) {
  const res = await fetch(`${URL_BASE}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(accessToken),
    },
    body: JSON.stringify(args || {}),
  })
  if (!res.ok) throw new Error(`rpc ${fn} ${res.status}: ${await res.text()}`)
  const text = await res.text()
  return text ? JSON.parse(text) : null
}
