// supabase/functions/push-notify/handler.ts
// Edge Function: envía notificaciones push Web Push a las suscripciones de un usuario.

import { corsHeaders } from '../_shared/cors.ts'
import { authorize, authErrorResponse } from '../_shared/auth.ts'
// @ts-ignore: esm.sh envuelve el módulo CJS con un export default que
// los types de @types/web-push no declaran.
import webPush from 'https://esm.sh/web-push@3.6.7'

export function createHandler(clientFactory: () => any) {
  return async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = clientFactory()

    const auth = await authorize(req, supabaseAdmin)
    if (!auth.ok) return authErrorResponse(auth)

    const { userId: bodyUserId, title, body, url } = await req.json()
    // El destino se deriva del usuario autenticado; solo un admin puede
    // enviar push a otro usuario.
    const userId =
      auth.roles?.es_admin === true && bodyUserId ? bodyUserId : auth.user!.id
    if (bodyUserId && bodyUserId !== userId) {
      return new Response(
        JSON.stringify({ error: 'forbidden' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }
    if (!title) {
      return new Response(
        JSON.stringify({ error: 'title es requerido' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY') || ''
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@example.com'

    if (!vapidPrivateKey) {
      return new Response(
        JSON.stringify({ error: 'VAPID_PRIVATE_KEY no configurada' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    webPush.setVapidDetails(vapidSubject, Deno.env.get('VAPID_PUBLIC_KEY') || '', vapidPrivateKey)

    const { data: subscriptions, error: fetchError } = await supabaseAdmin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', userId)

    if (fetchError) {
      return new Response(
        JSON.stringify({ error: fetchError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0 }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const payload = JSON.stringify({ title, body, url })
    let sent = 0
    const expiredIds: string[] = []

    for (const sub of subscriptions) {
      try {
        await webPush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          payload,
        )
        sent++
      } catch (err: any) {
        const statusCode = err.statusCode || err.status || 0
        if (statusCode === 410 || statusCode === 404) {
          expiredIds.push(sub.id)
        } else {
          console.error(`[push-notify] error enviando a ${sub.endpoint}:`, err.message)
        }
      }
    }

    if (expiredIds.length > 0) {
      const { error: deleteError } = await supabaseAdmin
        .from('push_subscriptions')
        .delete()
        .in('id', expiredIds)
      if (deleteError) {
        console.error('[push-notify] error al eliminar suscripciones expiradas:', deleteError.message)
      }
    }

    return new Response(
      JSON.stringify({ sent }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
  }
}
