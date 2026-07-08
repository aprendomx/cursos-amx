// supabase/functions/transcribir-sesion/index.ts
// Descarga audio de una grabación, intenta faster-whisper (local) primero,
// fallback a OpenAI Whisper API. Guarda resultado en sesiones_transcripciones.
// Se invoca desde zoom-webhook o manualmente por admin.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const WHISPER_API_URL = 'https://api.openai.com/v1/audio/transcriptions'
const FALLBACK_TIMEOUT_MS = 120_000 // 2 minutos para local antes de fallback

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  let sesionId: string | null = null

  try {
    const body = await req.json()
    const { sesion_id, grabacion_id, audio_url } = body
    sesionId = sesion_id

    if (!sesion_id || !audio_url) {
      return new Response(
        JSON.stringify({ error: 'Faltan sesion_id o audio_url' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // Insertar registro pendiente
    const { data: tx, error: txError } = await supabaseAdmin
      .from('sesiones_transcripciones')
      .upsert(
        {
          sesion_id,
          grabacion_id: grabacion_id || null,
          estado: 'procesando',
          texto_completo: '',
        },
        { onConflict: 'sesion_id' },
      )
      .select()
      .single()

    if (txError) {
      throw new Error(`Error insertando transcripción: ${txError.message}`)
    }

    // ── 1. Intentar faster-whisper local (default) ──
    const whisperLocalUrl = Deno.env.get('WHISPER_SERVICE_URL')
    let result: WhisperResult | null = null
    let source: 'faster-whisper' | 'openai' = 'openai'

    if (whisperLocalUrl) {
      try {
        console.log(`[transcribir-sesion] Intentando faster-whisper en ${whisperLocalUrl}`)
        result = await transcribeWithLocal(whisperLocalUrl, audio_url)
        source = 'faster-whisper'
        console.log('[transcribir-sesion] faster-whisper OK')
      } catch (localErr: any) {
        console.warn(`[transcribir-sesion] faster-whisper falló: ${localErr.message}. Intentando OpenAI...`)
      }
    } else {
      console.log('[transcribir-sesion] WHISPER_SERVICE_URL no configurado, usando OpenAI directamente')
    }

    // ── 2. Fallback a OpenAI ──
    if (!result) {
      const apiKey = Deno.env.get('OPENAI_API_KEY')
      if (!apiKey) {
        throw new Error('WHISPER_SERVICE_URL no disponible y OPENAI_API_KEY no configurada')
      }
      result = await transcribeWithOpenAI(apiKey, audio_url)
      source = 'openai'
      console.log('[transcribir-sesion] OpenAI OK')
    }

    // ── 3. Guardar en DB ──
    const duracionMin = result.duration ? result.duration / 60 : 0
    const costoUsd = source === 'openai' && duracionMin > 0
      ? Math.round(duracionMin * 0.006 * 10000) / 10000
      : 0 // Local es gratis

    const { error: updateError } = await supabaseAdmin
      .from('sesiones_transcripciones')
      .update({
        estado: 'completada',
        texto_completo: result.text || '',
        segmentos: result.segments,
        costo_usd: costoUsd,
        idioma: result.language || 'es',
      })
      .eq('id', tx.id)

    if (updateError) {
      throw new Error(`Error actualizando transcripción: ${updateError.message}`)
    }

    return new Response(
      JSON.stringify({
        ok: true,
        transcripcion_id: tx.id,
        source,
        costo_usd: costoUsd,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e: any) {
    console.error('[transcribir-sesion] error:', e.message)

    // Marcar como error en DB
    if (sesionId) {
      try {
        const supabaseAdmin = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        )
        await supabaseAdmin
          .from('sesiones_transcripciones')
          .update({ estado: 'error' })
          .eq('sesion_id', sesionId)
      } catch {
        // Ignorar
      }
    }

    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

// ───────────────────────────────────────────────────────────────
// Local (faster-whisper)
// ───────────────────────────────────────────────────────────────

interface WhisperResult {
  text: string
  segments: Array<{ start: number; end: number; text: string }>
  duration: number | null
  language: string | null
}

async function transcribeWithLocal(baseUrl: string, audioUrl: string): Promise<WhisperResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FALLBACK_TIMEOUT_MS)

  try {
    const res = await fetch(`${baseUrl}/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio_url: audioUrl, language: 'es' }),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`faster-whisper HTTP ${res.status}: ${err}`)
    }

    const data = await res.json()

    return {
      text: data.text || '',
      segments: (data.segments || []).map((s: any) => ({
        start: s.start,
        end: s.end,
        text: s.text,
      })),
      duration: data.duration || null,
      language: data.language || null,
    }
  } catch (e: any) {
    clearTimeout(timeout)
    throw e
  }
}

// ───────────────────────────────────────────────────────────────
// OpenAI (fallback)
// ───────────────────────────────────────────────────────────────

async function transcribeWithOpenAI(apiKey: string, audioUrl: string): Promise<WhisperResult> {
  const audioRes = await fetch(audioUrl)
  if (!audioRes.ok) {
    throw new Error(`Error descargando audio: ${audioRes.status}`)
  }

  const audioBlob = await audioRes.blob()

  const formData = new FormData()
  formData.append('file', new File([audioBlob], 'audio.mp4', { type: 'audio/mp4' }))
  formData.append('model', 'whisper-1')
  formData.append('language', 'es')
  formData.append('response_format', 'verbose_json')

  const res = await fetch(WHISPER_API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenAI Whisper error: ${err}`)
  }

  const data = await res.json()

  return {
    text: data.text || '',
    segments: (data.segments || []).map((s: any) => ({
      start: s.start,
      end: s.end,
      text: s.text,
    })),
    duration: data.duration || null,
    language: data.language || null,
  }
}
