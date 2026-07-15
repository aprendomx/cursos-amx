// supabase/functions/bulk-invite/handler.ts
// Invita múltiples usuarios por email usando service_role.
// Solo admins: crear cuentas es una operación administrativa.
// Body: { users: [{ email, password?, data: { nombres, apellido_paterno, ... } }] }

import { corsHeaders } from '../_shared/cors.ts'
import { authorize, authErrorResponse } from '../_shared/auth.ts'

export function createHandler(clientFactory: () => any) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders })
    }

    try {
      const supabaseAdmin = clientFactory()

      const auth = await authorize(req, supabaseAdmin, { anyOf: ['admin'] })
      if (!auth.ok) return authErrorResponse(auth)

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
          const message = e instanceof Error ? e.message : String(e)
          results.push({ email, status: 'error', error: message })
        }
      }

      return new Response(JSON.stringify({ results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }
}
