// services/video-worker/src/logger.js
// Logger estructurado con timestamp ISO, severity y contexto.

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 }
const MIN_LEVEL = LEVELS[process.env.LOG_LEVEL || 'info'] || 20

export function logger(level, msg, extra = {}) {
  if (LEVELS[level] < MIN_LEVEL) return
  const entry = {
    timestamp: new Date().toISOString(),
    severity: level.toUpperCase(),
    msg,
    ...extra,
  }
  const output = JSON.stringify(entry)
  if (level === 'error') console.error(output)
  else if (level === 'warn') console.warn(output)
  else console.log(output)
}

// Helpers con contexto de video
export function logJob(level, msg, videoId, extra = {}) {
  logger(level, msg, { videoId, ...extra })
}
