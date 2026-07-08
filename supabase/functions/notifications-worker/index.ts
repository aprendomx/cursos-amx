// supabase/functions/notifications-worker/index.ts
// Edge Function: procesa notificaciones pendientes y las envía por push/email.
// Se invoca cada minuto vía pg_cron.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import webPush from 'https://esm.sh/web-push@3.6.7'

const BATCH_SIZE = 50

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // 1. Leer lote de notificaciones pendientes
    const { data: notificaciones, error: fetchError } = await supabaseAdmin
      .from('notificaciones')
      .select('id, usuario_id, tipo, titulo, cuerpo, datos, canal, estado, creado_en')
      .eq('estado', 'pendiente')
      .order('creado_en', { ascending: true })
      .limit(BATCH_SIZE)

    if (fetchError) {
      console.error('[notifications-worker] error al leer notificaciones:', fetchError.message)
      return new Response(
        JSON.stringify({ error: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (!notificaciones || notificaciones.length === 0) {
      return new Response(
        JSON.stringify({ processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Precargar configuración de email (singleton)
    const emailConfig = await loadEmailConfig(supabaseAdmin)

    // Configurar VAPID una sola vez por invocación
    const vapidPublicKey = Deno.env.get('VITE_VAPID_PUBLIC_KEY') || Deno.env.get('VAPID_PUBLIC_KEY') || ''
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY') || ''
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@example.com'
    if (vapidPublicKey && vapidPrivateKey) {
      webPush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)
    }

    let processed = 0
    const results: { id: string; status: string; error?: string }[] = []

    for (const notif of notificaciones) {
      try {
        const result = await processNotification(supabaseAdmin, notif, emailConfig)
        processed++
        results.push({ id: notif.id, status: result })
        } catch (err) {
        console.error(`[notifications-worker] error procesando notificación ${notif.id}:`, (err as Error).message)
        try {
          await supabaseAdmin
            .from('notificaciones')
            .update({ estado: 'fallido', enviado_en: new Date().toISOString() })
            .eq('id', notif.id)
        } catch (updateErr) {
          console.error(`[notifications-worker] error al marcar fallido ${notif.id}:`, (updateErr as Error).message)
        }
        results.push({ id: notif.id, status: 'fallido', error: (err as Error).message })
      }
    }

    return new Response(
      JSON.stringify({ processed, batch_size: notificaciones.length, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e: any) {
    console.error('[notifications-worker] error general:', e.message)
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

// ───────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────

export async function loadEmailConfig(supabase: any) {
  const { data, error } = await supabase
    .from('email_configuracion')
    .select('id, proveedor, api_key, remitente_email, remitente_nombre, activo')
    .eq('id', 1)
    .single()

  if (error) {
    console.error('[notifications-worker] error al cargar email_configuracion:', error.message)
    return null
  }
  return data
}

export async function processNotification(
  supabase: any,
  notif: any,
  emailConfig: any,
): Promise<'enviado' | 'fallido' | 'silenciado'> {
  // 2. Cargar preferencias del usuario
  const { data: pref } = await supabase
    .from('notificacion_preferencias')
    .select('silenciados, canal_default')
    .eq('usuario_id', notif.usuario_id)
    .single()

  // Si el tipo está silenciado, marcar como enviado y saltar
  if (pref && pref.silenciados && pref.silenciados.includes(notif.tipo)) {
    await supabase
      .from('notificaciones')
      .update({ estado: 'enviado', enviado_en: new Date().toISOString() })
      .eq('id', notif.id)
    return 'silenciado'
  }

  // 3. Determinar canal efectivo
  let canal = notif.canal
  if (canal === 'all') {
    canal = pref?.canal_default ?? 'in_app'
  }

  let pushOk = true
  let emailOk = true

  // 4. Enviar push si aplica
  if (canal === 'push' || canal === 'all') {
    pushOk = await sendPush(supabase, notif)
  }

  // 5. Enviar email si aplica
  if (canal === 'email' || canal === 'all') {
    emailOk = await sendEmail(supabase, notif, emailConfig)
  }

  // 6. Actualizar estado
  const estadoFinal = pushOk && emailOk ? 'enviado' : 'fallido'
  const { error: updateError } = await supabase
    .from('notificaciones')
    .update({ estado: estadoFinal, enviado_en: new Date().toISOString() })
    .eq('id', notif.id)

  if (updateError) {
    throw new Error(`Error al actualizar estado: ${updateError.message}`)
  }

  return estadoFinal
}

export async function sendPush(supabase: any, notif: any): Promise<boolean> {
  const vapidPublicKey = Deno.env.get('VITE_VAPID_PUBLIC_KEY') || Deno.env.get('VAPID_PUBLIC_KEY') || ''
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY') || ''

  if (!vapidPublicKey || !vapidPrivateKey) {
    console.warn('[notifications-worker] VAPID keys no configuradas, saltando push')
    return true // No es un error de la notificación, es configuración faltante
  }

  const { data: subscriptions, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', notif.usuario_id)

  if (error) {
    console.error('[notifications-worker] error al leer push_subscriptions:', error.message)
    return false
  }

  if (!subscriptions || subscriptions.length === 0) {
    return true // No hay suscripciones no es error
  }

  const payload = JSON.stringify({
    title: notif.titulo,
    body: notif.cuerpo,
    data: { url: '/', ...(notif.datos || {}) },
  })

  const expiredIds: string[] = []
  let anySuccess = false
  let anyFailure = false

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
      anySuccess = true
    } catch (err) {
      const statusCode = (err as any).statusCode || (err as any).status || 0
      if (statusCode === 410 || statusCode === 404) {
        expiredIds.push(sub.id)
      } else {
        console.error(`[notifications-worker] error enviando push a ${sub.endpoint}:`, (err as Error).message)
        anyFailure = true
      }
    }
  }

  // Limpiar suscripciones expiradas
  if (expiredIds.length > 0) {
    const { error: deleteError } = await supabase
      .from('push_subscriptions')
      .delete()
      .in('id', expiredIds)
    if (deleteError) {
      console.error('[notifications-worker] error al eliminar suscripciones expiradas:', deleteError.message)
    }
  }

  // Si al menos un push se envió con éxito, consideramos exitoso
  // Si no hubo éxitos pero hubo fallos, reportamos fallo
  return anySuccess || !anyFailure
}

export async function sendEmail(supabase: any, notif: any, emailConfig: any): Promise<boolean> {
  if (!emailConfig || !emailConfig.activo || !emailConfig.api_key) {
    return true // Email no configurado no es error
  }

  if (emailConfig.proveedor !== 'resend') {
    console.warn(`[notifications-worker] proveedor de email '${emailConfig.proveedor}' no soportado, saltando`)
    return true // Proveedor no soportado no es error de la notificación
  }

  // Cargar email del usuario
  const { data: perfil, error: perfilError } = await supabase
    .from('perfiles')
    .select('correo, nombres, apellido_paterno')
    .eq('id', notif.usuario_id)
    .single()

  if (perfilError) {
    console.error('[notifications-worker] error al leer perfil:', perfilError.message)
    return false
  }

  if (!perfil || !perfil.correo) {
    console.warn(`[notifications-worker] usuario ${notif.usuario_id} sin correo`)
    return true // Sin correo no es error fatal
  }

  const html = buildEmailHtml(notif, perfil)

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${emailConfig.api_key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${emailConfig.remitente_nombre} <${emailConfig.remitente_email}>`,
        to: perfil.correo,
        subject: notif.titulo,
        html,
      }),
    })

    if (!res.ok) {
      const errBody = await res.text()
      console.error(`[notifications-worker] Resend API error ${res.status}:`, errBody)
      return false
    }

    return true
  } catch (err) {
    console.error('[notifications-worker] error al enviar email:', (err as Error).message)
    return false
  }
}

export function buildEmailHtml(notif: any, perfil: any): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(notif.titulo)}</title>
</head>
<body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #333; max-width: 600px; margin: 0 auto; padding: 24px;">
  <h2>${escapeHtml(notif.titulo)}</h2>
  <p>Hola ${escapeHtml(perfil.nombres || '')},</p>
  <p>${escapeHtml(notif.cuerpo || '')}</p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
  <p style="font-size: 12px; color: #888;">
    Este mensaje fue enviado automáticamente por Cursos AMX.
  </p>
</body>
</html>`
}

export function escapeHtml(text: string): string {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
