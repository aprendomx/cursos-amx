// supabase/functions/zoom-webhook/index.ts
// Recibe webhooks de Zoom (recording.completed), descarga la grabación,
// la sube a Supabase Storage e inserta metadatos en sesiones_grabaciones.
// Luego invoca transcribir-sesión.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const event = body.event
    const payload = body.payload

    if (event !== 'recording.completed') {
      return new Response(
        JSON.stringify({ ok: true, ignored: event }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const meetingId = String(payload.object?.id)
    const recordingFiles = payload.object?.recording_files || []
    const videoFile = recordingFiles.find(
      (f: any) => f.file_type === 'MP4' && f.status === 'completed'
    )

    if (!videoFile) {
      return new Response(
        JSON.stringify({ ok: true, ignored: 'no_video' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // Buscar sesión por zoom_meeting_id
    const { data: sesion, error: sesionError } = await supabaseAdmin
      .from('sesiones_virtuales')
      .select('id, curso_id')
      .eq('zoom_meeting_id', meetingId)
      .single()

    if (sesionError || !sesion) {
      console.error('[zoom-webhook] sesión no encontrada para meeting', meetingId)
      return new Response(
        JSON.stringify({ error: 'Sesión no encontrada' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Descargar video
    const downloadToken = payload.object?.download_access_token || payload.download_token
    const videoRes = await fetch(videoFile.download_url, {
      headers: downloadToken ? { Authorization: `Bearer ${downloadToken}` } : {},
    })

    if (!videoRes.ok) {
      throw new Error(`Error descargando video: ${videoRes.status}`)
    }

    const videoBlob = await videoRes.blob()
    const filePath = `grabaciones/${sesion.curso_id}/${sesion.id}/${Date.now()}.mp4`

    // Subir a Storage
    const { error: uploadError } = await supabaseAdmin.storage
      .from('sesiones')
      .upload(filePath, videoBlob, {
        contentType: 'video/mp4',
        upsert: false,
      })

    if (uploadError) {
      throw new Error(`Error subiendo a Storage: ${uploadError.message}`)
    }

    // Obtener URL pública
    const { data: urlData } = supabaseAdmin.storage.from('sesiones').getPublicUrl(filePath)

    // Insertar metadatos
    const { data: grabacion, error: insertError } = await supabaseAdmin
      .from('sesiones_grabaciones')
      .insert({
        sesion_id: sesion.id,
        url_grabacion: urlData.publicUrl,
        duracion_segundos: videoFile.recording_duration || null,
        tamano_mb: videoFile.file_size ? Math.round((videoFile.file_size / 1024 / 1024) * 100) / 100 : null,
        estado: 'lista',
      })
      .select()
      .single()

    if (insertError) {
      throw new Error(`Error insertando grabación: ${insertError.message}`)
    }

    // Llamar a transcribir-sesión
    const transcribeUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/transcribir-sesion`
    const transcribeRes = await fetch(transcribeUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sesion_id: sesion.id,
        grabacion_id: grabacion.id,
        audio_url: urlData.publicUrl,
      }),
    })

    if (!transcribeRes.ok) {
      console.error('[zoom-webhook] error iniciando transcripción:', await transcribeRes.text())
    }

    return new Response(
      JSON.stringify({ ok: true, grabacion_id: grabacion.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e: any) {
    console.error('[zoom-webhook] error general:', e.message)
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
