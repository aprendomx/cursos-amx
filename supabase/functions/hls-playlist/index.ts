import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkRateLimit } from '../_shared/rateLimit.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
// Public URL the browser can reach (the hls.js client follows these URIs).
const PUBLIC_URL = Deno.env.get('SUPABASE_PUBLIC_URL') || SUPABASE_URL
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const HLS_BUCKET = Deno.env.get('HLS_BUCKET') || 'video-hls'
const SEG_TTL = Number(Deno.env.get('SEGMENT_TTL_SECONDS') || 4 * 3600)

// supabase-js builds signed URLs from SUPABASE_URL (internal kong host).
// Rewrite them to the public URL so the browser can reach them.
function toPublic(url: string): string {
  return PUBLIC_URL === SUPABASE_URL ? url : url.replace(SUPABASE_URL, PUBLIC_URL)
}

const m3u8Headers = {
  'content-type': 'application/vnd.apple.mpegurl',
  'cache-control': 'no-store',
  'access-control-allow-origin': '*',
}

serve(async (req) => {
  const rl = checkRateLimit(req)
  if (!rl.allowed) {
    return new Response('too many requests', {
      status: 429,
      headers: {
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': String(Math.ceil(rl.resetAt / 1000)),
        'retry-after': String(rl.retryAfter ?? 60),
      },
    })
  }

  const url = new URL(req.url)
  const videoId = url.searchParams.get('video')
  const objPath = url.searchParams.get('path')
  const jwt = url.searchParams.get('t')

  if (!videoId || !objPath || !jwt) {
    return new Response('bad request', { status: 400 })
  }
  // Block traversal
  if (objPath.includes('..') || objPath.startsWith('/')) {
    return new Response('bad path', { status: 400 })
  }
  if (!objPath.endsWith('.m3u8')) {
    return new Response('only m3u8 supported here', { status: 400 })
  }

  // Re-authorize on every request — manifests are short-lived.
  // Anon key as apikey (kong validates), user JWT in Authorization
  // so PostgREST sets auth.uid() inside the RPC.
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
  const { data, error } = await userClient.rpc('get_video_playback', { p_video_id: videoId })
  if (error) {
    const msg = String(error.message || '')
    if (/unauthorized|jwt/i.test(msg)) return new Response('unauthorized', { status: 401 })
    if (/not ready/i.test(msg)) return new Response('not ready', { status: 404 })
    return new Response('forbidden', { status: 403 })
  }
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return new Response('not ready', { status: 404 })

  const fullObj = `hls/${videoId}/${objPath}`
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE)
  const { data: file, error: dlErr } = await admin.storage.from(HLS_BUCKET).download(fullObj)
  if (dlErr || !file) return new Response('not found', { status: 404 })

  const text = await file.text()
  const rewritten = await rewriteManifest(text, videoId, objPath, jwt, admin)
  return new Response(rewritten, { headers: m3u8Headers })
})

async function rewriteManifest(
  text: string,
  videoId: string,
  manifestPath: string,
  jwt: string,
  admin: ReturnType<typeof createClient>
): Promise<string> {
  const dir = manifestPath.includes('/') ? manifestPath.slice(0, manifestPath.lastIndexOf('/')) : ''
  const lines = text.split('\n')

  // Pre-collect every relative URI in this manifest and bulk-sign segments.
  const segments: { line: number; objectPath: string }[] = []
  const out: string[] = lines.slice()

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line || line.startsWith('#')) continue

    const childPath = dir ? `${dir}/${line}` : line

    if (line.endsWith('.m3u8')) {
      // Sub-playlist → keep going through this same proxy function.
      // Must use the public URL — hls.js fetches this from the browser.
      const proxied =
        `${PUBLIC_URL}/functions/v1/hls-playlist` +
        `?video=${encodeURIComponent(videoId)}` +
        `&path=${encodeURIComponent(childPath)}` +
        `&t=${encodeURIComponent(jwt)}`
      out[i] = proxied
    } else {
      // Segment (.ts) — sign and serve direct from Storage.
      segments.push({ line: i, objectPath: `hls/${videoId}/${childPath}` })
    }
  }

  if (segments.length > 0) {
    const { data: signed } = await admin.storage.from(HLS_BUCKET).createSignedUrls(
      segments.map((s) => s.objectPath),
      SEG_TTL
    )
    if (signed) {
      segments.forEach((s, idx) => {
        const sig = signed[idx]
        if (sig?.signedUrl) out[s.line] = toPublic(sig.signedUrl)
      })
    }
  }

  return out.join('\n')
}
