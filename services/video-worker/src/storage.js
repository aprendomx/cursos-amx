import fetch from 'node-fetch'
import { createReadStream, statSync } from 'node:fs'
import { logger } from './logger.js'

const URL_BASE = process.env.SUPABASE_URL
const SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const INGEST = process.env.INGEST_BUCKET || 'video-ingest'
const HLS = process.env.HLS_BUCKET || 'video-hls'

function authHeaders(extra = {}) {
  return {
    apikey: SVC_KEY,
    authorization: `Bearer ${SVC_KEY}`,
    ...extra,
  }
}

export async function downloadFromIngest(objectPath, destFile) {
  const url = `${URL_BASE}/storage/v1/object/${INGEST}/${objectPath}`
  const res = await fetch(url, { headers: authHeaders() })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    logger('error', 'download failed', { objectPath, status: res.status, body: body.slice(0, 500) })
    throw new Error(`download ${objectPath} failed: ${res.status} ${body}`)
  }
  const { createWriteStream } = await import('node:fs')
  const { pipeline } = await import('node:stream/promises')
  await pipeline(res.body, createWriteStream(destFile))
}

export async function uploadToHls(localFile, objectPath, contentType, cacheControl) {
  const url = `${URL_BASE}/storage/v1/object/${HLS}/${objectPath}`
  const size = statSync(localFile).size
  const res = await fetch(url, {
    method: 'POST',
    headers: authHeaders({
      'content-type': contentType,
      'cache-control': cacheControl,
      'content-length': String(size),
      'x-upsert': 'true',
    }),
    body: createReadStream(localFile),
    duplex: 'half',
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    logger('error', 'upload failed', { objectPath, status: res.status, body: body.slice(0, 500) })
    throw new Error(`upload ${objectPath} failed: ${res.status} ${body}`)
  }
}

export async function deleteIngest(objectPath) {
  const url = `${URL_BASE}/storage/v1/object/${INGEST}/${objectPath}`
  const res = await fetch(url, { method: 'DELETE', headers: authHeaders() })
  if (!res.ok && res.status !== 404) {
    logger('warn', 'delete ingest failed', { objectPath, status: res.status })
  }
}
