import { supabase } from '@/lib/supabase.js'

// Catálogo de módulos conmutables. El orden y la agrupación son los de la
// pantalla de administración; las claves son las de public.feature_toggles.
//
// `datos: true` marca los módulos cuyo apagado CIERRA sus tablas (políticas
// restrictivas de la migración 063). El resto solo ocultan interfaz.
export const MODULOS = [
  {
    grupo: 'Interacción',
    flags: [
      { key: 'foros', label: 'Foros por curso', datos: true },
      { key: 'chat', label: 'Chat en vivo', datos: true },
      { key: 'entregas', label: 'Entregas de archivos', datos: true },
      { key: 'entregas_rubricas', label: 'Rúbricas en entregas' },
      { key: 'rubrics', label: 'Gestión de rúbricas' },
    ],
  },
  {
    grupo: 'Aulas virtuales',
    flags: [
      { key: 'sesiones_virtuales', label: 'Sesiones virtuales', datos: true },
      { key: 'aulas', label: 'Aulas (Jitsi)' },
      { key: 'zoom_integration', label: 'Integración con Zoom' },
      { key: 'sesiones_grabaciones', label: 'Grabaciones de sesión' },
      { key: 'transcripcion_whisper', label: 'Transcripción automática' },
    ],
  },
  {
    grupo: 'Evaluación',
    flags: [
      { key: 'evaluaciones', label: 'Evaluaciones' },
      { key: 'advanced_quizzes', label: 'Tipos de pregunta avanzados' },
      { key: 'cohorts', label: 'Cohortes', datos: true },
    ],
  },
  {
    grupo: 'Seguimiento',
    flags: [
      { key: 'analytics', label: 'Analytics', datos: true },
      { key: 'risk_dashboard', label: 'Tablero de riesgo' },
      { key: 'video_analytics', label: 'Analytics de video', datos: true },
      { key: 'video_analytics_heatmap', label: 'Mapa de calor de video' },
      { key: 'reportes_avanzados', label: 'Reportes avanzados' },
      { key: 'downloadable_reports', label: 'Reportes descargables' },
      { key: 'gamificacion', label: 'Gamificación' },
    ],
  },
  {
    grupo: 'Notificaciones',
    flags: [
      { key: 'notificaciones', label: 'Notificaciones en la aplicación' },
      { key: 'notificaciones_email', label: 'Notificaciones por correo' },
      { key: 'push_notifications', label: 'Notificaciones push' },
    ],
  },
  {
    grupo: 'Sin conexión (PWA)',
    flags: [
      { key: 'pwa_offline', label: 'Modo sin conexión' },
      { key: 'offline_video_cache', label: 'Descarga de video' },
      { key: 'offline_sync', label: 'Sincronización diferida' },
    ],
  },
  {
    grupo: 'Inteligencia artificial',
    flags: [
      { key: 'ai_quiz_generator', label: 'Generador de cuestionarios' },
      { key: 'ai_summaries', label: 'Resúmenes de lección', datos: true },
      { key: 'ai_study_assistant', label: 'Asistente de estudio' },
    ],
  },
  {
    grupo: 'Administración',
    flags: [
      { key: 'instructor', label: 'Panel de instructor' },
      { key: 'bulk_user_import', label: 'Alta masiva de usuarios' },
    ],
  },
]

export async function listarFlags() {
  const { data, error } = await supabase
    .from('feature_toggles')
    .select('key, enabled, updated_at')
    .order('key')
  if (error) throw error
  return data || []
}

export async function cambiarFlag(key, enabled) {
  const { error } = await supabase
    .from('feature_toggles')
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq('key', key)
  if (error) throw error
}
