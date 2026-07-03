import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { checkRateLimit } from '../_shared/rateLimit.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const MIN_PASSWORD = 8

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

    // Cliente con service_role: lo usamos para (a) identificar al que llama,
    // (b) verificar que es admin y (c) cambiar la contraseña del objetivo.
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE)

    // 1) Identificar al que llama a partir de su JWT.
    const { data: caller, error: callerErr } = await admin.auth.getUser(jwt)
    if (callerErr || !caller?.user) return json({ error: 'unauthorized' }, 401)

    // 2) Exigir es_admin = true. NUNCA se confía en el cliente.
    const { data: perfil, error: perfilErr } = await admin
      .from('perfiles')
      .select('es_admin')
      .eq('id', caller.user.id)
      .single()
    if (perfilErr) return json({ error: 'forbidden' }, 403)
    if (perfil?.es_admin !== true) return json({ error: 'forbidden' }, 403)

    // 3) Validar entrada.
    const { user_id, new_password } = await req.json()
    if (!user_id) return json({ error: 'user_id requerido' }, 400)
    const pwd = String(new_password ?? '')
    if (pwd.length < MIN_PASSWORD) {
      return json({ error: `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres` }, 400)
    }

    // 4) Aplicar el cambio. (La contraseña jamás se loguea.)
    const { error: updErr } = await admin.auth.admin.updateUserById(user_id, {
      password: pwd,
    })
    if (updErr) return json({ error: updErr.message }, 500)

    return json({ ok: true })
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
