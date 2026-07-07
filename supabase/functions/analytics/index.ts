// supabase/functions/analytics/index.ts
// Edge Function para reportes administrativos avanzados (Fase H1).
// Acciones: reporte_csv, funnel, retencion, comparativa.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const body = await req.json()
    const { action } = body

    switch (action) {
      case 'reporte_csv': {
        const { tipo, curso_id, desde, hasta } = body
        const view = tipo === 'engagement' ? 'v_engagement_diario' : 'v_riesgo_alumno'
        let query = supabase.from(view).select('*')
        if (curso_id) query = query.eq('curso_id', curso_id)
        if (desde && tipo === 'engagement') query = query.gte('fecha', desde)
        if (hasta && tipo === 'engagement') query = query.lte('fecha', hasta)

        const { data, error } = await query
        if (error) throw error

        const csv = rowsToCsv(data || [])
        return new Response(csv, {
          headers: { ...corsHeaders, 'Content-Type': 'text/csv' },
        })
      }

      case 'funnel': {
        const { curso_id } = body
        const { data, error } = await supabase
          .from('v_funnel_curso')
          .select('*')
          .eq('curso_id', curso_id)
          .single()

        if (error) throw error

        const funnel = data || {
          visitantes: 0,
          registrados: 0,
          inscritos: 0,
          activos: 0,
          completados: 0,
        }

        const conversiones = {
          registrados_pct:
            funnel.visitantes > 0
              ? Math.round((funnel.registrados / funnel.visitantes) * 1000) / 10
              : 0,
          inscritos_pct:
            funnel.registrados > 0
              ? Math.round((funnel.inscritos / funnel.registrados) * 1000) / 10
              : 0,
          activos_pct:
            funnel.inscritos > 0
              ? Math.round((funnel.activos / funnel.inscritos) * 1000) / 10
              : 0,
          completados_pct:
            funnel.activos > 0
              ? Math.round((funnel.completados / funnel.activos) * 1000) / 10
              : 0,
        }

        return new Response(JSON.stringify({ ...funnel, conversiones }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'retencion': {
        const { curso_id } = body
        const { data, error } = await supabase
          .from('v_retencion_cohorte')
          .select('*')
          .eq('curso_id', curso_id)
          .order('semana', { ascending: false })

        if (error) throw error

        const cohortes = (data || []).map((row: any) => ({
          semana: row.semana,
          total: row.total_inscritos,
          d7: row.activos_d7,
          d14: row.activos_d14,
          d30: row.activos_d30,
          d60: row.activos_d60,
          d90: row.activos_d90,
          pcts: {
            d7: row.pct_d7,
            d14: row.pct_d14,
            d30: row.pct_d30,
            d60: row.pct_d60,
            d90: row.pct_d90,
          },
        }))

        return new Response(JSON.stringify({ cohortes }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'comparativa': {
        const { data, error } = await supabase
          .from('v_comparativa_cursos')
          .select('*')
          .order('total_inscritos', { ascending: false })

        if (error) throw error

        const cursos = (data || []).map((row: any) => ({
          curso_id: row.curso_id,
          curso_titulo: row.titulo,
          total_inscritos: row.total_inscritos,
          total_completados: row.total_completados,
          tasa_finalizacion: row.tasa_finalizacion,
          engagement_promedio: row.engagement_promedio,
          calificacion_promedio: row.calificacion_promedio,
          dias_promedio_completar: row.dias_promedio_completar,
        }))

        return new Response(JSON.stringify({ cursos }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      default:
        return new Response(JSON.stringify({ error: 'Acción no válida' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

function rowsToCsv(rows: any[]): string {
  if (!rows || rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const lines = [
    headers.join(','),
    ...rows.map((row) =>
      headers
        .map((h) => {
          const val = row[h]
          if (val === null || val === undefined) return ''
          const str = String(val)
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`
          }
          return str
        })
        .join(',')
    ),
  ]
  return lines.join('\n')
}
