import path from 'node:path'
import { mkdir, rm, stat } from 'node:fs/promises'
import { getVideoRow, setStatus, retryOrFail } from './db.js'
import { downloadFromIngest, uploadToHls } from './storage.js'
import { probe, makePoster, transcodeHls, walk } from './transcode.js'
import { logJob } from './logger.js'

const WORK = process.env.WORK_DIR || '/tmp/video-worker'
// Un fallo transitorio (red al descargar el origen, storage temporalmente
// caído) no debe ser terminal. Se reintenta antes de rendirse.
const MAX_RETRIES = Number(process.env.JOB_MAX_RETRIES || 3)

function contentTypeFor(name) {
  if (name.endsWith('.m3u8')) return 'application/vnd.apple.mpegurl'
  if (name.endsWith('.ts')) return 'video/MP2T'
  if (name.endsWith('.jpg')) return 'image/jpeg'
  return 'application/octet-stream'
}

function cacheFor(name) {
  if (name.endsWith('.m3u8')) return 'no-cache'
  return 'public, max-age=31536000, immutable'
}

export async function runJob(videoId) {
  const v = await getVideoRow(videoId)
  if (!v || v.status === 'ready') return

  const dir = path.join(WORK, videoId)
  try {
    await setStatus(videoId, 'processing', { error_msg: null })
    await mkdir(dir, { recursive: true })

    const source = path.join(dir, 'source.mp4')
    const sourceObj = v.source_path || `${videoId}.mp4`
    logJob('info', 'downloading source', videoId, { sourceObj })
    await downloadFromIngest(sourceObj, source)

    logJob('info', 'probing source', videoId)
    const meta = await probe(source)
    logJob('info', 'source probed', videoId, { durationSeg: meta.durationSeg, height: meta.height })

    logJob('info', 'making poster', videoId)
    await makePoster(source, path.join(dir, 'poster.jpg'))

    logJob('info', 'transcoding HLS', videoId)
    await transcodeHls(source, dir, meta.height)

    // Upload everything except source.mp4
    const files = (await walk(dir)).filter((f) => f !== 'source.mp4')
    for (const f of files) {
      const dest = `hls/${videoId}/${f}`
      logJob('debug', 'uploading file', videoId, { file: f, dest })
      await uploadToHls(path.join(dir, f), dest, contentTypeFor(f), cacheFor(f))
    }

    await setStatus(videoId, 'ready', {
      hls_path: `hls/${videoId}/master.m3u8`,
      poster_path: `hls/${videoId}/poster.jpg`,
      duracion_seg: meta.durationSeg,
    })
    logJob('info', 'ready', videoId)
  } catch (err) {
    const msg = String(err?.message || err).slice(0, 2000)
    const reencolado = await retryOrFail(videoId, MAX_RETRIES, msg)
    if (reencolado) {
      logJob('warn', 'job failed, re-queued', videoId, { err: msg, maxRetries: MAX_RETRIES })
    } else {
      logJob('error', 'job failed permanently', videoId, { err: msg, maxRetries: MAX_RETRIES })
    }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}
