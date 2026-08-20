// Sustitución de marcadores en los textos de constancia.
//
// Los textos son configurables por curso y admiten marcadores del tipo
// {{nombre}}. Se resuelven aquí, en un solo sitio, porque los usan tanto la
// constancia real como la previsualización del panel: si divergieran, el
// administrador configuraría a ciegas.

/** Marcadores admitidos, para documentar en la interfaz. */
export const MARCADORES = [
  { clave: 'nombre', descripcion: 'Nombre completo de quien recibe' },
  { clave: 'curso', descripcion: 'Título del curso' },
  { clave: 'duracion', descripcion: 'Duración del curso' },
  { clave: 'fecha', descripcion: 'Fecha de emisión, en letra' },
  { clave: 'folio', descripcion: 'Folio de la constancia' },
]

/**
 * Sustituye {{marcador}} por su valor.
 *
 * Un marcador desconocido se deja tal cual en lugar de vaciarse: si alguien
 * escribe {{nombres}} por error, verlo en la previsualización dice qué pasó,
 * mientras que un hueco vacío parecería un dato faltante.
 */
export function aplicarMarcadores(texto, valores = {}) {
  if (typeof texto !== 'string' || !texto) return ''
  return texto.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (completo, clave) => {
    const v = valores[clave]
    return v === undefined || v === null || v === '' ? completo : String(v)
  })
}

/** Marcadores usados en un texto que no existen. Para avisar al configurar. */
export function marcadoresDesconocidos(texto) {
  if (typeof texto !== 'string') return []
  const validos = new Set(MARCADORES.map((m) => m.clave))
  const usados = [...texto.matchAll(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g)].map((m) => m[1])
  return [...new Set(usados.filter((u) => !validos.has(u)))]
}

/**
 * Configuración efectiva de una constancia ya emitida.
 *
 * Prioriza SIEMPRE lo congelado en la fila: una constancia impresa no puede
 * cambiar porque se edite el catálogo después. El fallback solo cubre las
 * constancias emitidas antes de la migración 070, que no tienen congelado.
 */
export function configDeConstancia(constancia, respaldo = {}) {
  const textos = constancia?.textos || {}
  return {
    diseno: constancia?.diseno || respaldo.diseno || null,
    firmantes: Array.isArray(constancia?.firmantes)
      ? constancia.firmantes
      : respaldo.firmantes || [],
    lugar: textos.lugar ?? respaldo.lugar ?? '',
    textoPre: textos.texto_pre ?? respaldo.texto_pre ?? 'Otorga el presente',
    textoTitulo: textos.texto_titulo ?? respaldo.texto_titulo ?? 'CONSTANCIA',
    textoCuerpo: textos.texto_cuerpo ?? respaldo.texto_cuerpo ?? '',
  }
}
