// supabase/functions/zoom-meeting/index.ts
// Edge Function: crea / elimina reuniones Zoom vía Server-to-Server OAuth.
// Requiere: ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET (fallback a DB)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const ZOOM_API_BASE = 'https://api.zoom.us/v2'
const ZOOM_OAUTH_URL = 'https://zoom.us/oauth/token'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ── Auth ──
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // ── Zoom config (DB o env) ──
    const zoomConfig = await loadZoomConfig(supabaseAdmin)
    if (!zoomConfig) {
      return new Response(
        JSON.stringify({ error: 'Zoom no configurado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const accessToken = await getZoomAccessToken(supabaseAdmin, zoomConfig)

    const url = new URL(req.url)
    const pathParts = url.pathname.split('/').filter(Boolean)
    const meetingId = pathParts.length > 1 ? pathParts[pathParts.length - 1] : null

    // ── POST: crear reunión ──
    if (req.method === 'POST') {
      const { titulo, inicio, fin, descripcion } = await req.json()

      const durationMin = fin
        ? Math.max(1, Math.ceil((new Date(fin).getTime() - new Date(inicio).getTime()) / 60000))
        : 60

      const res = await fetch(`${ZOOM_API_BASE}/users/me/meetings`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          topic: titulo,
          type: 2, // Scheduled meeting
          start_time: inicio,
          duration: durationMin,
          timezone: 'America/Mexico_City',
          agenda: descripcion || '',
          settings: {
            auto_recording: 'cloud',
            waiting_room: false,
            join_before_host: true,
            mute_upon_entry: true,
          },
        }),
      })

      if (!res.ok) {
        const err = await res.text()
        console.error('[zoom-meeting] error creando reunión:', err)
        return new Response(
          JSON.stringify({ error: 'Error al crear reunión Zoom', detail: err }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      const data = await res.json()
      return new Response(
        JSON.stringify({
          meeting_id: String(data.id),
          join_url: data.join_url,
          start_url: data.start_url,
          password: data.password || null,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ── DELETE: eliminar reunión ──
    if (req.method === 'DELETE' && meetingId) {
      const res = await fetch(`${ZOOM_API_BASE}/meetings/${meetingId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      })

      if (!res.ok && res.status !== 404) {
        const err = await res.text()
        console.error('[zoom-meeting] error eliminando reunión:', err)
        return new Response(
          JSON.stringify({ error: 'Error al eliminar reunión Zoom', detail: err }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      return new Response(
        JSON.stringify({ ok: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e: any) {
    console.error('[zoom-meeting] error general:', e.message)
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

// ───────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────

interface ZoomConfig {
  id: string
  client_id: string
  client_secret: string
  account_id: string
  access_token?: string
  refresh_token?: string
  expires_at?: string
}

async function loadZoomConfig(supabase: any): Promise<ZoomConfig | null> {
  // 1. Intentar desde env (producción / CI)
  const envClientId = Deno.env.get('ZOOM_CLIENT_ID')
  const envClientSecret = Deno.env.get('ZOOM_CLIENT_SECRET')
  const envAccountId = Deno.env.get('ZOOM_ACCOUNT_ID')

  if (envClientId && envClientSecret && envAccountId) {
    return {
      id: 'env',
      client_id: envClientId,
      client_secret: envClientSecret,
      account_id: envAccountId,
    }
  }

  // 2. Fallback a DB
  const { data, error } = await supabase
    .from('zoom_configuracion')
    .select('*')
    .single()

  if (error || !data) {
    console.error('[zoom-meeting] no se encontró configuración Zoom:', error?.message)
    return null
  }

  return data as ZoomConfig
}

async function getZoomAccessToken(supabase: any, config: ZoomConfig): Promise<string> {
  // Reusar token vigente
  if (config.access_token && config.expires_at) {
    const expiresAt = new Date(config.expires_at)
    const bufferMs = 60_000 // 1 minuto de margen
    if (expiresAt.getTime() - bufferMs > Date.now()) {
      return config.access_token
    }
  }

  // Refrescar via Server-to-Server OAuth
  const credentials = btoa(`${config.client_id}:${config.client_secret}`)

  const res = await fetch(ZOOM_OAUTH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `grant_type=account_credentials&account_id=${config.account_id}`,
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Zoom OAuth error: ${err}`)
  }

  const data = await res.json()
  const newToken = data.access_token
  const expiresIn = data.expires_in || 3600
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

  // Persistir en DB si venía de DB
  if (config.id !== 'env') {
    const { error } = await supabase
      .from('zoom_configuracion')
      .update({
        access_token: newToken,
        expires_at: expiresAt,
      })
      .eq('id', config.id)

    if (error) {
      console.error('[zoom-meeting] error al guardar token:', error.message)
    }
  }

  return newToken
}
