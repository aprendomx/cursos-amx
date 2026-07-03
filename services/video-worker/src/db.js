import pg from 'pg'
import { logger } from './logger.js'

const { Pool, Client } = pg

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 4,
})

// A dedicated Client for LISTEN. Keep it alive forever; reconnect on error.
export function createListener(onNotify) {
  const client = new Client({ connectionString: process.env.DATABASE_URL })
  client.on('notification', (msg) => {
    if (msg.channel === 'video_jobs' && msg.payload) {
      onNotify(msg.payload)
    }
  })
  client.on('error', (err) => {
    logger('error', 'listener error', { err: String(err), code: err?.code })
  })
  return client
}

export async function getVideoRow(videoId) {
  const { rows } = await pool.query(
    'select id, leccion_id, status, source_path from public.videos where id = $1',
    [videoId]
  )
  return rows[0] || null
}

export async function setStatus(videoId, status, fields = {}) {
  const sets = ['status = $2', 'actualizado_en = now()']
  const vals = [videoId, status]
  for (const [k, v] of Object.entries(fields)) {
    vals.push(v)
    sets.push(`${k} = $${vals.length}`)
  }
  await pool.query(`update public.videos set ${sets.join(', ')} where id = $1`, vals)
}

export async function listStuck() {
  // Jobs interrupted by a worker restart while transcoding.
  const { rows } = await pool.query(`select id from public.videos where status = 'processing'`)
  return rows.map((r) => r.id)
}

export async function listPending() {
  const { rows } = await pool.query(
    `select id from public.videos where status = 'pending' order by creado_en`
  )
  return rows.map((r) => r.id)
}
