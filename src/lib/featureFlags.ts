// Feature flags de los módulos LMS.
//
// FUENTE ÚNICA: la tabla `feature_toggles` de la base. Las variables
// VITE_FEATURE_* siguen existiendo, pero solo como valor por defecto para el
// arranque y como red de seguridad si la consulta a la base falla; en cuanto
// llegan los flags de runtime, mandan ellos.
//
// El apagado es REAL, no cosmético: además de no montar la ruta ni la UI, las
// políticas RESTRICTIVAS de la migración 063 cierran las tablas del módulo.
// Un módulo apagado no es alcanzable por PostgREST aunque alguien construya
// la petición a mano.
//
// Cambiar un flag NO requiere rebuild: el administrador lo hace desde el
// panel (Administración → Módulos), y toda sesión nueva lo recoge.
//
// Defaults de arranque vía variables de entorno de Vite (.env / .env.local);
// ver la tabla completa en THEMING.md §5.

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
  sesiones_virtuales: flag('VITE_FEATURE_SESIONES_VIRTUALES'),
  zoom_integration: flag('VITE_FEATURE_ZOOM_INTEGRATION'),
  sesiones_grabaciones: flag('VITE_FEATURE_SESIONES_GRABACIONES'),
  transcripcion_whisper: flag('VITE_FEATURE_TRANSCRIPCION_WHISPER'),
}

// Flags traídos de `feature_toggles`. null = todavía no han llegado.
let runtimeFlags: Record<string, boolean> | null = null

/** La cargan useFeatureFlags/loadFeatureFlags al arrancar. */
export function setRuntimeFlags(flags: Record<string, boolean> | null): void {
  runtimeFlags = flags
}

export function getRuntimeFlags(): Record<string, boolean> | null {
  return runtimeFlags
}

/**
 * ¿Está encendido el módulo? Runtime primero, build-time como respaldo.
 *
 * Es síncrona a propósito: la usan ~90 sitios en plantillas y guards. Por eso
 * main.js espera a loadFeatureFlags() ANTES de montar la aplicación — si no,
 * el primer render usaría los defaults de build y podría pintar un módulo que
 * la base tiene apagado (y cuyas tablas van a devolver 403).
 */
export function featureEnabled(nombre: string): boolean {
  if (runtimeFlags && nombre in runtimeFlags) return runtimeFlags[nombre] === true
  return FEATURES[nombre] === true
}
