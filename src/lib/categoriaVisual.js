// Pastel de categoría de un curso (dirección «hábito con recompensa»):
// el catálogo se reconoce por color antes que por texto.
//
// La maqueta habla de categorías TEMÁTICAS (red, datos, seguridad, personas),
// pero `cursos` no tiene ese campo: el único eje real del esquema es `nivel`
// (001_base.sql, check Fundamental/Intermedio/Avanzado). Derivar del título
// sería inventar datos, así que el pastel sigue al nivel. Si algún día entra
// `cursos.categoria`, este módulo es el único sitio que hay que re-apuntar.
const POR_NIVEL = {
  Fundamental: 'datos',
  Intermedio: 'red',
  Avanzado: 'seguridad',
}

/**
 * Clave del pastel (`datos`, `red`, `seguridad`, `personas`) para un curso.
 * Los tokens `--cat-<clave>` / `--sobre-cat-<clave>` viven en main.css y las
 * clases `.pastel-<clave>` aplican el par completo.
 */
export function categoriaVisual(curso) {
  return POR_NIVEL[curso?.nivel] || 'personas'
}

/** Inicial de portada: la primera letra del título, en mayúscula. */
export function inicialPortada(titulo) {
  return (
    String(titulo || '')
      .trim()
      .charAt(0)
      .toUpperCase() || '?'
  )
}
