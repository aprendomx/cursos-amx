// supabase/functions/bulk-invite/index.ts
// Invita múltiples usuarios por email usando service_role.
// Body: { users: [{ email, password?, data: { nombres, apellido_paterno, ... } }] }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { users } = await req.json()
    if (!Array.isArray(users) || users.length === 0) {
      return new Response(JSON.stringify({ error: 'users array required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const results = []
    for (const u of users) {
      const { email, password, data } = u
      try {
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email,
          password: password || Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2),
          email_confirm: true,
          user_metadata: data || {},
        })
        if (authError) throw authError

        // Crear perfil
        if (data) {
          await supabaseAdmin.from('perfiles').insert({
            id: authData.user.id,
            nombres: data.nombres || '',
            apellido_paterno: data.apellido_paterno || '',
            apellido_materno: data.apellido_materno || '',
            correo: email,
            telefono_movil: data.telefono || '',
            dependencia_id: data.dependencia_id || null,
            cargo: data.cargo || '',
            es_admin: false,
            aviso_privacidad: true,
          })
        }

        results.push({ email, status: 'ok', user_id: authData.user.id })
      } catch (e) {
        results.push({ email, status: 'error', error: e.message })
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
