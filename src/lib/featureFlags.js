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

function flag(name, porDefecto = false) {
  const raw = import.meta.env[name]
  if (raw === undefined || raw === '') return porDefecto
  return raw === true || raw === 'true' || raw === '1'
}

export const FEATURES = {
  instructor: flag('VITE_FEATURE_INSTRUCTOR', true),
  foros: flag('VITE_FEATURE_FOROS'),
  chat: flag('VITE_FEATURE_CHAT'),
  entregas: flag('VITE_FEATURE_ENTREGAS'),
  aulas: flag('VITE_FEATURE_AULAS'),
  evaluaciones: flag('VITE_FEATURE_EVALUACIONES'),
}

export function featureEnabled(nombre) {
  return FEATURES[nombre] === true
}
