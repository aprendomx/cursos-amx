import { createListener, listStuck, claimNextPending, releaseJob } from './db.js'
import { runJob } from './job.js'
import { sweepIngest, sweepDocs } from './cleanup.js'
import http from 'node:http'
import { logger } from './logger.js'
import { hostname } from 'node:os'

const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT || 1)
const HEALTH_PORT = Number(process.env.HEALTH_PORT || 3000)
const WORKER_ID = `${hostname()}-${process.pid}`

const inflight = new Set()
let claimed = 0
let processed = 0

function startHealthServer() {
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          status: 'ok',
          worker: WORKER_ID,
          inflight: inflight.size,
          claimed,
          processed,
        })
      )
      return
    }
    if (req.url === '/metrics') {
      // Minimal Prometheus-compatible metrics for monitoring
      const lines = [
        '# HELP video_worker_inflight Jobs currently transcoding',
        '# TYPE video_worker_inflight gauge',
        `video_worker_inflight{worker="${WORKER_ID}"} ${inflight.size}`,
        '# HELP video_worker_processed_total Jobs completed total',
        '# TYPE video_worker_processed_total counter',
        `video_worker_processed_total{worker="${WORKER_ID}"} ${processed}`,
      ]
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end(lines.join('\n'))
      return
    }
    res.writeHead(404)
    res.end()
  })
  server.listen(HEALTH_PORT, () => {
    logger('info', 'health server listening', { port: HEALTH_PORT, worker: WORKER_ID })
  })
}

async function claimAndRun() {
  while (inflight.size < MAX_CONCURRENT) {
    const id = await claimNextPending(WORKER_ID)
    if (!id) break // no more pending jobs
    claimed++
    inflight.add(id)
    runJob(id)
      .catch((err) => {
        logger('error', 'unhandled', { id, err: String(err) })
      })
      .finally(() => {
        inflight.delete(id)
        processed++
        claimAndRun() // try to claim next
      })
  }
}

async function startListener() {
  const client = createListener(() => {
    // A new job was inserted. Try to claim it if we have capacity.
    claimAndRun()
  })
  await client.connect()
  await client.query('LISTEN video_jobs')
  logger('info', 'LISTENING video_jobs', { worker: WORKER_ID })

  client.on('end', () => {
    logger('warn', 'listener disconnected, retrying in 5s')
    setTimeout(startListener, 5000)
  })
}

async function backupPoll() {
  try {
    claimAndRun()
  } catch (err) {
    logger('error', 'backup poll failed', { err: String(err) })
  }
}

async function main() {
  // Resume jobs that were processing when this container restarted.
  // We should NOT claim jobs that another active worker already has.
  // For simplicity: stuck jobs are marked 'pending' so any worker can pick them up.
  const stuck = await listStuck()
  if (stuck.length) {
    logger('warn', 'found stuck jobs', { count: stuck.length })
    for (const id of stuck) {
      await releaseJob(id)
      logger('info', 'released stuck job', { id })
    }
  }

  startHealthServer()
  await startListener()
  setInterval(backupPoll, 60_000)
  await backupPoll()
  setInterval(
    () => {
      Promise.all([sweepIngest(), sweepDocs()])
        .then(([nIng, nDoc]) => logger('info', 'cleanup', { ingest: nIng, docs: nDoc }))
        .catch((err) => logger('error', 'cleanup failed', { err: String(err) }))
    },
    7 * 24 * 3600 * 1000
  )
}

main().catch((err) => {
  logger('error', 'fatal', { err: String(err) })
  process.exit(1)
})
