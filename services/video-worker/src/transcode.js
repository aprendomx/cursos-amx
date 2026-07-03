import { spawn } from 'node:child_process'
import { mkdir, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { logger } from './logger.js'

function run(cmd, args, { cwd } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    p.stderr.on('data', (d) => {
      stderr += d.toString()
    })
    p.on('error', (err) => {
      logger('error', 'spawn error', { cmd, err: String(err) })
      reject(err)
    })
    p.on('close', (code) => {
      if (code === 0) resolve()
      else {
        const tail = stderr.slice(-2000)
        logger('error', 'process exited with error', { cmd, code, stderr: tail })
        reject(new Error(`${cmd} exit ${code}: ${tail}`))
      }
    })
  })
}

export async function probe(file) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffprobe', [
      '-v',
      'error',
      '-print_format',
      'json',
      '-show_streams',
      '-show_format',
      file,
    ])
    let out = ''
    let stderr = ''
    p.stdout.on('data', (d) => {
      out += d.toString()
    })
    p.stderr.on('data', (d) => {
      stderr += d.toString()
    })
    p.on('close', (code) => {
      if (code !== 0) {
        const tail = stderr.trim().split(/\r?\n/).slice(-3).join(' | ').slice(-500)
        logger('error', 'ffprobe failed', { file, code, stderr: tail })
        return reject(new Error(`ffprobe exit ${code}: ${tail || 'no stderr'}`))
      }
      try {
        const j = JSON.parse(out)
        const v = (j.streams || []).find((s) => s.codec_type === 'video') || {}
        resolve({
          durationSeg: Math.round(Number(j.format?.duration || 0)),
          width: Number(v.width || 0),
          height: Number(v.height || 0),
        })
      } catch (e) {
        logger('error', 'ffprobe output parse failed', {
          file,
          err: String(e.message || e).slice(0, 200),
        })
        reject(new Error(`ffprobe output parse failed: ${String(e.message || e).slice(0, 200)}`))
      }
    })
    p.on('error', (err) => {
      logger('error', 'ffprobe spawn error', { file, err: String(err) })
      reject(err)
    })
  })
}

export async function makePoster(source, outFile) {
  await run('ffmpeg', ['-y', '-ss', '5', '-i', source, '-frames:v', '1', '-q:v', '3', outFile])
}

// Decide which ladder rungs to produce based on source height.
function pickVariants(srcHeight) {
  const all = [
    { name: '360p', w: 640, h: 360, vBitrate: 800, maxrate: 856, bufsize: 1200 },
    { name: '720p', w: 1280, h: 720, vBitrate: 2800, maxrate: 2996, bufsize: 4200 },
    { name: '1080p', w: 1920, h: 1080, vBitrate: 5000, maxrate: 5350, bufsize: 7500 },
  ]
  // Always include 360p. Include 720p/1080p only if source height supports them.
  return all.filter((v) => v.h === 360 || srcHeight >= v.h)
}

export async function transcodeHls(source, outDir, srcHeight) {
  const variants = pickVariants(srcHeight)
  await mkdir(outDir, { recursive: true })
  for (const v of variants) {
    await mkdir(path.join(outDir, v.name), { recursive: true })
  }

  // filter_complex: split N ways and scale each
  const splitLabels = variants.map((_, i) => `[v${i}]`).join('')
  const scales = variants
    .map((v, i) => `[v${i}]scale=w=${v.w}:h=${v.h}:force_original_aspect_ratio=decrease[v${i}out]`)
    .join('; ')
  const filter = `[0:v]split=${variants.length}${splitLabels}; ${scales}`

  const args = ['-y', '-i', source, '-filter_complex', filter]

  variants.forEach((v, i) => {
    args.push('-map', `[v${i}out]`)
    args.push(`-c:v:${i}`, 'libx264')
    args.push(`-b:v:${i}`, `${v.vBitrate}k`)
    args.push(`-maxrate:v:${i}`, `${v.maxrate}k`)
    args.push(`-bufsize:v:${i}`, `${v.bufsize}k`)
  })

  variants.forEach(() => args.push('-map', 'a:0?'))
  args.push('-c:a', 'aac', '-b:a', '128k', '-ac', '2')

  args.push('-preset', 'veryfast', '-g', '48', '-keyint_min', '48', '-sc_threshold', '0')
  args.push('-f', 'hls', '-hls_time', '6', '-hls_playlist_type', 'vod')
  args.push('-hls_segment_filename', '%v/seg_%03d.ts')
  args.push('-master_pl_name', 'master.m3u8')
  args.push('-var_stream_map', variants.map((v, i) => `v:${i},a:${i},name:${v.name}`).join(' '))
  args.push('%v/index.m3u8')

  await run('ffmpeg', args, { cwd: outDir })
  return variants.map((v) => v.name)
}

// Recursively list files relative to root.
export async function walk(root, base = root, out = []) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) await walk(full, base, out)
    else out.push(path.relative(base, full))
  }
  return out
}
