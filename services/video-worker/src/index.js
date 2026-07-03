import { createListener, listPending, listStuck } from './db.js'
import { runJob } from './job.js'
import { sweepIngest, sweepDocs } from './cleanup.js'
import http from 'node:http'
import { logger } from './logger.js'

const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT || 1)
const HEALTH_PORT = Number(process.env.HEALTH_PORT || 3000)
const queue = []
const inflight = new Set()
const seen = new Set() // ids currently queued or running

function startHealthServer() {
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok', inflight: inflight.size, queued: queue.length }))
      return
    }
    res.writeHead(404)
    res.end()
  })
  server.listen(HEALTH_PORT, () => {
    logger('info', 'health server listening', { port: HEALTH_PORT })
  })
}

function enqueue(id) {
  if (!id || seen.has(id)) return
  seen.add(id)
  queue.push(id)
  pump()
}

async function pump() {
  while (queue.length > 0 && inflight.size < MAX_CONCURRENT) {
    const id = queue.shift()
    inflight.add(id)
    runJob(id)
      .catch((err) => logger('error', 'unhandled', { id, err: String(err) }))
      .finally(() => {
        inflight.delete(id)
        seen.delete(id)
        pump()
      })
  }
}

async function startListener() {
  const client = createListener(enqueue)
  await client.connect()
  await client.query('LISTEN video_jobs')
  logger('info', 'LISTENING video_jobs')

  client.on('end', () => {
    logger('warn', 'listener disconnected, retrying in 5s')
    setTimeout(startListener, 5000)
  })
}

async function backupPoll() {
  try {
    for (const id of await listPending()) enqueue(id)
  } catch (err) {
    logger('error', 'backup poll failed', { err: String(err) })
  }
}

async function main() {
  // Resume jobs that were transcoding when the container restarted.
  for (const id of await listStuck()) enqueue(id)
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
