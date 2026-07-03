import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { checkRateLimit } from '../_shared/rateLimit.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
// Public URL the browser can reach. SUPABASE_URL inside the functions
// container is the internal kong hostname (http://kong:8000), which the
// client can't resolve. Set SUPABASE_PUBLIC_URL to your public domain.
const PUBLIC_URL = Deno.env.get('SUPABASE_PUBLIC_URL') || SUPABASE_URL
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const HLS_BUCKET = Deno.env.get('HLS_BUCKET') || 'video-hls'
const SIGNED_TTL = Number(Deno.env.get('SIGNED_TTL_SECONDS') || 4 * 3600)

// supabase-js builds signed URLs from SUPABASE_URL (internal kong host).
// Rewrite them to the public URL so the browser can reach them.
function toPublic(url: string): string {
  return PUBLIC_URL === SUPABASE_URL ? url : url.replace(SUPABASE_URL, PUBLIC_URL)
}

serve(async (req) => {
  const rl = checkRateLimit(req)
  if (!rl.allowed) {
    return json({ error: 'too many requests' }, 429, {
      'x-ratelimit-remaining': '0',
      'x-ratelimit-reset': String(Math.ceil(rl.resetAt / 1000)),
      'retry-after': String(rl.retryAfter ?? 60),
    })
  }

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    if (!jwt) return json({ error: 'unauthorized' }, 401)

    const { video_id } = await req.json()
    if (!video_id) return json({ error: 'video_id required' }, 400)

    // Anon key as apikey (kong validates this); user JWT in Authorization
    // header so PostgREST sets auth.uid() correctly inside the RPC.
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    })
    const { data, error } = await userClient.rpc('get_video_playback', { p_video_id: video_id })

    if (error) {
      // Map PL/pgSQL exceptions AND PostgREST JWT errors to HTTP status.
      const msg = String(error.message || '')
      if (/unauthorized|jwt/i.test(msg)) return json({ error: 'unauthorized' }, 401)
      if (/forbidden/i.test(msg)) return json({ error: 'forbidden' }, 403)
      if (/not ready/i.test(msg)) return json({ error: 'not ready' }, 404)
      return json({ error: msg }, 500)
    }
    const row = Array.isArray(data) ? data[0] : data
    if (!row) return json({ error: 'not ready' }, 404)

    // Sign the poster directly with the service role.
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE)
    const { data: poster, error: posterErr } = await admin.storage
      .from(HLS_BUCKET)
      .createSignedUrl(row.poster_path, SIGNED_TTL)
    if (posterErr) return json({ error: posterErr.message }, 500)

    // Master URL points at the hls-playlist proxy so playlist URIs can
    // be rewritten on every request with fresh signed segment URLs.
    // Must use the public URL — the browser fetches this directly.
    const master_url =
      `${PUBLIC_URL}/functions/v1/hls-playlist` +
      `?video=${encodeURIComponent(video_id)}` +
      `&path=master.m3u8` +
      `&t=${encodeURIComponent(jwt)}`

    return json({
      master_url,
      poster_url: toPublic(poster.signedUrl),
      duracion_seg: row.duracion_seg,
      expires_in: SIGNED_TTL,
    })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json', ...extraHeaders },
  })
}
