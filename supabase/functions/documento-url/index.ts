import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { checkRateLimit, rateLimitResponse } from '../_shared/rateLimit.ts'
import { esJwtDeUsuario, esPrimeraLeccionAbierta } from '../_shared/leccionAbierta.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const PUBLIC_URL = Deno.env.get('SUPABASE_PUBLIC_URL') || SUPABASE_URL
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const DOCS_BUCKET = Deno.env.get('DOCS_BUCKET') || 'lesson-docs'
const SIGNED_TTL = Number(Deno.env.get('DOC_SIGNED_TTL_SECONDS') || 4 * 3600)

function toPublic(url: string): string {
  return PUBLIC_URL === SUPABASE_URL ? url : url.replace(SUPABASE_URL, PUBLIC_URL)
}

serve(async (req) => {
  const rl = await checkRateLimit(req, {
    scope: 'documento-url',
    max: 60,
    ventanaSeg: 60,
    client: createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    ),
  })
  if (!rl.allowed) {
    return rateLimitResponse(rl, corsHeaders)
  }

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    if (!jwt) return json({ error: 'unauthorized' }, 401)

    const { leccion_id } = await req.json()
    if (!leccion_id) return json({ error: 'leccion_id required' }, 400)

    // Sin sesión (el Bearer es la anon key): SOLO el documento de la primera
    // lección de un curso publicado, verificado con el service role. Todo lo
    // demás sigue en 401 (change portada-cursos-primero, decisión 4).
    if (!esJwtDeUsuario(jwt)) {
      return await responderInvitado(leccion_id)
    }

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    })
    const { data, error } = await userClient.rpc('get_documento_acceso', {
      p_leccion_id: leccion_id,
    })

    if (error) {
      const msg = String(error.message || '')
      if (/unauthorized|jwt/i.test(msg)) return json({ error: 'unauthorized' }, 401)
      if (/forbidden/i.test(msg)) return json({ error: 'forbidden' }, 403)
      if (/no encontrado/i.test(msg)) return json({ error: 'no encontrado' }, 404)
      return json({ error: msg }, 500)
    }
    const row = Array.isArray(data) ? data[0] : data
    if (!row?.documento_path) return json({ error: 'no encontrado' }, 404)

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE)
    const { data: signed, error: signErr } = await admin.storage
      .from(DOCS_BUCKET)
      .createSignedUrl(row.documento_path, SIGNED_TTL)
    if (signErr) return json({ error: signErr.message }, 500)

    return json({
      signed_url: toPublic(signed.signedUrl),
      documento_tipo: row.documento_tipo,
      titulo: row.titulo,
      expires_in: SIGNED_TTL,
    })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})

// Camino ANÓNIMO: misma respuesta que el autenticado, pero solo si la lección
// es la primera de un curso publicado. La consulta y la firma van con el
// service role; la regla vive en _shared/leccionAbierta.ts.
async function responderInvitado(leccionId: string): Promise<Response> {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE)

  if (!(await esPrimeraLeccionAbierta(admin, leccionId))) {
    return json({ error: 'unauthorized' }, 401)
  }

  const { data: lec } = await admin
    .from('lecciones')
    .select('documento_path, documento_tipo, titulo')
    .eq('id', leccionId)
    .single()
  if (!lec?.documento_path) return json({ error: 'no encontrado' }, 404)

  const { data: signed, error: signErr } = await admin.storage
    .from(DOCS_BUCKET)
    .createSignedUrl(lec.documento_path, SIGNED_TTL)
  if (signErr) return json({ error: signErr.message }, 500)

  return json({
    signed_url: toPublic(signed.signedUrl),
    documento_tipo: lec.documento_tipo,
    titulo: lec.titulo,
    expires_in: SIGNED_TTL,
  })
}

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json', ...extraHeaders },
  })
}
