// services/video-worker/src/cleanup.js
import { pool } from './db.js'
import { deleteIngest } from './storage.js'
import { logger } from './logger.js'

const INGEST = process.env.INGEST_BUCKET || 'video-ingest'
const DOCS_BUCKET = process.env.DOCS_BUCKET || 'lesson-docs'

async function listAllObjects(bucket) {
  const res = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/list/${bucket}`, {
    method: 'POST',
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ prefix: '', limit: 1000, offset: 0 }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    logger('error', 'list objects failed', { bucket, status: res.status, body: body.slice(0, 500) })
    throw new Error(`list ${bucket}: ${res.status}`)
  }
  return await res.json()
}

async function deleteFromBucket(bucket, objectPath) {
  const res = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/${bucket}/${objectPath}`, {
    method: 'DELETE',
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  })
  if (!res.ok && res.status !== 404) {
    logger('warn', 'delete from bucket failed', { bucket, objectPath, status: res.status })
  }
}

export async function sweepIngest() {
  const objs = await listAllObjects(INGEST)
  if (!objs?.length) return 0
  const ids = objs.map((o) => o.name.replace(/\.mp4$/, '')).filter(Boolean)
  const { rows } = await pool.query(
    'select id::text from public.videos where id::text = any($1::text[])',
    [ids]
  )
  const known = new Set(rows.map((r) => r.id))
  let deleted = 0
  for (const o of objs) {
    const id = o.name.replace(/\.mp4$/, '')
    if (!known.has(id)) {
      await deleteIngest(o.name)
      deleted++
    }
  }
  if (deleted > 0) logger('info', 'sweep ingest', { deleted })
  return deleted
}

export async function sweepDocs() {
  const objs = await listAllObjects(DOCS_BUCKET)
  if (!objs?.length) return 0
  const { rows } = await pool.query(
    'select documento_path from public.lecciones where documento_path is not null'
  )
  const known = new Set(rows.map((r) => r.documento_path))
  let deleted = 0
  for (const o of objs) {
    if (!known.has(o.name)) {
      await deleteFromBucket(DOCS_BUCKET, o.name)
      deleted++
    }
  }
  if (deleted > 0) logger('info', 'sweep docs', { deleted })
  return deleted
}
