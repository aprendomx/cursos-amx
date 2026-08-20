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

export async function listStuck(workerId) {
  // Jobs left in 'processing' by a PREVIOUS run of THIS worker.
  //
  // Filtering by worker_id matters once VIDEO_WORKER_REPLICAS > 1: without it,
  // a worker booting would sweep up rows its live siblings are actively
  // transcoding and yank them out from under them.
  const { rows } = await pool.query(
    `select id from public.videos where status = 'processing' and worker_id = $1`,
    [workerId]
  )
  return rows.map((r) => r.id)
}

export async function listPending() {
  const { rows } = await pool.query(
    `select id from public.videos where status = 'pending' order by creado_en`
  )
  return rows.map((r) => r.id)
}

/**
 * Claim the next pending job atomically using SKIP LOCKED.
 * Safe to call from multiple concurrent workers — only one will get each row.
 */
export async function claimNextPending(workerId) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      `update public.videos
       set status = 'processing', worker_id = $1, actualizado_en = now()
       where id = (
         select id from public.videos
         where status = 'pending'
         order by creado_en
         for update skip locked
         limit 1
       )
       returning id`,
      [workerId]
    )
    await client.query('COMMIT')
    return rows[0]?.id || null
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

/**
 * Reencola un job que falló, si le quedan intentos. Devuelve true si se
 * reencoló y false si se agotaron y queda en 'failed' definitivamente.
 */
export async function retryOrFail(videoId, maxRetries, errorMsg) {
  const { rows } = await pool.query(
    `update public.videos
        set intentos = intentos + 1,
            error_msg = $3,
            ultimo_error_en = now(),
            actualizado_en = now(),
            worker_id = null,
            status = case when intentos + 1 < $2 then 'pending' else 'failed' end
      where id = $1
      returning intentos, status`,
    [videoId, maxRetries, errorMsg]
  )
  const fila = rows[0]
  return fila?.status === 'pending'
}

export async function releaseJob(videoId) {
  // Re-queue, don't just detach. The previous version only cleared worker_id
  // and left status = 'processing' — but claimNextPending() only ever looks at
  // 'pending', so the row became invisible to every worker forever. A restart
  // mid-transcode silently lost the video, with no error and no alert.
  await pool.query(
    `update public.videos
        set status = 'pending', worker_id = null, actualizado_en = now()
      where id = $1 and status = 'processing'`,
    [videoId]
  )
}
