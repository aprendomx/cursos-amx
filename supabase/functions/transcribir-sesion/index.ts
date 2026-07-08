// supabase/functions/transcribir-sesion/index.ts
// Descarga audio de una grabación, llama OpenAI Whisper API,
// guarda la transcripción en sesiones_transcripciones.
// Se invoca desde zoom-webhook o manualmente por admin.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const WHISPER_API_URL = 'https://api.openai.com/v1/audio/transcriptions'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { sesion_id, grabacion_id, audio_url } = await req.json()
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

    // Descargar audio
    const audioRes = await fetch(audio_url)
    if (!audioRes.ok) {
      throw new Error(`Error descargando audio: ${audioRes.status}`)
    }

    const audioBlob = await audioRes.blob()

    // Llamar Whisper
    const apiKey = Deno.env.get('OPENAI_API_KEY')
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY no configurada')
    }

    const formData = new FormData()
    formData.append('file', new File([audioBlob], 'audio.mp4', { type: 'audio/mp4' }))
    formData.append('model', 'whisper-1')
    formData.append('language', 'es')
    formData.append('response_format', 'verbose_json')

    const whisperRes = await fetch(WHISPER_API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    })

    if (!whisperRes.ok) {
      const err = await whisperRes.text()
      throw new Error(`Whisper API error: ${err}`)
    }

    const whisperData = await whisperRes.json()

    // Calcular costo aproximado: $0.006 / minuto
    const duracionMin = whisperData.duration ? whisperData.duration / 60 : 0
    const costoUsd = duracionMin > 0 ? Math.round(duracionMin * 0.006 * 10000) / 10000 : null

    // Guardar transcripción
    const segmentos = (whisperData.segments || []).map((s: any) => ({
      start: s.start,
      end: s.end,
      text: s.text,
    }))

    const { error: updateError } = await supabaseAdmin
      .from('sesiones_transcripciones')
      .update({
        estado: 'completada',
        texto_completo: whisperData.text || '',
        segmentos,
        costo_usd: costoUsd,
      })
      .eq('id', tx.id)

    if (updateError) {
      throw new Error(`Error actualizando transcripción: ${updateError.message}`)
    }

    return new Response(
      JSON.stringify({ ok: true, transcripcion_id: tx.id, costo_usd: costoUsd }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e: any) {
    console.error('[transcribir-sesion] error:', e.message)

    // Intentar marcar como error en DB si tenemos sesion_id
    try {
      const body = await req.json().catch(() => ({}))
      if (body.sesion_id) {
        const supabaseAdmin = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        )
        await supabaseAdmin
          .from('sesiones_transcripciones')
          .update({ estado: 'error' })
          .eq('sesion_id', body.sesion_id)
      }
    } catch {
      // Ignorar errores de fallback
    }

    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
