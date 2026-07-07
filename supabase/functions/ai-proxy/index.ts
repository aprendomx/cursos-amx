import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { action, payload } = await req.json()
    const apiKey = Deno.env.get('OPENAI_API_KEY') || ''
    
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'OPENAI_API_KEY no configurada' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let result = {}

    switch (action) {
      case 'generate_quiz': {
        const { tema, nivel, cantidad = 5 } = payload
        const prompt = `Genera ${cantidad} preguntas de opción múltiple sobre "${tema}" nivel ${nivel}.
Responde SOLO con un JSON válido en este formato exacto:
{
  "preguntas": [
    {
      "enunciado": "...",
      "opciones": ["a", "b", "c", "d"],
      "respuesta_correcta": 0,
      "explicacion": "..."
    }
  ]
}`
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 2000,
          }),
        })
        const data = await response.json()
        const content = data.choices?.[0]?.message?.content || ''
        // Extraer JSON del contenido
        const jsonMatch = content.match(/\{[\s\S]*\}/)
        result = jsonMatch ? JSON.parse(jsonMatch[0]) : { error: 'No se pudo parsear respuesta' }
        break
      }

      case 'summarize': {
        const { content, contentType } = payload
        const prompt = contentType === 'video'
          ? `Resume el siguiente transcript de video educativo en 5 bullet points claros y concisos:\n\n${content}`
          : `Resume el siguiente texto educativo en 5 bullet points claros y concisos:\n\n${content}`
        
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.5,
            max_tokens: 1000,
          }),
        })
        const data = await response.json()
        result = { summary: data.choices?.[0]?.message?.content || '' }
        break
      }

      case 'chat': {
        const { message, context, history } = payload
        const messages = [
          { role: 'system', content: `Eres un asistente de estudio útil. Responde basándote ÚNICAMENTE en el siguiente contenido del curso. Si no puedes responder con el contenido proporcionado, di "No tengo suficiente información para responder eso."\n\nContexto del curso:\n${context}` },
          ...history.map((h) => ({ role: h.role, content: h.content })),
          { role: 'user', content: message },
        ]
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages,
            temperature: 0.7,
            max_tokens: 1500,
          }),
        })
        const data = await response.json()
        result = { response: data.choices?.[0]?.message?.content || '' }
        break
      }

      default:
        return new Response(JSON.stringify({ error: 'Acción no válida' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
