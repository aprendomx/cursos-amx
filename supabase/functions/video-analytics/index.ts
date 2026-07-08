// supabase/functions/video-analytics/index.ts
// Edge Function para recibir batches de eventos de video e insertarlos
// en la tabla video_eventos (Fase J).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

export const EVENTOS_VALIDOS = [
  'play',
  'pause',
  'seek',
  'tick',
  'complete',
  'ratechange',
] as const

export const MAX_EVENTS = 100

export interface VideoEventInput {
  user_id: string
  leccion_id: string
  curso_id: string
  video_id?: string
  evento: string
  tiempo_video: number
  datos?: any
}

export interface ValidationResult {
  valid: boolean
  error?: string
  data?: VideoEventInput
}

export function validateEvent(event: any): ValidationResult {
  if (!event || typeof event !== 'object') {
    return { valid: false, error: 'evento debe ser un objeto' }
  }

  if (!event.user_id || typeof event.user_id !== 'string') {
    return { valid: false, error: 'user_id requerido' }
  }

  if (!event.leccion_id || typeof event.leccion_id !== 'string') {
    return { valid: false, error: 'leccion_id requerido' }
  }

  if (!event.curso_id || typeof event.curso_id !== 'string') {
    return { valid: false, error: 'curso_id requerido' }
  }

  if (!event.evento || typeof event.evento !== 'string') {
    return { valid: false, error: 'evento requerido' }
  }

  if (!EVENTOS_VALIDOS.includes(event.evento as any)) {
    return {
      valid: false,
      error: `evento inválido. Debe ser uno de: ${EVENTOS_VALIDOS.join(', ')}`,
    }
  }

  if (event.tiempo_video === undefined || event.tiempo_video === null) {
    return { valid: false, error: 'tiempo_video requerido' }
  }

  if (typeof event.tiempo_video !== 'number' || Number.isNaN(event.tiempo_video)) {
    return { valid: false, error: 'tiempo_video debe ser un número' }
  }

  if (event.tiempo_video < 0) {
    return { valid: false, error: 'tiempo_video debe ser >= 0' }
  }

  const validEvent: VideoEventInput = {
    user_id: event.user_id,
    leccion_id: event.leccion_id,
    curso_id: event.curso_id,
    evento: event.evento,
    tiempo_video: Math.floor(event.tiempo_video),
  }

  if (event.video_id && typeof event.video_id === 'string') {
    validEvent.video_id = event.video_id
  }

  if (event.datos !== undefined) {
    validEvent.datos = event.datos
  }

  return { valid: true, data: validEvent }
}

export interface ParseResult {
  events: VideoEventInput[]
  errors: string[]
}

export function parseEvents(body: any): ParseResult {
  if (!body || !Array.isArray(body.events)) {
    return { events: [], errors: ['events debe ser un array'] }
  }

  if (body.events.length > MAX_EVENTS) {
    return {
      events: [],
      errors: [`Límite de ${MAX_EVENTS} eventos excedido`],
    }
  }

  const events: VideoEventInput[] = []
  const errors: string[] = []

  for (let i = 0; i < body.events.length; i++) {
    const result = validateEvent(body.events[i])
    if (result.valid && result.data) {
      events.push(result.data)
    } else {
      errors.push(`Evento ${i}: ${result.error}`)
    }
  }

  return { events, errors }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Método no permitido' }),
      {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return new Response(
      JSON.stringify({ error: 'JSON inválido' }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  const { events, errors } = parseEvents(body)

  if (errors.length > 0 && events.length === 0) {
    return new Response(
      JSON.stringify({ error: errors[0] }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  if (events.length === 0) {
    return new Response(
      JSON.stringify({ inserted: 0 }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const rows = events.map((ev) => ({
      user_id: ev.user_id,
      leccion_id: ev.leccion_id,
      curso_id: ev.curso_id,
      video_id: ev.video_id ?? null,
      evento: ev.evento,
      tiempo_video: ev.tiempo_video,
      datos: ev.datos ?? null,
    }))

    const { error } = await supabase.from('video_eventos').insert(rows)

    if (error) {
      console.error('Error insertando eventos:', error)
      return new Response(
        JSON.stringify({ error: error.message }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    return new Response(
      JSON.stringify({ inserted: events.length }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Error en video-analytics:', error)
    return new Response(
      JSON.stringify({ error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
