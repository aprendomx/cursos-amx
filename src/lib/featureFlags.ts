// Feature flags de los módulos LMS. Cada módulo nuevo se puede apagar
// sin romper el resto: con el flag en false no se monta ni la ruta ni
// la UI; los objetos de base de datos quedan inertes.
//
// Se activan vía variables de entorno de Vite (.env / .env.local):
//   VITE_FEATURE_INSTRUCTOR=true
//   VITE_FEATURE_FOROS=true
//   VITE_FEATURE_CHAT=true
//   VITE_FEATURE_ENTREGAS=true
//   VITE_FEATURE_AULAS=true
//   VITE_FEATURE_EVALUACIONES=true

function flag(name: string, porDefecto = false): boolean {
  const raw = (import.meta as any).env[name]
  if (raw === undefined || raw === '') return porDefecto
  return raw === true || raw === 'true' || raw === '1'
}

export const FEATURES: Record<string, boolean> = {
  instructor: flag('VITE_FEATURE_INSTRUCTOR', true),
  foros: flag('VITE_FEATURE_FOROS'),
  chat: flag('VITE_FEATURE_CHAT'),
  entregas: flag('VITE_FEATURE_ENTREGAS'),
  entregas_rubricas: flag('VITE_FEATURE_ENTREGAS_RUBRICAS'),
  aulas: flag('VITE_FEATURE_AULAS'),
  evaluaciones: flag('VITE_FEATURE_EVALUACIONES'),
  gamificacion: flag('VITE_FEATURE_GAMIFICACION'),
  analytics: flag('VITE_FEATURE_ANALYTICS'),
  ai_quiz_generator: flag('VITE_FEATURE_AI_QUIZ'),
  ai_summaries: flag('VITE_FEATURE_AI_SUMMARIES'),
  ai_study_assistant: flag('VITE_FEATURE_AI_CHAT'),
  pwa_offline: flag('VITE_FEATURE_PWA_OFFLINE'),
  offline_video_cache: flag('VITE_FEATURE_OFFLINE_VIDEO_CACHE'),
  offline_sync: flag('VITE_FEATURE_OFFLINE_SYNC'),
  push_notifications: flag('VITE_FEATURE_PUSH_NOTIFICATIONS'),
  reportes_avanzados: flag('VITE_FEATURE_REPORTES_AVANZADOS'),
  notificaciones: flag('VITE_FEATURE_NOTIFICACIONES'),
  notificaciones_email: flag('VITE_FEATURE_NOTIFICACIONES_EMAIL'),
  video_analytics: flag('VITE_FEATURE_VIDEO_ANALYTICS'),
  video_analytics_heatmap: flag('VITE_FEATURE_VIDEO_ANALYTICS_HEATMAP'),
}

export function featureEnabled(nombre: string): boolean {
  return FEATURES[nombre] === true
}
