// src/lib/colorCanvas.js
// Resuelve variables CSS a un color concreto, para dibujar en <canvas>.
//
// Por qué existe: el contexto 2D de un canvas NO entiende `var(--primary)`.
// Asignarle esa cadena es un no-op silencioso —comprobado en navegador: el
// valor anterior se conserva—, así que la gráfica acababa pintándose con los
// colores por defecto de la librería en lugar de los de la institución. Y en
// modo oscuro, las etiquetas de los ejes quedaban oscuras sobre fondo oscuro.
//
// Falla en silencio y en el lado equivocado: la gráfica se ve, solo que con el
// color que no es. Por eso conviene resolver aquí y no confiar en el canvas.

/**
 * @param {string} valor  'var(--primary)', '#abc123' o cualquier color CSS
 * @param {Element} [raiz] elemento del que leer las variables
 * @returns {string} un color que el canvas sí entiende
 */
export function resolverColor(valor, raiz = document.documentElement) {
  const v = String(valor || '').trim()
  const m = v.match(/^var\(\s*(--[^,)]+?)\s*(?:,\s*(.+))?\)$/)
  if (!m) return v

  const resuelto = getComputedStyle(raiz).getPropertyValue(m[1]).trim()
  if (resuelto) {
    // El valor puede ser a su vez otra variable.
    return resuelto.startsWith('var(') ? resolverColor(resuelto, raiz) : resuelto
  }
  return m[2] ? resolverColor(m[2].trim(), raiz) : v
}

/** Aplica resolverColor a cada valor de un objeto plano de colores. */
export function resolverColores(mapa, raiz) {
  return Object.fromEntries(Object.entries(mapa).map(([k, v]) => [k, resolverColor(v, raiz)]))
}
